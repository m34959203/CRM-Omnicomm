import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse } from "@/lib/excel";
import { activityReport } from "@/lib/reports/activity";
import { REPORT_READ_ROLES } from "@/lib/reports/common";
import { currentAlmatyPeriod } from "@/lib/billing/dates";
import { t } from "@/lib/i18n";

/** Excel активности оборудования по клиентам: ?period=YYYY-MM. */
export async function GET(req: Request) {
  let locale: "ru" | "kk";
  try {
    locale = (await requireRole(REPORT_READ_ROLES)).locale;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const d = t(locale);
  const r = d.reports;
  const period = new URL(req.url).searchParams.get("period") || currentAlmatyPeriod();
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return Response.json({ error: "period: YYYY-MM" }, { status: 400 });
  }
  const rows = await activityReport(query, period);
  return excelResponse(
    `${r.activityTitle} ${period}`,
    [
      { header: r.client, key: "client_name", width: 36 },
      { header: `${r.nowActive} (${r.currentSlice})`, key: "now_active", width: 16 },
      { header: `${r.nowConservation} (${r.currentSlice})`, key: "now_conservation", width: 18 },
      { header: `${r.nowDisabled} (${r.currentSlice})`, key: "now_disabled", width: 16 },
      { header: r.activeDays, key: "active_days", width: 16 },
      { header: r.conservationDays, key: "conservation_days", width: 18 },
      { header: r.billableDays, key: "billable_days", width: 18 },
    ],
    rows as unknown as Record<string, unknown>[]
  );
}
