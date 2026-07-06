import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { NewEquipmentForm } from "./form";

export default async function NewEquipmentPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const [nomenclature, warehouses, suppliers] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, name FROM nomenclature WHERE kind = 'equipment' AND is_active ORDER BY name`
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM warehouses WHERE is_active ORDER BY name`
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM suppliers WHERE is_active ORDER BY name`
    ),
  ]);
  return (
    <NewEquipmentForm
      nomenclature={nomenclature}
      warehouses={warehouses}
      suppliers={suppliers}
    />
  );
}
