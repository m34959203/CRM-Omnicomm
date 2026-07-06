import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse } from "@/lib/excel";

const KIND_RU: Record<string, string> = {
  vehicle: "ТС",
  stationary: "стационарный",
  other: "прочее",
};

export async function GET() {
  try {
    await requireRole(["admin", "manager", "support", "head", "accounting", "boss"]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const rows = await query(
    `SELECT o.name, c.name AS client, o.kind, o.brand, o.model, o.reg_number, o.vin,
            CASE WHEN o.status = 'active' THEN 'активен' ELSE 'архив' END AS status
     FROM monitoring_objects o
     JOIN clients c ON c.id = o.client_id
     ORDER BY o.name`
  );
  return excelResponse(
    "Объекты мониторинга",
    [
      { header: "Наименование", key: "name", width: 32 },
      { header: "Клиент", key: "client", width: 32 },
      { header: "Вид", key: "kind", width: 14 },
      { header: "Марка", key: "brand", width: 16 },
      { header: "Модель", key: "model", width: 16 },
      { header: "Госномер", key: "reg_number", width: 14 },
      { header: "VIN", key: "vin", width: 22 },
      { header: "Статус", key: "status", width: 10 },
    ],
    rows.map((r) => ({ ...r, kind: KIND_RU[r.kind as string] ?? r.kind })),
    { title: "Объекты мониторинга" }
  );
}
