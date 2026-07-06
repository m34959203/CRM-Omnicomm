import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { NewRequestForm } from "./form";

export default async function NewRequestPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!["admin", "manager", "support", "head"].includes(user.role)) redirect("/service/requests");
  const d = t(user.locale);

  const [clients, users] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE is_active ORDER BY name`
    ),
    query<{ id: string; full_name: string; role_code: string }>(
      `SELECT u.id, u.full_name, r.code AS role_code
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.is_active ORDER BY u.full_name`
    ),
  ]);

  return <NewRequestForm d={d} clients={clients} users={users} />;
}
