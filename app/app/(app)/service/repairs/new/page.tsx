import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { NewRepairForm } from "./form";

export default async function NewRepairPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!["admin", "manager", "support", "head"].includes(user.role)) redirect("/service/repairs");
  const d = t(user.locale);

  const [clients, suppliers, warehouses, stock, atSupplier, openReceiveDocs] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE is_active ORDER BY name`
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM suppliers WHERE is_active ORDER BY name`
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM warehouses WHERE type = 'physical' AND is_active ORDER BY name`
    ),
    query<{ id: string; label: string }>(
      `SELECT e.id, n.name || COALESCE(' · SN ' || e.serial_number, '')
              || COALESCE(' · ' || w.name, '') AS label
       FROM equipment_items e
       JOIN nomenclature n ON n.id = e.nomenclature_id
       LEFT JOIN warehouses w ON w.id = e.warehouse_id
       WHERE e.status = 'in_stock'
       ORDER BY n.name, e.serial_number LIMIT 300`
    ),
    query<{ id: string; label: string }>(
      `SELECT e.id, n.name || COALESCE(' · SN ' || e.serial_number, '')
              || COALESCE(' · ' || sp.name, '') AS label
       FROM equipment_items e
       JOIN nomenclature n ON n.id = e.nomenclature_id
       LEFT JOIN suppliers sp ON sp.id = e.supplier_id
       WHERE e.status = 'at_supplier'
       ORDER BY n.name LIMIT 300`
    ),
    query<{ id: string; label: string; client_id: string }>(
      `SELECT r.id, r.number || ' · ' || c.name AS label, r.client_id
       FROM equipment_repair_docs r
       JOIN clients c ON c.id = r.client_id
       WHERE r.doc_type = 'receive_from_client' AND r.status = 'open'
       ORDER BY r.created_at DESC`
    ),
  ]);

  return (
    <NewRepairForm
      d={d}
      clients={clients}
      suppliers={suppliers}
      warehouses={warehouses}
      stock={stock}
      atSupplier={atSupplier}
      openReceiveDocs={openReceiveDocs}
    />
  );
}
