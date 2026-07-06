import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { ServiceTabs } from "../tabs";
import { actStatusBadge, fmtAlmaty } from "../badges";

type Row = {
  id: string;
  number: string | null;
  status: string;
  wo_number: string;
  client_name: string | null;
  object_name: string | null;
  performer_name: string | null;
  closed_at: string | null;
  created_at: string;
};

export default async function ActsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const s = d.service;
  const sp = await searchParams;
  const status = sp.status ?? "";

  const rows = await query<Row>(
    `SELECT a.id, a.number, a.status, w.number AS wo_number,
            c.name AS client_name, o.name AS object_name,
            u.full_name AS performer_name, a.closed_at, a.created_at
     FROM maintenance_acts a
     JOIN work_orders w ON w.id = a.work_order_id
     LEFT JOIN clients c ON c.id = w.client_id
     LEFT JOIN monitoring_objects o ON o.id = w.object_id
     LEFT JOIN users u ON u.id = a.performed_by
     WHERE ($1 = '' OR a.status = $1)
     ORDER BY a.created_at DESC
     LIMIT 500`,
    [status]
  );

  const sel =
    "rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none transition focus:border-accent";

  return (
    <div>
      <h1 className="text-2xl font-semibold">{s.actsTitle}</h1>
      <ServiceTabs d={d} active="acts" />

      <form method="GET" className="mt-4 flex items-center gap-2">
        <select name="status" defaultValue={status} className={sel}>
          <option value="">{s.allStatuses}</option>
          {Object.entries(s.actStatuses as Record<string, string>).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
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
              <th className="px-4 py-3 font-medium">{s.workOrder}</th>
              <th className="px-4 py-3 font-medium">{s.client}</th>
              <th className="px-4 py-3 font-medium">{s.object}</th>
              <th className="px-4 py-3 font-medium">{s.performedBy}</th>
              <th className="px-4 py-3 font-medium">{s.status}</th>
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
              <tr
                key={r.id}
                className="border-b border-line last:border-0 transition hover:bg-accent-soft/40"
              >
                <td className="px-4 py-2.5 font-mono text-[13px]">
                  <Link href={`/service/acts/${r.id}`} className="font-medium text-accent-ink hover:underline">
                    {r.number ?? "(черновик)"}
                  </Link>
                </td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{r.wo_number}</td>
                <td className="px-4 py-2.5">{r.client_name ?? "—"}</td>
                <td className="px-4 py-2.5">{r.object_name ?? "—"}</td>
                <td className="px-4 py-2.5">{r.performer_name ?? "—"}</td>
                <td className="px-4 py-2.5">{actStatusBadge(r.status, s)}</td>
                <td className="px-4 py-2.5 text-[13px]">{fmtAlmaty(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
