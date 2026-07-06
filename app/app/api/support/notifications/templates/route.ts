import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SUPPORT_WRITE_ROLES, NOTIFY_CHANNELS } from "@/lib/support/common";

/** Создание шаблона уведомления (код, канал, subject/body RU+KK). */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(SUPPORT_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.code?.trim()) return Response.json({ error: "code required" }, { status: 400 });
  if (!NOTIFY_CHANNELS.includes(b.channel)) {
    return Response.json({ error: "bad channel" }, { status: 400 });
  }
  if (!b.body_ru?.trim()) return Response.json({ error: "body_ru required" }, { status: 400 });

  try {
    const id = await tx(async (q) => {
      const [row] = await q<{ id: string }>(
        `INSERT INTO notification_templates (code, channel, subject_ru, subject_kk, body_ru, body_kk)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [b.code.trim(), b.channel, b.subject_ru?.trim() || null, b.subject_kk?.trim() || null,
         b.body_ru.trim(), b.body_kk?.trim() || null]
      );
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
         VALUES ($1, 'create', 'notification_template', $2)`,
        [userId, row.id]
      );
      return row.id;
    });
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      return Response.json({ error: "Шаблон с таким кодом уже есть" }, { status: 422 });
    }
    throw e;
  }
}
