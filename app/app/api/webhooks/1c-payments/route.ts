import { matchRecords, commitPayments, type PaymentRecord } from "@/lib/billing/payments-import";

/**
 * Вебхук из 1С (вариант Б-2): внешняя обработка 1С с регламентным заданием шлёт
 * новые поступления JSON-массивом. Заголовок X-Webhook-Key = env WEBHOOK_1C_KEY.
 * Тело: [{date:"2026-07-05", number:"125", bin:"123456789012", amount:40000,
 *         purpose:"Оплата по счёту СЧ-000012", payer_name:"ТОО ..."}]
 * Идемпотентен: дубли по bank_reference пропускаются — 1С может слать пакет повторно.
 */
export async function POST(req: Request) {
  const key = process.env.WEBHOOK_1C_KEY;
  if (!key || req.headers.get("x-webhook-key") !== key) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as PaymentRecord[] | null;
  if (!Array.isArray(body) || body.length === 0) {
    return Response.json({ error: "ожидается непустой JSON-массив оплат" }, { status: 400 });
  }
  const records: PaymentRecord[] = body
    .filter((r) => r && r.date && Number(r.amount) > 0)
    .map((r) => ({
      date: String(r.date).slice(0, 10),
      number: String(r.number ?? ""),
      bin: String(r.bin ?? "").replace(/\D/g, ""),
      amount: Number(r.amount),
      purpose: String(r.purpose ?? ""),
      payer_name: r.payer_name ? String(r.payer_name) : undefined,
    }));
  if (records.length === 0) {
    return Response.json({ error: "нет валидных записей" }, { status: 422 });
  }
  const report = await matchRecords(records);
  const result = await commitPayments(report, null, "вебхук 1С");
  return Response.json({
    total: report.total,
    created: result.created,
    skipped: result.skipped,
    problems: report.records.filter((r) => r.problem).map((r) => ({ number: r.number, problem: r.problem })),
  });
}
