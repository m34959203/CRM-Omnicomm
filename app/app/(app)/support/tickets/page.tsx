import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import {
  SUPPORT_READ_ROLES,
  TICKET_CHANNELS,
  TICKET_STATUSES,
} from "@/lib/support/common";
import { SupportTabs } from "../tabs";
import { ticketStatusBadge, channelBadge, fmtAlmaty } from "../badges";

type Row = {
  id: string;
  number: string;
  client_name: string | null;
  contact: string | null;
  channel: string | null;
  subject: string | null;
  status: string;
  assigned_name: string | null;
  created_at: string;
};

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; channel?: string; client_id?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!SUPPORT_READ_ROLES.includes(user.role)) redirect("/dashboard");
  const d = t(user.locale);
  const s = d.support;
  const sp = await searchParams;
  const status = sp.status ?? "";
  const channel = sp.channel ?? "";
  const clientId = sp.client_id ?? "";

  const [rows, clients] = await Promise.all([
    query<Row>(
      `SELECT tk.id, tk.number, c.name AS client_name, tk.contact, tk.channel,
              tk.subject, tk.status, u.full_name AS assigned_name, tk.created_at::text
       FROM tickets tk
       LEFT JOIN clients c ON c.id = tk.client_id
       LEFT JOIN users u ON u.id = tk.assigned_to
       WHERE ($1 = '' OR tk.status = $1)
         AND ($2 = '' OR tk.channel = $2)
         AND ($3 = '' OR tk.client_id = $3::uuid)
       ORDER BY tk.created_at DESC
       LIMIT 500`,
      [status, channel, clientId]
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE is_active ORDER BY name`
    ),
  ]);

  const exportQs = new URLSearchParams(
    Object.entries({ status, channel, client_id: clientId }).filter(([, v]) => v)
  ).toString();

  const sel =
    "rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none transition focus:border-accent";

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{s.ticketsTitle}</h1>
        <div className="flex gap-2">
          <a
            href={`/api/support/tickets/export${exportQs ? `?${exportQs}` : ""}`}
            className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent"
          >
            {d.common.exportExcel}
          </a>
          <Link
            href="/support/tickets/new"
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink"
          >
            {s.newTicket}
          </Link>
        </div>
      </div>
      <SupportTabs d={d} active="tickets" />

      <form method="GET" className="mt-4 flex flex-wrap items-center gap-2">
        <select name="status" defaultValue={status} className={sel}>
          <option value="">{s.allStatuses}</option>
          {TICKET_STATUSES.map((st) => (
            <option key={st} value={st}>
              {(s.ticketStatuses as Record<string, string>)[st]}
            </option>
          ))}
        </select>
        <select name="channel" defaultValue={channel} className={sel}>
          <option value="">{s.allChannels}</option>
          {TICKET_CHANNELS.map((ch) => (
            <option key={ch} value={ch}>
              {(s.channels as Record<string, string>)[ch]}
            </option>
          ))}
        </select>
        <select name="client_id" defaultValue={clientId} className={sel}>
          <option value="">{s.allClients}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
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
              <th className="px-4 py-3 font-medium">{s.channel}</th>
              <th className="px-4 py-3 font-medium">{s.subject}</th>
              <th className="px-4 py-3 font-medium">{s.status}</th>
              <th className="px-4 py-3 font-medium">{s.assigned}</th>
              <th className="px-4 py-3 font-medium">{s.createdAt}</th>
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
              <tr key={r.id} className="border-b border-line last:border-0 transition hover:bg-accent-soft/40">
                <td className="px-4 py-2.5 font-mono text-[13px]">
                  <Link
                    href={`/support/tickets/${r.id}`}
                    className="font-medium text-accent-ink hover:underline"
                  >
                    {r.number}
                  </Link>
                </td>
                <td className="px-4 py-2.5">{r.client_name ?? s.noClient}</td>
                <td className="px-4 py-2.5">{channelBadge(r.channel, s)}</td>
                <td className="px-4 py-2.5">{r.subject ?? "—"}</td>
                <td className="px-4 py-2.5">{ticketStatusBadge(r.status, s)}</td>
                <td className="px-4 py-2.5">{r.assigned_name ?? "—"}</td>
                <td className="px-4 py-2.5 text-[13px]">{fmtAlmaty(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
