import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { cancelPayrollSheet, PayrollError } from "@/lib/payroll/calc";
import { PAYROLL_WRITE_ROLES, PAYROLL_APPROVE_ROLES } from "@/lib/payroll/common";

/** Статусы ведомости: draft → approved → paid. approve/paid — только admin/head. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(PAYROLL_APPROVE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!["approve", "paid"].includes(b?.action)) {
    return Response.json({ error: "action: approve | paid" }, { status: 400 });
  }

  const [sheet] = await query<{ status: string }>(
    `SELECT status FROM payroll_sheets WHERE id = $1::uuid`,
    [id]
  );
  if (!sheet) return Response.json({ error: "not found" }, { status: 404 });

  const next = b.action === "approve" ? "approved" : "paid";
  const expected = b.action === "approve" ? "draft" : "approved";
  if (sheet.status !== expected) {
    return Response.json(
      { error: `Переход ${sheet.status} → ${next} недопустим` },
      { status: 422 }
    );
  }

  await tx(async (q) => {
    await q(`UPDATE payroll_sheets SET status = $2 WHERE id = $1::uuid`, [id, next]);
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, $2, 'payroll_sheet', $3, $4)`,
      [userId, b.action === "approve" ? "approve" : "mark_paid", id,
       JSON.stringify({ from: sheet.status, to: next })]
    );
  });
  return Response.json({ ok: true, status: next });
}

/** Отмена черновика: строки удаляются, записи открепляются (cancelPayrollSheet). */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(PAYROLL_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  try {
    await cancelPayrollSheet(id, userId);
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof PayrollError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}
