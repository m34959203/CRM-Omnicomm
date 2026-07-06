import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { PAYROLL_WRITE_ROLES } from "@/lib/payroll/common";

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
    await q(`DELETE FROM performer_category_assignments WHERE id = $1::uuid`, [id]);
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'delete', 'performer_category_assignment', $2)`,
      [userId, id]
    );
  });
  return Response.json({ ok: true });
}
