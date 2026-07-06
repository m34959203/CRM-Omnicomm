import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { settlementSheet } from "@/lib/billing/engine";
import { excelResponse } from "@/lib/excel";

const READ_ROLES = ["admin", "manager", "accounting", "head", "boss"] as const;

export async function GET() {
  try {
    await requireRole([...READ_ROLES]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const sheet = await settlementSheet(query);
  return excelResponse(
    "Ведомость расчётов",
    [
      { header: "Клиент", key: "client_name", width: 40 },
      { header: "Начислено", key: "billed", width: 16 },
      { header: "Оплачено", key: "paid", width: 16 },
      { header: "Долг", key: "debt", width: 16 },
      { header: "Неоплачено с", key: "oldest_unpaid_due", width: 14 },
    ],
    sheet.map((s) => ({ ...s, oldest_unpaid_due: s.oldest_unpaid_due ?? "" }))
  );
}
