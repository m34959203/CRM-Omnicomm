import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse, periodRu } from "@/lib/excel";
import { installerCards } from "@/lib/reports/installers";
import { currentAlmatyPeriod } from "@/lib/billing/dates";
import { REPORT_READ_ROLES } from "@/lib/reports/common";

export async function GET(req: Request) {
  try {
    await requireRole(REPORT_READ_ROLES);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const period = new URL(req.url).searchParams.get("period") ?? currentAlmatyPeriod();
  const rows = await installerCards(query, period);
  return excelResponse(
    "Карточки монтажников",
    [
      { header: "Специалист", key: "full_name", width: 28 },
      { header: "Активных заявок", key: "active_requests", width: 14 },
      { header: "Закрыто актов", key: "done_acts", width: 13 },
      { header: "Просрочено", key: "overdue_requests", width: 12 },
      { header: "Ср. прибытие, мин", key: "avg_arrival_min", width: 16 },
      { header: "Ср. работа, мин", key: "avg_work_min", width: 15 },
      { header: "Повторные выезды", key: "repeat_visits", width: 16 },
      { header: "Доработки", key: "rework_acts", width: 11 },
      { header: "Качество, %", key: "quality_pct", width: 12 },
    ],
    rows as unknown as Record<string, unknown>[],
    { title: "Карточки монтажников", period: periodRu(period) }
  );
}
