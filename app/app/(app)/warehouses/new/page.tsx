import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { NewWarehouseForm } from "./form";

export default async function NewWarehousePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const [users, suppliers] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, full_name AS name FROM users WHERE is_active ORDER BY full_name`
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM suppliers WHERE is_active ORDER BY name`
    ),
  ]);
  return <NewWarehouseForm users={users} suppliers={suppliers} />;
}
