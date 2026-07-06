import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse } from "@/lib/excel";

const STATUS_RU: Record<string, string> = {
  in_stock: "на складе",
  assigned: "выдана",
  installed: "установлена",
  suspended: "приостановлена",
  written_off: "списана",
};

export async function GET() {
  try {
    await requireRole(["admin", "manager", "support", "head", "accounting", "boss"]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const rows = await query(
    `SELECT s.icc, s.msisdn, op.name AS operator, p.name AS plan, s.status,
            COALESCE(w.name, u.full_name, e.serial_number) AS location
     FROM sim_cards s
     LEFT JOIN sim_operators op ON op.id = s.operator_id
     LEFT JOIN sim_operator_plans p ON p.id = s.plan_id
     LEFT JOIN warehouses w ON w.id = s.warehouse_id
     LEFT JOIN users u ON u.id = s.holder_id
     LEFT JOIN equipment_items e ON e.id = s.equipment_id
     ORDER BY s.created_at DESC`
  );
  return excelResponse(
    "SIM-карты",
    [
      { header: "ICCID", key: "icc", width: 24 },
      { header: "MSISDN", key: "msisdn", width: 16 },
      { header: "Оператор", key: "operator", width: 16 },
      { header: "Тарифный план", key: "plan", width: 20 },
      { header: "Статус", key: "status", width: 16 },
      { header: "Размещение", key: "location", width: 28 },
    ],
    rows.map((r) => ({ ...r, status: STATUS_RU[r.status as string] ?? r.status }))
  );
}
