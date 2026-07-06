import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { orderStatusBadge, actStatusBadge, fmtAlmaty, fmtDateAlmaty } from "../../badges";
import { OrderActions } from "./order-actions";

type OrderRow = {
  id: string;
  number: string;
  client_id: string | null;
  client_name: string | null;
  object_name: string | null;
  request_id: string | null;
  request_number: string | null;
  address: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  status: string;
  note: string | null;
  created_at: string;
};

export default async function OrderCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const s = d.service;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [[wo], performers, trips, acts, installers, stock] = await Promise.all([
    query<OrderRow>(
      `SELECT w.id, w.number, w.client_id, c.name AS client_name, o.name AS object_name,
              w.request_id, r.number AS request_number, w.address,
              w.scheduled_start, w.scheduled_end, w.status, w.note, w.created_at
       FROM work_orders w
       LEFT JOIN clients c ON c.id = w.client_id
       LEFT JOIN monitoring_objects o ON o.id = w.object_id
       LEFT JOIN requests r ON r.id = w.request_id
       WHERE w.id = $1::uuid`,
      [id]
    ),
    query<{ user_id: string; full_name: string; is_lead: boolean }>(
      `SELECT p.user_id, u.full_name, p.is_lead
       FROM work_order_performers p JOIN users u ON u.id = p.user_id
       WHERE p.work_order_id = $1::uuid ORDER BY p.is_lead DESC, u.full_name`,
      [id]
    ),
    query<{
      id: string; date_from: string; date_to: string; transport: string | null;
      cost: string; include_in_cost: boolean;
    }>(
      `SELECT id, date_from, date_to, transport, cost, include_in_cost
       FROM work_order_trips WHERE work_order_id = $1::uuid ORDER BY date_from`,
      [id]
    ),
    query<{ id: string; number: string | null; status: string; created_at: string }>(
      `SELECT id, number, status, created_at FROM maintenance_acts
       WHERE work_order_id = $1::uuid ORDER BY created_at DESC`,
      [id]
    ),
    query<{ id: string; full_name: string }>(
      `SELECT u.id, u.full_name FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.is_active AND r.code = 'installer' ORDER BY u.full_name`
    ),
    query<{ id: string; label: string }>(
      `SELECT e.id, n.name || COALESCE(' · SN ' || e.serial_number, '')
              || COALESCE(' · ' || w.name, '') AS label
       FROM equipment_items e
       JOIN nomenclature n ON n.id = e.nomenclature_id
       LEFT JOIN warehouses w ON w.id = e.warehouse_id
       WHERE e.status IN ('in_stock', 'reserved')
       ORDER BY n.name, e.serial_number
       LIMIT 300`
    ),
  ]);
  if (!wo) notFound();

  const canEdit = ["admin", "manager", "support", "head"].includes(user.role);
  const info: [string, React.ReactNode][] = [
    [s.client, wo.client_name ?? "—"],
    [s.object, wo.object_name ?? "—"],
    [s.address, wo.address ?? "—"],
    [
      s.fromRequest,
      wo.request_id ? (
        <Link
          key="req"
          href={`/service/requests/${wo.request_id}`}
          className="font-mono text-accent-ink hover:underline"
        >
          {wo.request_number}
        </Link>
      ) : (
        "—"
      ),
    ],
    [s.scheduledStart, fmtAlmaty(wo.scheduled_start)],
    [s.scheduledEnd, fmtAlmaty(wo.scheduled_end)],
  ];

  return (
    <div className="max-w-5xl">
      <Link href="/service/orders" className="text-sm text-ink-dim hover:text-accent-ink">
        ← {s.ordersTitle}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{wo.number}</h1>
        {orderStatusBadge(wo.status, s)}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-lg border border-line bg-card p-5">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {info.map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-xs uppercase tracking-wider text-ink-dim">{k}</dt>
                  <dd className="mt-0.5 text-sm">{v}</dd>
                </div>
              ))}
            </dl>
            {wo.note && (
              <p className="mt-4 border-t border-line pt-3 text-sm text-ink-dim">{wo.note}</p>
            )}
          </div>

          {canEdit && (
            <OrderActions
              id={wo.id}
              status={wo.status}
              performers={performers}
              trips={trips}
              installers={installers}
              stock={stock}
              s={s}
              common={{ save: d.common.save, delete: d.common.delete }}
            />
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-line bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
              {s.performers}
            </h2>
            <ul className="mt-2 space-y-1">
              {performers.length === 0 && <li className="text-sm text-ink-dim">—</li>}
              {performers.map((p) => (
                <li key={p.user_id} className="text-sm">
                  {p.full_name}
                  {p.is_lead && (
                    <span className="ml-1.5 rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent-ink">
                      {s.lead}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-line bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
              {s.trips}
            </h2>
            <ul className="mt-2 space-y-1.5">
              {trips.length === 0 && <li className="text-sm text-ink-dim">—</li>}
              {trips.map((tr) => (
                <li key={tr.id} className="text-sm">
                  {fmtDateAlmaty(tr.date_from)} — {fmtDateAlmaty(tr.date_to)}
                  {tr.transport && <span className="text-ink-dim"> · {tr.transport}</span>}
                  <span className="text-ink-dim">
                    {" "}
                    · {Number(tr.cost).toLocaleString("ru-RU")} ₸
                    {tr.include_in_cost ? "" : " (себестоимость)"}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-line bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
              {s.acts}
            </h2>
            <ul className="mt-2 space-y-1.5">
              {acts.length === 0 && <li className="text-sm text-ink-dim">—</li>}
              {acts.map((a) => (
                <li key={a.id} className="flex items-center gap-2 text-sm">
                  <Link
                    href={`/service/acts/${a.id}`}
                    className="font-mono text-[13px] font-medium text-accent-ink hover:underline"
                  >
                    {a.number ?? a.id.slice(0, 8)}
                  </Link>
                  {actStatusBadge(a.status, s)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
