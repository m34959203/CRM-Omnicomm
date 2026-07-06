import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SUPPORT_WRITE_ROLES, MESSAGE_CHANNELS } from "@/lib/support/common";

/** Ручное добавление заметки в журнал сообщений (сами каналы пишут сюда интеграции). */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(SUPPORT_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.text?.trim()) return Response.json({ error: "text required" }, { status: 400 });
  if (!MESSAGE_CHANNELS.includes(b.channel)) {
    return Response.json({ error: "bad channel" }, { status: 400 });
  }
  if (b.direction && !["in", "out"].includes(b.direction)) {
    return Response.json({ error: "bad direction" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    const [row] = await q<{ id: string }>(
      `INSERT INTO messages (channel, direction, contact, client_id, ticket_id, text)
       VALUES ($1, COALESCE($2, 'in'), $3, $4::uuid, $5::uuid, $6)
       RETURNING id`,
      [b.channel, b.direction || null, b.contact?.trim() || null,
       b.client_id || null, b.ticket_id || null, b.text.trim()]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'create','message',$2)`,
      [userId, row.id]
    );
    return row.id;
  });
  return Response.json({ id }, { status: 201 });
}
