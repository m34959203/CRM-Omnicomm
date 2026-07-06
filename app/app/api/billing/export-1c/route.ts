import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse } from "@/lib/excel";

const ROLES = ["admin", "accounting", "head"] as const;

const RU_MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

/**
 * Выгрузка реализаций (актов) периода для загрузки бухгалтером в 1С:Бухгалтерию KZ:
 * номер, дата, контрагент + БИН, услуга, сумма без НДС, НДС, итого.
 */
export async function GET(req: Request) {
  try {
    await requireRole([...ROLES]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const period = new URL(req.url).searchParams.get("period") ?? "";
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return Response.json({ error: "period=YYYY-MM обязателен" }, { status: 400 });
  }
  const [y, m] = period.split("-").map(Number);
  const service = `Услуги мониторинга транспорта за ${RU_MONTHS[m - 1]} ${y} г.`;

  const rows = await query<Record<string, unknown>>(
    `SELECT d.number,
            to_char(COALESCE(d.issued_at, d.created_at) AT TIME ZONE 'Asia/Almaty', 'DD.MM.YYYY') AS doc_date,
            COALESCE(cp.name, c.name) AS counterparty,
            cp.bin_iin,
            (d.total - d.vat_amount)::float8 AS amount_wo_vat,
            d.vat_amount::float8 AS vat,
            d.total::float8 AS total
     FROM billing_documents d
     JOIN clients c ON c.id = d.client_id
     LEFT JOIN LATERAL (
       SELECT name, bin_iin FROM counterparties
       WHERE client_id = c.id ORDER BY created_at LIMIT 1
     ) cp ON true
     WHERE d.kind IN ('act', 'one_time_invoice')
       AND d.status <> 'cancelled'
       AND to_char(d.period_start, 'YYYY-MM') = $1
     ORDER BY d.number`,
    [period]
  );
  return excelResponse(
    `Реализации 1С ${period}`,
    [
      { header: "Номер документа", key: "number", width: 16 },
      { header: "Дата", key: "doc_date", width: 12 },
      { header: "Контрагент", key: "counterparty", width: 40 },
      { header: "БИН/ИИН", key: "bin_iin", width: 16 },
      { header: "Услуга", key: "service", width: 50 },
      { header: "Сумма без НДС", key: "amount_wo_vat", width: 16 },
      { header: "НДС", key: "vat", width: 14 },
      { header: "Итого", key: "total", width: 16 },
    ],
    rows.map((r) => ({ ...r, service }))
  );
}
