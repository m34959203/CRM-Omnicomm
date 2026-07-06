import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import {
  SUPPORT_READ_ROLES,
  SUPPORT_WRITE_ROLES,
  CALL_DIRECTIONS,
} from "@/lib/support/common";
import { SupportTabs } from "../tabs";
import { callDirectionBadge, fmtAlmaty } from "../badges";
import { CallForm, CallRowActions } from "./calls-client";

type Row = {
  id: string;
  created_at: string;
  direction: string;
  phone: string;
  client_name: string | null;
  request_id: string | null;
  request_number: string | null;
  duration_sec: number;
  result: string | null;
  registered_by: string | null;
};

export default async function CallsPage({
  searchParams,
}: {
  searchParams: Promise<{ direction?: string; client_id?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!SUPPORT_READ_ROLES.includes(user.role)) redirect("/dashboard");
  const d = t(user.locale);
  const s = d.support;
  const canEdit = SUPPORT_WRITE_ROLES.includes(user.role);
  const sp = await searchParams;
  const direction = sp.direction ?? "";
  const clientId = sp.client_id ?? "";

  const [rows, clients, requests] = await Promise.all([
    query<Row>(
      `SELECT cl.id, cl.created_at::text, cl.direction, cl.phone, c.name AS client_name,
              cl.request_id, r.number AS request_number, cl.duration_sec, cl.result,
              u.full_name AS registered_by
       FROM calls cl
       LEFT JOIN clients c ON c.id = cl.client_id
       LEFT JOIN requests r ON r.id = cl.request_id
       LEFT JOIN users u ON u.id = cl.user_id
       WHERE ($1 = '' OR cl.direction = $1)
         AND ($2 = '' OR cl.client_id = $2::uuid)
       ORDER BY cl.created_at DESC
       LIMIT 500`,
      [direction, clientId]
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE is_active ORDER BY name`
    ),
    query<{ id: string; name: string }>(
      `SELECT r.id, r.number || ' · ' || c.name AS name
       FROM requests r JOIN clients c ON c.id = r.client_id
       ORDER BY r.created_at DESC LIMIT 200`
    ),
  ]);

  const exportQs = new URLSearchParams(
    Object.entries({ direction, client_id: clientId }).filter(([, v]) => v)
  ).toString();

  const sel =
    "rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none transition focus:border-accent";

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{s.callsTitle}</h1>
        <a
          href={`/api/support/calls/export${exportQs ? `?${exportQs}` : ""}`}
          className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent"
        >
          {d.common.exportExcel}
        </a>
      </div>
      <SupportTabs d={d} active="calls" />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <select name="direction" defaultValue={direction} className={sel}>
            <option value="">{s.direction}: —</option>
            {CALL_DIRECTIONS.map((dir) => (
              <option key={dir} value={dir}>
                {(s.directions as Record<string, string>)[dir]}
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
        {canEdit && (
          <CallForm
            clients={clients}
            requests={requests}
            labels={{
              add: s.addCall,
              direction: s.direction,
              directions: s.directions as Record<string, string>,
              phone: s.phone,
              client: s.client,
              request: s.request,
              durationSec: s.durationSec,
              result: s.result,
              save: d.common.save,
            }}
          />
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{s.createdAt}</th>
              <th className="px-4 py-3 font-medium">{s.direction}</th>
              <th className="px-4 py-3 font-medium">{s.phone}</th>
              <th className="px-4 py-3 font-medium">{s.client}</th>
              <th className="px-4 py-3 font-medium">{s.request}</th>
              <th className="px-4 py-3 text-right font-medium">{s.durationSec}</th>
              <th className="px-4 py-3 font-medium">{s.result}</th>
              <th className="px-4 py-3 font-medium">{s.registeredBy}</th>
              {canEdit && <th className="px-4 py-3 font-medium">{d.common.actions}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 transition hover:bg-accent-soft/40">
                <td className="px-4 py-2.5 text-[13px]">{fmtAlmaty(r.created_at)}</td>
                <td className="px-4 py-2.5">{callDirectionBadge(r.direction, s)}</td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{r.phone}</td>
                <td className="px-4 py-2.5">{r.client_name ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-[13px]">
                  {r.request_id ? (
                    <Link
                      href={`/service/requests/${r.request_id}`}
                      className="text-accent-ink hover:underline"
                    >
                      {r.request_number}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">{r.duration_sec}</td>
                <td className="px-4 py-2.5">{r.result ?? "—"}</td>
                <td className="px-4 py-2.5">{r.registered_by ?? "—"}</td>
                {canEdit && (
                  <td className="px-4 py-2.5">
                    <CallRowActions id={r.id} deleteLabel={d.common.delete} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
