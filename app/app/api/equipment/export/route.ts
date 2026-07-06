import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse } from "@/lib/excel";

const STATUS_RU: Record<string, string> = {
  in_stock: "на складе",
  with_technician: "у техника",
  on_testing: "на тестировании",
  at_supplier: "у поставщика",
  installed: "установлено",
  reserved: "резерв",
  written_off: "списано",
};
const BILLING_RU: Record<string, string> = {
  active: "активно",
  conservation: "консервация",
  disabled: "отключено",
};

export async function GET() {
  try {
    await requireRole(["admin", "manager", "support", "head", "accounting", "boss"]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const rows = await query(
    `SELECT n.name AS nomenclature, e.serial_number, e.imei,
            CASE WHEN e.condition = 'new' THEN 'новое' ELSE 'БУ' END AS condition,
            e.status, e.billing_state,
            COALESCE(w.name, u.full_name, o.name, c.name) AS location
     FROM equipment_items e
     JOIN nomenclature n ON n.id = e.nomenclature_id
     LEFT JOIN warehouses w ON w.id = e.warehouse_id
     LEFT JOIN users u ON u.id = e.holder_id
     LEFT JOIN clients c ON c.id = e.client_id
     LEFT JOIN monitoring_objects o ON o.id = e.object_id
     ORDER BY e.created_at DESC`
  );
  return excelResponse(
    "Оборудование",
    [
      { header: "Номенклатура", key: "nomenclature", width: 32 },
      { header: "Серийный №", key: "serial_number", width: 20 },
      { header: "IMEI", key: "imei", width: 20 },
      { header: "Состояние", key: "condition", width: 12 },
      { header: "Статус", key: "status", width: 16 },
      { header: "Телематика", key: "billing_state", width: 14 },
      { header: "Размещение", key: "location", width: 28 },
    ],
    rows.map((r) => ({
      ...r,
      status: STATUS_RU[r.status as string] ?? r.status,
      billing_state: r.billing_state ? BILLING_RU[r.billing_state as string] ?? r.billing_state : null,
    })),
    { title: "Оборудование" }
  );
}
