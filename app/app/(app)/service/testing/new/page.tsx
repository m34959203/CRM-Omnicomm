import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { NewTestingForm } from "./form";

export default async function NewTestingPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!["admin", "manager", "support", "head"].includes(user.role)) redirect("/service/testing");
  const d = t(user.locale);

  const [clients, stock] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE is_active ORDER BY name`
    ),
    // только новое (не БУ) со склада — бизнес-правило теста
    query<{ id: string; label: string }>(
      `SELECT e.id, n.name || COALESCE(' · SN ' || e.serial_number, '')
              || COALESCE(' · ' || w.name, '') AS label
       FROM equipment_items e
       JOIN nomenclature n ON n.id = e.nomenclature_id
       LEFT JOIN warehouses w ON w.id = e.warehouse_id
       WHERE e.status = 'in_stock' AND e.condition = 'new'
       ORDER BY n.name, e.serial_number LIMIT 300`
    ),
  ]);

  return <NewTestingForm d={d} clients={clients} stock={stock} />;
}
