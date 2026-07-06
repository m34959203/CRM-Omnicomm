import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { installerCards } from "@/lib/reports/installers";
import { currentAlmatyPeriod } from "@/lib/billing/dates";
import { ReportsTabs } from "../tabs";

export default async function InstallersReportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const { period = currentAlmatyPeriod() } = await searchParams;
  const rows = await installerCards(query, period);

  const th = "px-4 py-3 font-medium";
  const td = "px-4 py-2.5";

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{d.reports.title}</h1>
        <div className="flex items-center gap-2">
          <form>
            <input
              type="month"
              name="period"
              defaultValue={period}
              className="rounded-md border border-line bg-card px-3 py-2 text-sm"
            />
          </form>
          <a
            href={`/api/reports/installers/export?period=${period}`}
            className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
          >
            {d.common.exportExcel}
          </a>
        </div>
      </div>
      <ReportsTabs d={d} active="installers" />

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className={th}>{d.clients.manager}</th>
              <th className={th}>{d.reports.instActive}</th>
              <th className={th}>{d.reports.instDone}</th>
              <th className={th}>{d.reports.instOverdue}</th>
              <th className={th}>{d.reports.instArrival}</th>
              <th className={th}>{d.reports.instWork}</th>
              <th className={th}>{d.reports.instRepeats}</th>
              <th className={th}>{d.reports.instQuality}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-dim">{d.common.empty}</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.user_id} className="border-b border-line last:border-0 transition hover:bg-accent-soft/40">
                <td className={`${td} font-medium`}>{r.full_name}</td>
                <td className={td}>{r.active_requests}</td>
                <td className={td}>{r.done_acts}</td>
                <td className={`${td} ${r.overdue_requests > 0 ? "font-semibold text-danger" : ""}`}>{r.overdue_requests}</td>
                <td className={`${td} font-mono text-[13px]`}>{r.avg_arrival_min ?? "—"}</td>
                <td className={`${td} font-mono text-[13px]`}>{r.avg_work_min ?? "—"}</td>
                <td className={td}>{r.repeat_visits + r.rework_acts}</td>
                <td className={td}>
                  {r.quality_pct === null ? "—" : (
                    <span className={r.quality_pct >= 90 ? "font-semibold text-ok" : r.quality_pct >= 70 ? "text-warn" : "text-danger"}>
                      {r.quality_pct}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
