/**
 * Обратная синхронизация оплат из 1С:Бухгалтерии (поступления на р/с).
 * Один конвейер на три источника: xlsx-выгрузка, 1CClientBankExchange (txt),
 * вебхук/OData из 1С. Этапы: parse → match → (dry-run отчёт | commit).
 *
 * Матчинг: клиент — по БИН контрагента (counterparties.bin_iin);
 * документ — по номеру СЧ-/АВР- в назначении платежа; без номера — оплата
 * ложится на клиента без привязки (ведомость считает по клиенту).
 * Идемпотентность: payments.bank_reference = "1c:{дата}:{номер}:{бин}:{сумма}".
 */
import ExcelJS from "exceljs";
import { query, tx } from "@/lib/db";

export type PaymentRecord = {
  date: string;          // YYYY-MM-DD
  number: string;        // № платёжного поручения
  bin: string;           // БИН/ИИН плательщика (12 цифр)
  amount: number;
  purpose: string;       // назначение платежа
  payer_name?: string;
};

export type MatchedRecord = PaymentRecord & {
  bank_reference: string;
  client_id: string | null;
  client_name: string | null;
  document_id: string | null;
  document_number: string | null;
  duplicate: boolean;
  problem: string | null; // человекочитаемая причина «не проведём»
};

export type ImportReport = {
  total: number;
  matched: number;
  unmatchedClient: number;
  duplicates: number;
  records: MatchedRecord[];
};

const DOC_NUMBER_RE = /(СЧ|АВР)-\d{6}/iu;

export function bankReference(r: PaymentRecord): string {
  return `1c:${r.date}:${r.number}:${r.bin}:${r.amount.toFixed(2)}`;
}

/** ---------- Парсер xlsx («Поступления на расчётный счёт» → Вывести список) ---------- */
export async function parseXlsx(buf: ArrayBuffer): Promise<PaymentRecord[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("пустая книга");

  let head = 0;
  const cols: Record<string, number> = {};
  // Ищем строку заголовков в первых 10 строках (1С добавляет шапку отчёта сверху).
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const found: Record<string, number> = {};
    row.eachCell((cell, col) => {
      const v = String(cell.value ?? "").toLowerCase();
      if (!found.date && /^дата/.test(v)) found.date = col;
      else if (!found.number && /номер|№/.test(v)) found.number = col;
      else if (!found.bin && /бин|иин|бсн|жсн/.test(v)) found.bin = col;
      else if (!found.amount && /сумма/.test(v)) found.amount = col;
      else if (!found.purpose && /назначен|основание/.test(v)) found.purpose = col;
      else if (!found.payer && /плательщик|контрагент/.test(v)) found.payer = col;
    });
    if (found.date && found.amount && (found.bin || found.payer)) {
      head = r;
      Object.assign(cols, found);
      break;
    }
  }
  if (!head) throw new Error("не найдена строка заголовков (нужны колонки: Дата, Сумма, БИН/Контрагент)");

  const out: PaymentRecord[] = [];
  ws.eachRow((row, n) => {
    if (n <= head) return;
    const rawDate = row.getCell(cols.date).value;
    const amount = Number(String(row.getCell(cols.amount).value ?? "").replace(/\s/g, "").replace(",", "."));
    if (!rawDate || !amount || Number.isNaN(amount)) return;
    const date =
      rawDate instanceof Date
        ? rawDate.toISOString().slice(0, 10)
        : String(rawDate).trim().split(".").length === 3
          ? String(rawDate).trim().split(" ")[0].split(".").reverse().join("-")
          : String(rawDate).slice(0, 10);
    out.push({
      date,
      number: cols.number ? String(row.getCell(cols.number).value ?? "").trim() : String(n),
      bin: cols.bin ? String(row.getCell(cols.bin).value ?? "").replace(/\D/g, "") : "",
      amount,
      purpose: cols.purpose ? String(row.getCell(cols.purpose).value ?? "").trim() : "",
      payer_name: cols.payer ? String(row.getCell(cols.payer).value ?? "").trim() : undefined,
    });
  });
  return out;
}

