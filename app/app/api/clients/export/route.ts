import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse } from "@/lib/excel";

export async function GET() {
  try {
    await requireRole(["admin", "manager", "support", "head", "accounting", "boss"]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const rows = await query(
    `SELECT c.name, cp.bin_iin, cp.legal_form, c.phone, c.email,
            c.billing_scheme, u.full_name AS manager,
            CASE WHEN c.is_active THEN 'да' ELSE 'нет' END AS active
     FROM clients c
     LEFT JOIN users u ON u.id = c.manager_id
     LEFT JOIN LATERAL (
       SELECT bin_iin, legal_form FROM counterparties
       WHERE client_id = c.id ORDER BY created_at LIMIT 1
     ) cp ON true
     ORDER BY c.name`
  );
  return excelResponse(
    "Клиенты",
    [
      { header: "Наименование", key: "name", width: 36 },
      { header: "БИН/ИИН", key: "bin_iin", width: 16 },
      { header: "Юр. форма", key: "legal_form", width: 10 },
      { header: "Телефон", key: "phone", width: 16 },
      { header: "E-mail", key: "email", width: 24 },
      { header: "Схема расчётов", key: "billing_scheme", width: 14 },
      { header: "Менеджер", key: "manager", width: 24 },
      { header: "Активен", key: "active", width: 10 },
    ],
    rows
  );
}
