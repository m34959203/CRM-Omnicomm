import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { ServiceTabs } from "../tabs";
import { orderStatusBadge, fmtAlmaty } from "../badges";

const STATUSES = ["draft", "planned", "in_progress", "done", "rework", "cancelled"];

type Row = {
  id: string;
  number: string;
  client_name: string | null;
  object_name: string | null;
  address: string | null;
  request_number: string | null;
  status: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  performers: string | null;
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; client_id?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const s = d.service;
  const sp = await searchParams;
  const status = sp.status ?? "";
  const clientId = sp.client_id ?? "";

  const [rows, clients] = await Promise.all([
    query<Row>(
      `SELECT w.id, w.number, c.name AS client_name, o.name AS object_name, w.address,
              r.number AS request_number, w.status, w.scheduled_start, w.scheduled_end,
              (SELECT string_agg(u.full_name, ', ' ORDER BY p.is_lead DESC)
               FROM work_order_performers p JOIN users u ON u.id = p.user_id
               WHERE p.work_order_id = w.id) AS performers
       FROM work_orders w
       LEFT JOIN clients c ON c.id = w.client_id
       LEFT JOIN monitoring_objects o ON o.id = w.object_id
       LEFT JOIN requests r ON r.id = w.request_id
       WHERE ($1 = '' OR w.status = $1)
         AND ($2 = '' OR w.client_id = $2::uuid)
       ORDER BY w.created_at DESC
       LIMIT 500`,
      [status, clientId]
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE is_active ORDER BY name`
    ),
  ]);

  const exportQs = new URLSearchParams(
    Object.entries({ status, client_id: clientId }).filter(([, v]) => v)
  ).toString();
  const sel =
    "rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none transition focus:border-accent";

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{s.ordersTitle}</h1>
        <div className="flex gap-2">
          <a
            href={`/api/service/orders/export${exportQs ? `?${exportQs}` : ""}`}
            className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent"
          >
            {d.common.exportExcel}
          </a>
          <Link
            href="/service/orders/new"
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink"
          >
            {s.newOrder}
          </Link>
        </div>
      </div>
      <ServiceTabs d={d} active="orders" />

      <form method="GET" className="mt-4 flex flex-wrap items-center gap-2">
        <select name="status" defaultValue={status} className={sel}>
          <option value="">{s.allStatuses}</option>
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {(s.orderStatuses as Record<string, string>)[st]}
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
              <th className="px-4 py-3 font-medium">{s.fromRequest}</th>
              <th className="px-4 py-3 font-medium">{s.scheduledStart}</th>
              <th className="px-4 py-3 font-medium">{s.performers}</th>
              <th className="px-4 py-3 font-medium">{s.status}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink-dim">
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
                  <Link href={`/service/orders/${r.id}`} className="font-medium text-accent-ink hover:underline">
                    {r.number}
                  </Link>
                </td>
                <td className="px-4 py-2.5">{r.client_name ?? "—"}</td>
                <td className="px-4 py-2.5">{r.object_name ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{r.request_number ?? "—"}</td>
                <td className="px-4 py-2.5 text-[13px]">{fmtAlmaty(r.scheduled_start)}</td>
                <td className="px-4 py-2.5 text-[13px]">{r.performers || "—"}</td>
                <td className="px-4 py-2.5">{orderStatusBadge(r.status, s)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
