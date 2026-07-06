import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { mOrderBadge } from "../badges";
import { fmtPeriod } from "../fmt";

/** Мои наряды: user ∈ work_order_performers, статус не done/cancelled; сегодня/неделя/все. */

type Row = {
  id: string;
  number: string;
  status: string;
  address: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  client_name: string | null;
  object_name: string | null;
  acts_open: string;
};

export default async function MobileOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login?next=/m");
  const d = t(user.locale);
  const m = d.mobile;
  const f = ["today", "week", "all"].includes((await searchParams).f ?? "")
    ? ((await searchParams).f as "today" | "week" | "all")
    : "today";

  const rows = await query<Row>(
    `SELECT w.id, w.number, w.status, w.address, w.scheduled_start, w.scheduled_end,
            c.name AS client_name, o.name AS object_name,
            (SELECT count(*) FROM maintenance_acts a
             WHERE a.work_order_id = w.id AND a.status = 'in_preparation') AS acts_open
     FROM work_orders w
     JOIN work_order_performers p ON p.work_order_id = w.id AND p.user_id = $1::uuid
     LEFT JOIN clients c ON c.id = w.client_id
     LEFT JOIN monitoring_objects o ON o.id = w.object_id
     WHERE w.status NOT IN ('done','cancelled')
       AND ($2 <> 'today' OR (w.scheduled_start AT TIME ZONE 'Asia/Almaty')::date
                            = (now() AT TIME ZONE 'Asia/Almaty')::date)
       AND ($2 <> 'week' OR (w.scheduled_start AT TIME ZONE 'Asia/Almaty')::date
                          BETWEEN (now() AT TIME ZONE 'Asia/Almaty')::date
                              AND (now() AT TIME ZONE 'Asia/Almaty')::date + 6)
     ORDER BY w.scheduled_start NULLS LAST, w.created_at DESC
     LIMIT 200`,
    [user.userId, f]
  );

  const tabs: ["today" | "week" | "all", string][] = [
    ["today", m.filters.today],
    ["week", m.filters.week],
    ["all", m.filters.all],
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">{m.myOrders}</h1>

      {/* сегментированный фильтр */}
      <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl border border-chrome-line bg-chrome-raised p-1">
        {tabs.map(([key, label]) => (
          <Link
            key={key}
            href={`/m/orders?f=${key}`}
            className={`flex min-h-10 items-center justify-center rounded-lg text-sm font-medium transition ${
              f === key ? "bg-accent text-white" : "text-chrome-dim active:bg-chrome"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {rows.length === 0 && (
          <p className="rounded-xl border border-dashed border-chrome-line px-4 py-10 text-center text-sm text-chrome-dim">
            {m.order.empty}
          </p>
        )}
        {rows.map((r) => (
          <Link
            key={r.id}
            href={`/m/orders/${r.id}`}
            className="block rounded-xl border border-chrome-line bg-chrome-raised px-4 py-3.5 transition active:scale-[0.98]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm font-semibold text-white">{r.number}</span>
              <span className="flex items-center gap-1.5">
                {Number(r.acts_open) > 0 && (
                  <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                    {m.order.acts}
                  </span>
                )}
                {mOrderBadge(r.status, d.service)}
              </span>
            </div>
            <div className="mt-1.5 text-sm text-chrome-text">
              {r.client_name ?? "—"}
              {r.object_name ? ` · ${r.object_name}` : ""}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-chrome-dim">
              <span className="truncate">{r.address ?? "—"}</span>
              <span className="shrink-0 font-mono">
                {fmtPeriod(r.scheduled_start, r.scheduled_end) ?? m.order.noSchedule}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
