import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { activityReport } from "@/lib/reports/activity";
import { REPORT_READ_ROLES } from "@/lib/reports/common";
import { currentAlmatyPeriod } from "@/lib/billing/dates";
import { ReportsTabs } from "../tabs";

export default async function ReportActivityPage({
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

  const rows = await activityReport(query, period);

  const num = (v: number, strong = false) => (
    <td className={`px-4 py-2.5 text-right ${strong ? "font-semibold" : ""} ${v === 0 ? "text-ink-dim" : ""}`}>
      {v}
    </td>
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{r.title}</h1>
        <a
          href={`/api/reports/activity/export?period=${period}`}
          className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
        >
          {d.common.exportExcel}
        </a>
      </div>
      <ReportsTabs d={d} active="activity" />

      <div className="mt-5 flex items-end justify-between gap-4">
        <h2 className="text-lg font-semibold">{r.activityTitle}</h2>
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
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-dim">
              <th rowSpan={2} className="px-4 py-2 font-medium align-bottom">{r.client}</th>
              <th colSpan={3} className="border-b border-line/60 px-4 py-2 text-center font-medium">
                {r.currentSlice}
              </th>
              <th colSpan={3} className="border-b border-line/60 px-4 py-2 text-center font-medium">
                {r.daysInMonth}
              </th>
            </tr>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-2 font-medium text-right">{r.nowActive}</th>
              <th className="px-4 py-2 font-medium text-right">{r.nowConservation}</th>
              <th className="px-4 py-2 font-medium text-right">{r.nowDisabled}</th>
              <th className="px-4 py-2 font-medium text-right">{r.activeDays}</th>
              <th className="px-4 py-2 font-medium text-right">{r.conservationDays}</th>
              <th className="px-4 py-2 font-medium text-right">{r.billableDays}</th>
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
            {rows.map((x) => (
              <tr
                key={x.client_id}
                className="border-b border-line last:border-0 transition hover:bg-accent-soft/40"
              >
                <td className="px-4 py-2.5 font-medium">{x.client_name}</td>
                {num(x.now_active)}
                {num(x.now_conservation)}
                {num(x.now_disabled)}
                {num(x.active_days)}
                {num(x.conservation_days)}
                {num(x.billable_days, true)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