/** ---------- Парсер 1CClientBankExchange (kl_to_1c.txt) ---------- */
export function parseClientBank(text: string): PaymentRecord[] {
  const out: PaymentRecord[] = [];
  // Кодировка: файл уже должен быть декодирован (utf8/cp1251 — на стороне вызова).
  const blocks = text.split(/СекцияДокумент=/iu).slice(1);
  for (const block of blocks) {
    const get = (key: string) =>
      block.match(new RegExp(`^${key}=(.*)$`, "miu"))?.[1]?.trim() ?? "";
    const amount = Number(get("Сумма").replace(",", "."));
    if (!amount) continue;
    const dateRaw = get("ДатаПоступило") || get("Дата");
    const date = dateRaw.includes(".")
      ? dateRaw.split(".").reverse().join("-")
      : dateRaw;
    out.push({
      date,
      number: get("Номер"),
      bin: (get("ПлательщикБИН") || get("ПлательщикИИН") || get("ПлательщикИНН") ||
            get("ПлательщикБИН/ИИН") || "").replace(/\D/g, ""),
      amount,
      purpose: get("НазначениеПлатежа"),
      payer_name: get("Плательщик1") || get("Плательщик") || undefined,
    });
  }
  return out;
}

/** ---------- Матчинг ---------- */
export async function matchRecords(records: PaymentRecord[]): Promise<ImportReport> {
  const refs = records.map(bankReference);
  const [existing, clients] = await Promise.all([
    refs.length
      ? query<{ bank_reference: string }>(
          `SELECT bank_reference FROM payments WHERE bank_reference = ANY($1)`,
          [refs]
        )
      : Promise.resolve([]),
    query<{ client_id: string; name: string; bin_iin: string }>(
      `SELECT cp.client_id, c.name, cp.bin_iin
       FROM counterparties cp JOIN clients c ON c.id = cp.client_id
       WHERE cp.bin_iin IS NOT NULL`
    ),
  ]);
  const dup = new Set(existing.map((e) => e.bank_reference));
  const byBin = new Map(clients.map((c) => [c.bin_iin, c]));

  const out: MatchedRecord[] = [];
  for (const r of records) {
    const ref = bankReference(r);
    const client = r.bin ? byBin.get(r.bin) : undefined;
    let document_id: string | null = null;
    let document_number: string | null = null;
    const docMatch = r.purpose.match(DOC_NUMBER_RE)?.[0]?.toUpperCase();
    if (client && docMatch) {
      const [doc] = await query<{ id: string; number: string }>(
        `SELECT id, number FROM billing_documents
         WHERE client_id = $1::uuid AND upper(number) = $2 AND status <> 'cancelled'`,
        [client.client_id, docMatch]
      );
      if (doc) {
        document_id = doc.id;
        document_number = doc.number;
      }
    }
    out.push({
      ...r,
      bank_reference: ref,
      client_id: client?.client_id ?? null,
      client_name: client?.name ?? null,
      document_id,
      document_number,
      duplicate: dup.has(ref),
      problem: dup.has(ref)
        ? "дубль (уже проведена)"
        : !client
          ? `клиент с БИН ${r.bin || "—"} не найден`
          : null,
    });
  }
  return {
    total: out.length,
    matched: out.filter((r) => !r.problem).length,
    unmatchedClient: out.filter((r) => r.problem?.startsWith("клиент")).length,
    duplicates: out.filter((r) => r.duplicate).length,
    records: out,
  };
}

/** ---------- Проведение ---------- */
export async function commitPayments(
  report: ImportReport,
  userId: string | null,
  source: string
): Promise<{ created: number; skipped: number }> {
  return tx(async (q) => {
    let created = 0, skipped = 0;
    for (const r of report.records) {
      if (r.problem || !r.client_id) { skipped++; continue; }
      const [row] = await q<{ id: string }>(
        `INSERT INTO payments (client_id, billing_document_id, amount, paid_at, method, bank_reference, note, created_by)
         VALUES ($1::uuid, $2::uuid, $3, $4::date::timestamptz, 'bank', $5, $6, $7::uuid)
         ON CONFLICT DO NOTHING RETURNING id`,
        [r.client_id, r.document_id, r.amount, r.date, r.bank_reference,
         `импорт ${source}: ${r.purpose}`.slice(0, 300), userId]
      );
      if (!row) { skipped++; continue; }
      created++;
      if (r.document_id) {
        await q(
          `UPDATE billing_documents SET
             paid_amount = paid_amount + $2,
             status = CASE WHEN paid_amount + $2 >= total THEN 'paid' ELSE 'partial' END
           WHERE id = $1::uuid`,
          [r.document_id, r.amount]
        );
      }
    }
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, detail)
       VALUES ($1::uuid, 'import', 'payments', jsonb_build_object('source', $2::text, 'created', $3::int, 'skipped', $4::int))`,
      [userId, source, created, skipped]
    );
    return { created, skipped };
  });
}
