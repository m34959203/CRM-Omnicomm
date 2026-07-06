import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { mOrderBadge, mActBadge } from "../../badges";
import { fmtPeriod, fmtTime } from "../../fmt";
import { VisitActions, type StepRow } from "./visit-actions";
import { CreateActButton } from "./act-button";

/** Карточка наряда техника: клиент/объект/адрес (2ГИС, geo:), шаги выезда, акт. */

type Order = {
  id: string;
  number: string;
  status: string;
  address: string | null;
  note: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  client_name: string | null;
  client_phone: string | null;
  object_name: string | null;
  request_number: string | null;
  request_type: string | null;
};

export default async function MobileOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login?next=/m");
  const d = t(user.locale);
  const m = d.mobile;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [order] = await query<Order>(
    `SELECT w.id, w.number, w.status, w.address, w.note, w.scheduled_start, w.scheduled_end,
            c.name AS client_name, c.phone AS client_phone, o.name AS object_name,
            r.number AS request_number, r.type AS request_type
     FROM work_orders w
     LEFT JOIN clients c ON c.id = w.client_id
     LEFT JOIN monitoring_objects o ON o.id = w.object_id
     LEFT JOIN requests r ON r.id = w.request_id
     WHERE w.id = $1::uuid`,
    [id]
  );
  if (!order) notFound();

  const [stepsRaw, acts, performers] = await Promise.all([
    query<{ id: string; step: string; note: string | null; created_at: string; lat: number | null }>(
      `SELECT vs.id, vs.step, vs.note, vs.created_at, vs.lat
       FROM visit_steps vs
       JOIN visits v ON v.id = vs.visit_id
       WHERE v.work_order_id = $1::uuid AND v.installer_id = $2::uuid
       ORDER BY vs.created_at`,
      [id, user.userId]
    ),
    query<{ id: string; number: string | null; status: string; performed_by: string | null }>(
      `SELECT id, number, status, performed_by FROM maintenance_acts
       WHERE work_order_id = $1::uuid ORDER BY created_at DESC`,
      [id]
    ),
    query<{ full_name: string; is_lead: boolean }>(
      `SELECT u.full_name, p.is_lead FROM work_order_performers p
       JOIN users u ON u.id = p.user_id WHERE p.work_order_id = $1::uuid
       ORDER BY p.is_lead DESC, u.full_name`,
      [id]
    ),
  ]);

  const steps: StepRow[] = stepsRaw.map((s) => ({
    id: s.id,
    step: s.step,
    note: s.note,
    created_at: s.created_at,
    time: fmtTime(s.created_at),
    has_geo: s.lat !== null,
  }));

  const active = !["done", "cancelled"].includes(order.status);
  const myOpenAct = acts.find((a) => a.status === "in_preparation");
  const addr = order.address?.trim();

  const infoRow = "flex items-start justify-between gap-3 py-2.5";
  const infoKey = "shrink-0 text-xs uppercase tracking-wider text-chrome-dim pt-0.5";
  const infoVal = "text-right text-sm text-white";

  return (
    <div>
      <Link href="/m/orders" className="text-sm text-chrome-dim active:text-accent">
        ← {m.myOrders}
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2">
        <h1 className="font-mono text-xl font-semibold text-white">{order.number}</h1>
        {mOrderBadge(order.status, d.service)}
      </div>

      {/* сводка */}
      <div className="mt-4 rounded-xl border border-chrome-line bg-chrome-raised px-4 divide-y divide-chrome-line">
        <div className={infoRow}>
          <span className={infoKey}>{m.order.client}</span>
          <span className={infoVal}>{order.client_name ?? "—"}</span>
        </div>
        <div className={infoRow}>
          <span className={infoKey}>{m.order.object}</span>
          <span className={infoVal}>{order.object_name ?? "—"}</span>
        </div>
        <div className={infoRow}>
          <span className={infoKey}>{m.order.period}</span>
          <span className={`${infoVal} font-mono`}>
            {fmtPeriod(order.scheduled_start, order.scheduled_end) ?? m.order.noSchedule}
          </span>
        </div>
        {order.request_number && (
          <div className={infoRow}>
            <span className={infoKey}>{m.order.request}</span>
            <span className={infoVal}>
              <span className="font-mono">{order.request_number}</span>
              {order.request_type
                ? ` · ${(d.service.requestTypes as Record<string, string>)[order.request_type] ?? ""}`
                : ""}
            </span>
          </div>
        )}
        {performers.length > 1 && (
          <div className={infoRow}>
            <span className={infoKey}>{m.order.performers}</span>
            <span className={infoVal}>{performers.map((p) => p.full_name).join(", ")}</span>
          </div>
        )}
        {order.note && (
          <div className={infoRow}>
            <span className={infoKey}>{m.order.note}</span>
            <span className={infoVal}>{order.note}</span>
          </div>
        )}
      </div>

      {/* адрес + навигация + звонок */}
      {(addr || order.client_phone) && (
        <div className="mt-3 rounded-xl border border-chrome-line bg-chrome-raised px-4 py-3.5">
          {addr && <p className="text-sm text-white">{addr}</p>}
          <div className="mt-3 grid grid-cols-3 gap-2">
            {addr && (
              <>
                <a
                  href={`https://2gis.kz/search/${encodeURIComponent(addr)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex min-h-11 items-center justify-center rounded-lg border border-chrome-line text-sm font-medium text-chrome-text transition active:scale-95"
                >
                  {m.order.route2gis}
                </a>
                <a
                  href={`geo:0,0?q=${encodeURIComponent(addr)}`}
                  className="flex min-h-11 items-center justify-center rounded-lg border border-chrome-line text-sm font-medium text-chrome-text transition active:scale-95"
                >
                  {m.order.routeGeo}
                </a>
              </>
            )}
            {order.client_phone && (
              <a
                href={`tel:${order.client_phone.replace(/[^+\d]/g, "")}`}
                className={`flex min-h-11 items-center justify-center rounded-lg border border-accent/50 bg-accent/10 text-sm font-medium text-accent transition active:scale-95 ${
                  addr ? "" : "col-span-3"
                }`}
              >
                {m.order.call}
              </a>
            )}
          </div>
        </div>
      )}

      {/* шаги выезда */}
      {active && (
        <section className="mt-5">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
              {m.steps.title}
            </span>
            <span className="h-px flex-1 bg-chrome-line" aria-hidden />
          </div>
          <div className="mt-3">
            <VisitActions orderId={order.id} steps={steps} labels={m.steps} />
          </div>
        </section>
      )}

      {/* акт */}
      <section className="mt-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
            {m.order.acts}
          </span>
          <span className="h-px flex-1 bg-chrome-line" aria-hidden />
        </div>
        <div className="mt-3 space-y-2">
          {acts.map((a) => (
            <Link
              key={a.id}
              href={`/m/acts/${a.id}`}
              className="flex min-h-13 items-center justify-between rounded-xl border border-chrome-line bg-chrome-raised px-4 transition active:scale-[0.98]"
            >
              <span className="font-mono text-sm text-white">
                {a.number ?? m.order.openAct}
              </span>
              {mActBadge(a.status, d.service)}
            </Link>
          ))}
          {active && !myOpenAct && (
            <CreateActButton orderId={order.id} label={m.order.createAct} />
          )}
        </div>
      </section>
    </div>
  );
}
