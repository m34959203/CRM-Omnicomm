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
      `UPDATE payroll_rules SET
         name = COALESCE($2, name),
         salary = COALESCE($3::numeric, salary),
         norm_count = COALESCE($4::int, norm_count),
         piece_over_norm = COALESCE($5, piece_over_norm),
         is_active = COALESCE($6, is_active)
       WHERE id = $1::uuid`,
      [id, b.name?.trim() || null, b.salary ?? null, b.norm_count ?? null,
       b.piece_over_norm ?? null, b.is_active ?? null]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'update', 'payroll_rule', $2)`,
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
    await q(`DELETE FROM payroll_rules WHERE id = $1::uuid`, [id]);
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'delete', 'payroll_rule', $2)`,
      [userId, id]
    );
  });
  return Response.json({ ok: true });
}
