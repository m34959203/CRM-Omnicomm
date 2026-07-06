import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { PAYROLL_WRITE_ROLES } from "@/lib/payroll/common";

/** Назначение категории исполнителю с датой valid_from (история сохраняется). */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(PAYROLL_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.user_id || !b?.category_id) {
    return Response.json({ error: "user_id и category_id обязательны" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    const [row] = await q<{ id: string }>(
      `INSERT INTO performer_category_assignments (user_id, category_id, valid_from)
       VALUES ($1::uuid, $2::uuid, COALESCE($3::date, CURRENT_DATE)) RETURNING id`,
      [b.user_id, b.category_id, b.valid_from || null]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'create', 'performer_category_assignment', $2, $3)`,
      [userId, row.id, JSON.stringify({ user_id: b.user_id, category_id: b.category_id })]
    );
    return row.id;
  });
  return Response.json({ id }, { status: 201 });
}
