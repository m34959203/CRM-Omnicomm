import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { workloadReport } from "@/lib/reports/workload";
import { REPORT_READ_ROLES } from "@/lib/reports/common";
import { currentAlmatyPeriod } from "@/lib/billing/dates";
import { fmtMoney } from "../../payroll/badges";
import { ReportsTabs } from "../tabs";

export default async function ReportWorkloadPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!REPORT_READ_ROLES.includes(user.role)) redirect("/dashboard");
  const d = t(user.locale);
  const r = d.reports;
  const sp = await searchParams;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : currentAlmatyPeriod();

  const rows = await workloadReport(query, period);
  const totals = rows.reduce(
    (a, x) => ({
      plan: a.plan + x.planned_orders,
      fact: a.fact + x.closed_acts,
      piece: a.piece + x.piece_amount,
    }),
    { plan: 0, fact: 0, piece: 0 }
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{r.title}</h1>
        <a
          href={`/api/reports/workload/export?period=${period}`}
          className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
        >
          {d.common.exportExcel}
        </a>
      </div>
      <ReportsTabs d={d} active="workload" />

      <div className="mt-5 flex items-end justify-between gap-4">
        <h2 className="text-lg font-semibold">{r.workloadTitle}</h2>
        <form className="flex items-center gap-2">
          <label className="text-sm text-ink-dim">{r.period}</label>
          <input
            type="month"
            name="period"
            defaultValue={period}
            className="rounded-md border border-line bg-card px-3 py-1.5 text-sm outline-none transition focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-md border border-line bg-card px-3 py-1.5 text-sm transition hover:border-accent hover:text-accent-ink"
          >
            {r.show}
          </button>
        </form>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{r.performer}</th>
              <th className="px-4 py-3 font-medium text-right">{r.plannedOrders}</th>
              <th className="px-4 py-3 font-medium text-right">{r.closedActs}</th>
              <th className="px-4 py-3 font-medium text-right">{r.pieceAmount}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {rows.map((x) => (
              <tr
                key={x.user_id}
                className="border-b border-line transition hover:bg-accent-soft/40"
              >
                <td className="px-4 py-2.5 font-medium">{x.full_name}</td>
                <td className="px-4 py-2.5 text-right">{x.planned_orders}</td>
                <td className="px-4 py-2.5 text-right">{x.closed_acts}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[13px]">
                  {fmtMoney(x.piece_amount)}
                </td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="bg-paper/60 font-semibold">
                <td className="px-4 py-2.5">{d.billing.total}</td>
                <td className="px-4 py-2.5 text-right">{totals.plan}</td>
                <td className="px-4 py-2.5 text-right">{totals.fact}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[13px]">
                  {fmtMoney(totals.piece)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
