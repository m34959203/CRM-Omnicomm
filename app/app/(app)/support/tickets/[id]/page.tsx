import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { SUPPORT_READ_ROLES, SUPPORT_WRITE_ROLES } from "@/lib/support/common";
import { REQUEST_TYPES } from "@/lib/service/common";
import { requestStatusBadge } from "../../../service/badges";
import { ticketStatusBadge, channelBadge, fmtAlmaty } from "../../badges";
import { TicketActions } from "./ticket-actions";

type TicketRow = {
  id: string;
  number: string;
  client_id: string | null;
  client_name: string | null;
  contact: string | null;
  channel: string | null;
  subject: string | null;
  description: string | null;
  status: string;
  resolution: string | null;
  assigned_to: string | null;
  closed_at: string | null;
  created_at: string;
};

export default async function TicketCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!SUPPORT_READ_ROLES.includes(user.role)) redirect("/dashboard");
  const d = t(user.locale);
  const s = d.support;
  const sv = d.service;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [[tk], requests, users] = await Promise.all([
    query<TicketRow>(
      `SELECT tk.*, c.name AS client_name
       FROM tickets tk LEFT JOIN clients c ON c.id = tk.client_id
       WHERE tk.id = $1::uuid`,
      [id]
    ),
    query<{ id: string; number: string; type: string; object_name: string | null; status: string }>(
      `SELECT r.id, r.number, r.type, o.name AS object_name, r.status
       FROM requests r LEFT JOIN monitoring_objects o ON o.id = r.object_id
       WHERE r.ticket_id = $1::uuid ORDER BY r.created_at`,
      [id]
    ),
    query<{ id: string; name: string }>(
      `SELECT u.id, u.full_name AS name
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.is_active AND r.code IN ('admin','manager','support','head')
       ORDER BY u.full_name`
    ),
  ]);
  if (!tk) notFound();

  const objects = tk.client_id
    ? await query<{ id: string; name: string }>(
        `SELECT id, name FROM monitoring_objects
         WHERE client_id = $1::uuid AND status = 'active' ORDER BY name`,
        [tk.client_id]
      )
    : [];

  const canEdit = SUPPORT_WRITE_ROLES.includes(user.role);
  const info: [string, React.ReactNode][] = [
    [s.client, tk.client_name ?? s.noClient],
    [s.contact, tk.contact ?? "—"],
    [s.channel, channelBadge(tk.channel, s)],
    [s.createdAt, fmtAlmaty(tk.created_at)],
    [s.closedAt, fmtAlmaty(tk.closed_at)],
    [
      s.resolution,
      tk.resolution
        ? (s.resolutions as Record<string, string>)[tk.resolution] ?? tk.resolution
        : "—",
    ],
  ];

  return (
    <div className="max-w-5xl">
      <Link href="/support/tickets" className="text-sm text-ink-dim hover:text-accent-ink">
        ← {s.ticketsTitle}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{tk.number}</h1>
        {ticketStatusBadge(tk.status, s)}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-lg border border-line bg-card p-5">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {info.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wider text-ink-dim">{k}</dt>
                  <dd className="mt-0.5 text-sm">{v}</dd>
                </div>
              ))}
            </dl>
            {(tk.subject || tk.description) && (
              <div className="mt-4 border-t border-line pt-3">
                {tk.subject && <div className="text-sm font-medium">{tk.subject}</div>}
                {tk.description && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-dim">{tk.description}</p>
                )}
              </div>
            )}
          </div>

          {canEdit && (
            <TicketActions
              id={tk.id}
              status={tk.status}
              assignedTo={tk.assigned_to}
              users={users}
              objects={objects}
              requestTypes={REQUEST_TYPES.map((tp) => [
                tp,
                (sv.requestTypes as Record<string, string>)[tp] ?? tp,
              ])}
              labels={{
                assigned: s.assigned,
                statuses: s.ticketStatuses as Record<string, string>,
                resolveRemote: s.resolveRemote,
                remoteConfirm: s.remoteConfirm,
                toService: s.toService,
                reject: s.reject,
                rejectConfirm: s.rejectConfirm,
                requestType: s.requestType,
                selectObjects: s.selectObjects,
                createRequests: s.createRequests,
                needObjects: s.needObjects,
                serviceHint: s.serviceHint,
                cancel: d.common.cancel,
                takeInProgress: s.takeInProgress,
              }}
            />
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-line bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
              {s.linkedRequests}
            </h2>
            <ul className="mt-2 space-y-1.5">
              {requests.length === 0 && <li className="text-sm text-ink-dim">—</li>}
              {requests.map((r) => (
                <li key={r.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/service/requests/${r.id}`}
                      className="font-mono text-[13px] font-medium text-accent-ink hover:underline"
                    >
                      {r.number}
                    </Link>
                    {requestStatusBadge(r.status, sv)}
                  </div>
                  <div className="text-xs text-ink-dim">
                    {(sv.requestTypes as Record<string, string>)[r.type] ?? r.type}
                    {r.object_name ? ` · ${r.object_name}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
