import { requireRole, authErrorResponse } from "@/lib/auth";
import { buildPayrollSheet, PayrollError } from "@/lib/payroll/calc";
import { PAYROLL_WRITE_ROLES } from "@/lib/payroll/common";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Формирование ведомости за период (месяц/полмесяца) — buildPayrollSheet. */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(PAYROLL_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!DATE_RE.test(b?.period_start ?? "") || !DATE_RE.test(b?.period_end ?? "")) {
    return Response.json({ error: "period_start/period_end (YYYY-MM-DD) обязательны" }, { status: 400 });
  }
  if (b.period_end < b.period_start) {
    return Response.json({ error: "period_end раньше period_start" }, { status: 400 });
  }

  try {
    const r = await buildPayrollSheet(b.period_start, b.period_end, userId);
    return Response.json(
      { sheetId: r.sheetId || null, lines: r.lines.length, skipped: r.skipped ?? null },
      { status: r.skipped ? 200 : 201 }
    );
  } catch (e) {
    if (e instanceof PayrollError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
