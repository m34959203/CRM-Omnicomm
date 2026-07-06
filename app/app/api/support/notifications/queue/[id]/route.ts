import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SUPPORT_WRITE_ROLES } from "@/lib/support/common";

/** Отмена элемента очереди: только queued/failed → cancelled. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(SUPPORT_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (b?.status !== "cancelled") {
    return Response.json({ error: "status: cancelled" }, { status: 400 });
  }

  const [item] = await query<{ status: string }>(
    `SELECT status FROM notification_queue WHERE id = $1::uuid`,
    [id]
  );
  if (!item) return Response.json({ error: "not found" }, { status: 404 });
  if (!["queued", "failed"].includes(item.status)) {
    return Response.json({ error: "Отменить можно только queued/failed" }, { status: 422 });
  }

  await tx(async (q) => {
    await q(
      `UPDATE notification_queue SET status = 'cancelled' WHERE id = $1::uuid`,
      [id]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'cancel', 'notification_queue', $2)`,
      [userId, id]
    );
  });
  return Response.json({ ok: true });
}
