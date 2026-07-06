import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SUPPORT_WRITE_ROLES, NOTIFY_CHANNELS } from "@/lib/support/common";

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
  if (!b) return Response.json({ error: "bad body" }, { status: 400 });
  if (b.channel && !NOTIFY_CHANNELS.includes(b.channel)) {
    return Response.json({ error: "bad channel" }, { status: 400 });
  }

  await tx(async (q) => {
    await q(
      `UPDATE notification_templates SET
         channel = COALESCE($2, channel),
         subject_ru = COALESCE($3, subject_ru),
         subject_kk = COALESCE($4, subject_kk),
         body_ru = COALESCE($5, body_ru),
         body_kk = COALESCE($6, body_kk),
         is_active = COALESCE($7, is_active)
       WHERE id = $1::uuid`,
      [id, b.channel ?? null, b.subject_ru?.trim() ?? null, b.subject_kk?.trim() ?? null,
       b.body_ru?.trim() || null, b.body_kk?.trim() ?? null, b.is_active ?? null]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'update', 'notification_template', $2)`,
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
    userId = (await requireRole(SUPPORT_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  await tx(async (q) => {
    await q(`DELETE FROM notification_templates WHERE id = $1::uuid`, [id]);
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'delete', 'notification_template', $2)`,
      [userId, id]
    );
  });
  return Response.json({ ok: true });
}
