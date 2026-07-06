import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse, dateRu } from "@/lib/excel";
import { t } from "@/lib/i18n";
import { PAYROLL_READ_ROLES } from "@/lib/payroll/common";

/** Excel «Ведомость по сдельному заработку» по строкам ведомости. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let locale: "ru" | "kk";
  try {
    locale = (await requireRole(PAYROLL_READ_ROLES)).locale;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const p = t(locale).payroll;

  const [sheet] = await query<{ period_start: string; period_end: string }>(
    `SELECT period_start::text, period_end::text FROM payroll_sheets WHERE id = $1::uuid`,
    [id]
  );
  if (!sheet) return Response.json({ error: "not found" }, { status: 404 });

  const rows = await query<Record<string, unknown>>(
    `SELECT u.full_name AS performer, l.acts_count, l.work_amount, l.salary_amount,
            l.bonus_amount, l.compensation_amount, l.deduction_amount, l.total,
            CASE WHEN l.threshold_met THEN $2 ELSE $3 END AS threshold_met
     FROM payroll_sheet_lines l
     JOIN users u ON u.id = l.user_id
     WHERE l.sheet_id = $1::uuid
     ORDER BY u.full_name`,
    [id, p.yes, p.no]
  );
  const num = (v: unknown) => Number(v);
  const mapped = rows.map((r) => ({
    ...r,
    work_amount: num(r.work_amount),
    salary_amount: num(r.salary_amount),
    bonus_amount: num(r.bonus_amount),
    compensation_amount: num(r.compensation_amount),
    deduction_amount: num(r.deduction_amount),
    total: num(r.total),
  }));
  return excelResponse(
    `${p.sheetTitle} ${sheet.period_start} — ${sheet.period_end}`,
    [
      { header: p.performer, key: "performer", width: 30 },
      { header: p.actsCount, key: "acts_count", width: 10 },
      { header: p.workAmount, key: "work_amount", width: 14, money: true },
      { header: p.salaryAmount, key: "salary_amount", width: 14, money: true },
      { header: p.bonusAmount, key: "bonus_amount", width: 14, money: true },
      { header: p.compensationAmount, key: "compensation_amount", width: 14, money: true },
      { header: p.deductionAmount, key: "deduction_amount", width: 14, money: true },
      { header: p.total, key: "total", width: 14, money: true },
      { header: p.thresholdMet, key: "threshold_met", width: 10 },
    ],
    mapped,
    {
      title: p.sheetTitle,
      period: `${dateRu(sheet.period_start)} – ${dateRu(sheet.period_end)}`,
    }
  );
}
