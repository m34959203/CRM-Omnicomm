import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { PAYROLL_WRITE_ROLES } from "@/lib/payroll/common";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(PAYROLL_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: "bad body" }, { status: 400 });

  await tx(async (q) => {
    await q(
      `UPDATE work_rates SET
         rate = COALESCE($2::numeric, rate),
         valid_from = COALESCE($3::date, valid_from),
         is_active = COALESCE($4, is_active)
       WHERE id = $1::uuid`,
      [id, b.rate ?? null, b.valid_from || null, b.is_active ?? null]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'update', 'work_rate', $2)`,
      [userId, id]
    );
  });
  return Response.json({ ok: true });
}

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
  await tx(async (q) => {
    await q(`DELETE FROM work_rates WHERE id = $1::uuid`, [id]);
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'delete', 'work_rate', $2)`,
      [userId, id]
    );
  });
  return Response.json({ ok: true });
}
