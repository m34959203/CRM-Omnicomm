import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { NewOrderForm } from "./form";

export default async function NewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ request_id?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!["admin", "manager", "support", "head"].includes(user.role)) redirect("/service/orders");
  const d = t(user.locale);
  const { request_id } = await searchParams;

  const [clients, installers, request, initialObjects] = await Promise.all([
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE is_active ORDER BY name`
    ),
    query<{ id: string; full_name: string }>(
      `SELECT u.id, u.full_name FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.is_active AND r.code = 'installer' ORDER BY u.full_name`
    ),
    request_id && /^[0-9a-f-]{36}$/i.test(request_id)
      ? query<{ id: string; number: string; client_id: string; object_id: string | null }>(
          `SELECT id, number, client_id, object_id FROM requests WHERE id = $1::uuid`,
          [request_id]
        ).then((r) => r[0] ?? null)
      : Promise.resolve(null),
    request_id && /^[0-9a-f-]{36}$/i.test(request_id)
      ? query<{ id: string; name: string }>(
          `SELECT o.id, o.name FROM monitoring_objects o
           WHERE o.client_id = (SELECT client_id FROM requests WHERE id = $1::uuid)
           ORDER BY o.name`,
          [request_id]
        )
      : Promise.resolve([]),
  ]);

  return (
    <NewOrderForm
      d={d}
      clients={clients}
      installers={installers}
      request={request}
      initialObjects={initialObjects}
    />
  );
}
