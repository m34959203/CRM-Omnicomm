import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { NewSimForm } from "./form";

export default async function NewSimPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const [operators, plans, warehouses] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, name FROM sim_operators WHERE is_active ORDER BY name`
    ),
    query<{ id: string; name: string; operator_id: string }>(
      `SELECT id, name, operator_id FROM sim_operator_plans WHERE is_active ORDER BY name`
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM warehouses WHERE is_active ORDER BY name`
    ),
  ]);
  return <NewSimForm operators={operators} plans={plans} warehouses={warehouses} />;
}
