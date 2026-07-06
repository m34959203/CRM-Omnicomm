import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SERVICE_WRITE_ROLES } from "@/lib/service/common";
import { notifyOrderAssigned } from "@/lib/notify/order-assigned";

/** Добавить исполнителя наряда. body: { user_id, is_lead? } */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(SERVICE_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b?.user_id) return Response.json({ error: "user_id required" }, { status: 400 });

  const [wo] = await query(`SELECT id FROM work_orders WHERE id = $1::uuid`, [id]);
  if (!wo) return Response.json({ error: "not found" }, { status: 404 });

  await tx(async (q) => {
    await q(
      `INSERT INTO work_order_performers (work_order_id, user_id, is_lead)
       VALUES ($1::uuid, $2::uuid, COALESCE($3, false))
       ON CONFLICT (work_order_id, user_id) DO UPDATE SET is_lead = COALESCE($3, false)`,
      [id, b.user_id, b.is_lead]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'assign_performer', 'work_order', $2, jsonb_build_object('performer', $3::text))`,
      [userId, id, b.user_id]
    );
  });
  // web-push + telegram технику; ошибки уведомлений назначение не роняют
  await notifyOrderAssigned(b.user_id, id);
  return Response.json({ ok: true });
}

/** Убрать исполнителя. body: { user_id } */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(SERVICE_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b?.user_id) return Response.json({ error: "user_id required" }, { status: 400 });
  await tx(async (q) => {
    await q(
      `DELETE FROM work_order_performers WHERE work_order_id = $1::uuid AND user_id = $2::uuid`,
      [id, b.user_id]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'remove_performer', 'work_order', $2, jsonb_build_object('performer', $3::text))`,
      [userId, id, b.user_id]
    );
  });
  return Response.json({ ok: true });
}
