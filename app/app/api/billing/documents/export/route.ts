import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse, periodRu } from "@/lib/excel";

const READ_ROLES = ["admin", "manager", "accounting", "head", "boss"] as const;

const KIND_LABEL: Record<string, string> = {
  advance_invoice: "Счёт (аванс)",
  act: "АВР",
  one_time_invoice: "Счёт (разовый)",
};

const STATUS_LABEL: Record<string, string> = {
  to_accrue: "к начислению",
  prepared: "подготовлен",
  issued: "выставлен",
  sent: "отправлен",
  partial: "частичная оплата",
  paid: "оплачен",
  overdue: "просрочен",
  cancelled: "отменён",
};

export async function GET(req: Request) {
  try {
    await requireRole([...READ_ROLES]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const p = new URL(req.url).searchParams;
  const periodParam = p.get("period") || "";
  const kindParam = p.get("kind") || "";
  const statusParam = p.get("status") || "";
  const rows = await query<Record<string, unknown>>(
    `SELECT d.number, d.kind, c.name AS client_name,
            to_char(d.period_start, 'YYYY-MM') AS period,
            d.subtotal::float8 AS subtotal, d.discount_amount::float8 AS discount,
            d.prepaid_amount::float8 AS prepaid, d.vat_amount::float8 AS vat,
            d.total::float8 AS total, d.paid_amount::float8 AS paid, d.status,
            to_char(d.created_at AT TIME ZONE 'Asia/Almaty', 'DD.MM.YYYY') AS created
     FROM billing_documents d
     JOIN clients c ON c.id = d.client_id
     WHERE ($1::text IS NULL OR to_char(d.period_start, 'YYYY-MM') = $1)
       AND ($2::text IS NULL OR d.kind = $2)
       AND ($3::text IS NULL OR d.status = $3)
     ORDER BY d.created_at DESC`,
    [periodParam || null, kindParam || null, statusParam || null]
  );
  return excelResponse(
    "Расчётные документы",
    [
      { header: "Номер", key: "number", width: 14 },
      { header: "Тип", key: "kind", width: 14 },
      { header: "Клиент", key: "client_name", width: 36 },
      { header: "Период", key: "period", width: 10 },
      { header: "Начислено", key: "subtotal", width: 14, money: true },
      { header: "Скидка", key: "discount", width: 12, money: true },
      { header: "Предоплата", key: "prepaid", width: 12, money: true },
      { header: "НДС", key: "vat", width: 12, money: true },
      { header: "Итого", key: "total", width: 14, money: true },
      { header: "Оплачено", key: "paid", width: 14, money: true },
      { header: "Статус", key: "status", width: 14 },
      { header: "Создан", key: "created", width: 12 },
    ],
    rows.map((r) => ({
      ...r,
      kind: KIND_LABEL[String(r.kind)] ?? r.kind,
      status: STATUS_LABEL[String(r.status)] ?? r.status,
    })),
    {
      title: "Расчётные документы",
      period: periodParam ? periodRu(periodParam) : undefined,
      params: [
        ...(kindParam ? [["Тип:", KIND_LABEL[kindParam] ?? kindParam] as [string, string]] : []),
        ...(statusParam
          ? [["Статус:", STATUS_LABEL[statusParam] ?? statusParam] as [string, string]]
          : []),
      ],
    }
  );
}
