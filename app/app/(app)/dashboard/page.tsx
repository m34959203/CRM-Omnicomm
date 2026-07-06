import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { dashboardData } from "@/lib/reports/dashboard";
import { fmtMoney } from "../payroll/badges";

export default async function DashboardPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role === "installer") redirect("/m");
  const d = t(user.locale);
  const db = d.dashboard;

  const data = await dashboardData(query);
  const paidShare =
    data.billing.billed > 0
      ? Math.min(100, Math.round((data.billing.paid / data.billing.billed) * 100))
      : 0;
  const requestsTotal = data.requests.reduce((a, r) => a + r.count, 0);
  const reqLabels = d.service.requestStatuses as Record<string, string>;

  const tile =
    "block rounded-lg border border-line bg-card p-4 transition hover:border-accent";

  return (
    <div>
      <h1 className="text-2xl font-semibold">{db.title}</h1>

      {/* стат-плитки */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Link href="/service/requests" className={tile}>
          <div className="text-xs uppercase tracking-wider text-ink-dim">{db.openRequests}</div>
          <div className="mt-1 text-2xl font-semibold">{requestsTotal}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {data.requests.slice(0, 4).map((r) => (
              <span
                key={r.status}
                className="rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim"
              >
                {reqLabels[r.status] ?? r.status}: {r.count}
              </span>
            ))}
          </div>
        </Link>
        <Link
          href="/service/requests"
          className={`${tile} ${data.overdueRequests > 0 ? "border-danger/40" : ""}`}
        >
          <div className="text-xs uppercase tracking-wider text-ink-dim">{db.overdue}</div>
          <div
            className={`mt-1 text-2xl font-semibold ${data.overdueRequests > 0 ? "text-danger" : ""}`}
          >
            {data.overdueRequests}
          </div>
        </Link>
        <Link href="/service/schedule" className={tile}>
          <div className="text-xs uppercase tracking-wider text-ink-dim">{db.ordersToday}</div>
          <div className="mt-1 text-2xl font-semibold">{data.ordersToday}</div>
        </Link>
        <Link href="/support/tickets" className={tile}>
          <div className="text-xs uppercase tracking-wider text-ink-dim">{db.openTickets}</div>
          <div className="mt-1 text-2xl font-semibold">{data.openTickets}</div>
        </Link>
        <Link
          href="/telematics/log"
          className={`${tile} ${data.syncErrors24h > 0 ? "border-warn/50" : ""}`}
        >
          <div className="text-xs uppercase tracking-wider text-ink-dim">{db.syncErrors}</div>
          <div
            className={`mt-1 text-2xl font-semibold ${data.syncErrors24h > 0 ? "text-warn" : ""}`}
          >
            {data.syncErrors24h}
          </div>
          {data.syncErrors24h > 0 && (
            <div className="mt-1 text-[11px] font-medium text-warn">{db.syncErrorsHint}</div>
          )}
        </Link>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* биллинг месяца */}
        <div className="rounded-lg border border-line bg-card p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
              {db.billingMonth}
            </h2>
            <span className="font-mono text-xs text-ink-dim">{data.billing.period}</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-dim">{db.billed}</div>
              <div className="mt-0.5 font-mono text-sm font-semibold">
                {fmtMoney(data.billing.billed)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-dim">{db.paid}</div>
              <div className="mt-0.5 font-mono text-sm font-semibold text-ok">
                {fmtMoney(data.billing.paid)}
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-ink-dim">
                {db.documents}
              </div>
              <div className="mt-0.5 font-mono text-sm font-semibold">
                {data.billing.documents}
              </div>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-[11px] text-ink-dim">
              <span>{db.paidShare}</span>
              <span className="font-mono">{paidShare}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-paper">
              <div className="h-full rounded-full bg-ok" style={{ width: `${paidShare}%` }} />
            </div>
          </div>
          <Link
            href="/billing/documents"
            className="mt-3 inline-block text-xs font-medium text-accent-ink hover:underline"
          >
            {d.billing.documents} →
          </Link>
        </div>

        {/* топ должников */}
        <div className="rounded-lg border border-line bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
            {db.topDebtors}
          </h2>
          <div className="mt-3 space-y-2">
            {data.topDebtors.length === 0 && (
              <div className="py-4 text-center text-sm text-ink-dim">{db.noData}</div>
            )}
            {data.topDebtors.map((x) => (
              <div key={x.client_name} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{x.client_name}</span>
                <span className="font-mono text-[13px] font-semibold text-danger">
                  {fmtMoney(x.debt)}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/billing/settlements"
            className="mt-3 inline-block text-xs font-medium text-accent-ink hover:underline"
          >
            {db.allSettlements} →
          </Link>
        </div>

        {/* занятость техников */}
        <div className="rounded-lg border border-line bg-card p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
            {db.techBusy}
          </h2>
          <div className="mt-3 space-y-2">
            {data.installersBusy.length === 0 && (
              <div className="py-4 text-center text-sm text-ink-dim">{db.noData}</div>
            )}
            {data.installersBusy.map((x) => (
              <div key={x.full_name} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{x.full_name}</span>
                <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink">
                  {x.orders} {db.ordersInWork}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/service/schedule"
            className="mt-3 inline-block text-xs font-medium text-accent-ink hover:underline"
          >
            {d.service.tabSchedule} →
          </Link>
        </div>
      </div>

      {/* оборудование */}
      <div className="mt-4 rounded-lg border border-line bg-card p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
            {db.equipmentTitle}
          </h2>
          <Link
            href="/reports/equipment"
            className="text-xs font-medium text-accent-ink hover:underline"
          >
            {d.reports.equipmentTitle} →
          </Link>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
          {(
            [
              [db.eqInstalled, data.equipment.installed],
              [db.eqInStock, data.equipment.in_stock],
              [db.eqWithTech, data.equipment.with_technician],
              [db.eqTesting, data.equipment.on_testing],
              [db.eqSupplier, data.equipment.at_supplier],
            ] as [string, number][]
          ).map(([label, value]) => (
            <div key={label} className="rounded-md bg-paper px-2 py-3">
              <div className="text-[11px] uppercase tracking-wider text-ink-dim">{label}</div>
              <div className="mt-0.5 text-xl font-semibold">{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
