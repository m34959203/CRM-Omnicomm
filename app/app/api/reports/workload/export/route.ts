import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse, periodRu } from "@/lib/excel";
import { workloadReport } from "@/lib/reports/workload";
import { REPORT_READ_ROLES } from "@/lib/reports/common";
import { currentAlmatyPeriod } from "@/lib/billing/dates";
import { t } from "@/lib/i18n";

/** Excel загруженности исполнителей: ?period=YYYY-MM. */
export async function GET(req: Request) {
  let locale: "ru" | "kk";
  try {
    locale = (await requireRole(REPORT_READ_ROLES)).locale;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const d = t(locale);
  const period = new URL(req.url).searchParams.get("period") || currentAlmatyPeriod();
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return Response.json({ error: "period: YYYY-MM" }, { status: 400 });
  }
  const rows = await workloadReport(query, period);
  return excelResponse(
    `${d.reports.workloadTitle} ${period}`,
    [
      { header: d.reports.performer, key: "full_name", width: 32 },
      { header: d.reports.plannedOrders, key: "planned_orders", width: 24 },
      { header: d.reports.closedActs, key: "closed_acts", width: 24 },
      { header: d.reports.pieceAmount, key: "piece_amount", width: 22, money: true },
    ],
    rows as unknown as Record<string, unknown>[],
    { title: d.reports.workloadTitle, period: periodRu(period) }
  );
}
