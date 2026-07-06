import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse } from "@/lib/excel";

const TYPE_RU: Record<string, string> = {
  physical: "обычный",
  technician: "исполнителя (техник)",
  contractor: "исполнителя (подрядчик)",
  testing: "виртуальный: тестирование",
  supplier: "виртуальный: поставщик",
  virtual: "виртуальный",
};

export async function GET() {
  try {
    await requireRole(["admin", "manager", "support", "head", "accounting", "boss"]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const rows = await query(
    `SELECT w.name, w.type, u.full_name AS holder, s.name AS supplier,
            CASE WHEN w.is_active THEN 'да' ELSE 'нет' END AS active
     FROM warehouses w
     LEFT JOIN users u ON u.id = w.holder_id
     LEFT JOIN suppliers s ON s.id = w.supplier_id
     ORDER BY w.name`
  );
  return excelResponse(
    "Склады",
    [
      { header: "Наименование", key: "name", width: 32 },
      { header: "Тип", key: "type", width: 26 },
      { header: "Держатель", key: "holder", width: 26 },
      { header: "Поставщик", key: "supplier", width: 26 },
      { header: "Активен", key: "active", width: 10 },
    ],
    rows.map((r) => ({ ...r, type: TYPE_RU[r.type as string] ?? r.type }))
  );
}
