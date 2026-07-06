import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { REQUEST_STATUSES, REQUEST_TYPES } from "@/lib/service/common";
import { ServiceTabs } from "../tabs";
import { requestStatusBadge, priorityBadge, fmtAlmaty } from "../badges";

type Row = {
  id: string;
  number: string;
  client_name: string;
  object_name: string | null;
  type: string;
  priority: string;
  status: string;
  performers: string | null;
  due_at: string | null;
  created_at: string;
};

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; client_id?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const s = d.service;
  const sp = await searchParams;
  const status = sp.status ?? "";
  const type = sp.type ?? "";
  const clientId = sp.client_id ?? "";

  const [rows, clients] = await Promise.all([
    query<Row>(
      `SELECT r.id, r.number, c.name AS client_name, o.name AS object_name,
              r.type, r.priority, r.status, r.due_at, r.created_at,
              concat_ws(', ', um.full_name, us.full_name, ui.full_name) AS performers
       FROM requests r
       JOIN clients c ON c.id = r.client_id
       LEFT JOIN monitoring_objects o ON o.id = r.object_id
       LEFT JOIN users um ON um.id = r.manager_id
       LEFT JOIN users us ON us.id = r.support_id
       LEFT JOIN users ui ON ui.id = r.installer_id
       WHERE ($1 = '' OR r.status = $1)
         AND ($2 = '' OR r.type = $2)
         AND ($3 = '' OR r.client_id = $3::uuid)
       ORDER BY r.created_at DESC
       LIMIT 500`,
      [status, type, clientId]
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE is_active ORDER BY name`
    ),
  ]);

  const exportQs = new URLSearchParams(
    Object.entries({ status, type, client_id: clientId }).filter(([, v]) => v)
  ).toString();

  const sel =
    "rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none transition focus:border-accent";

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{s.requestsTitle}</h1>
        <div className="flex gap-2">
          <a
            href={`/api/service/requests/export${exportQs ? `?${exportQs}` : ""}`}
            className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent"
          >
            {d.common.exportExcel}
          </a>
          <Link
            href="/service/requests/new"
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink"
          >
            {s.newRequest}
          </Link>
        </div>
      </div>
      <ServiceTabs d={d} active="requests" />

      <form method="GET" className="mt-4 flex flex-wrap items-center gap-2">
        <select name="status" defaultValue={status} className={sel}>
          <option value="">{s.allStatuses}</option>
          {REQUEST_STATUSES.map((st) => (
            <option key={st} value={st}>
              {(s.requestStatuses as Record<string, string>)[st]}
            </option>
          ))}
        </select>
        <select name="type" defaultValue={type} className={sel}>
          <option value="">{s.allTypes}</option>
          {REQUEST_TYPES.map((tp) => (
            <option key={tp} value={tp}>
              {(s.requestTypes as Record<string, string>)[tp]}
            </option>
          ))}
        </select>
        <select name="client_id" defaultValue={clientId} className={sel}>
          <option value="">{s.allClients}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="rounded-md border border-line bg-card px-3 py-1.5 text-sm transition hover:border-accent">
          {s.apply}
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{s.number}</th>
              <th className="px-4 py-3 font-medium">{s.client}</th>
              <th className="px-4 py-3 font-medium">{s.object}</th>
              <th className="px-4 py-3 font-medium">{s.type}</th>
              <th className="px-4 py-3 font-medium">{s.priority}</th>
              <th className="px-4 py-3 font-medium">{s.status}</th>
              <th className="px-4 py-3 font-medium">{s.performers}</th>
              <th className="px-4 py-3 font-medium">{s.dueAt}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-line last:border-0 transition hover:bg-accent-soft/40"
              >
                <td className="px-4 py-2.5 font-mono text-[13px]">
                  <Link href={`/service/requests/${r.id}`} className="font-medium text-accent-ink hover:underline">
                    {r.number}
                  </Link>
                </td>
                <td className="px-4 py-2.5">{r.client_name}</td>
                <td className="px-4 py-2.5">{r.object_name ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {(s.requestTypes as Record<string, string>)[r.type] ?? r.type}
                </td>
                <td className="px-4 py-2.5">{priorityBadge(r.priority, s)}</td>
                <td className="px-4 py-2.5">{requestStatusBadge(r.status, s)}</td>
                <td className="px-4 py-2.5 text-[13px]">{r.performers || "—"}</td>
                <td className="px-4 py-2.5 text-[13px]">{fmtAlmaty(r.due_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
