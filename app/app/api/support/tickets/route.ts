import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SUPPORT_WRITE_ROLES, TICKET_CHANNELS } from "@/lib/support/common";

/** Создание тикета техподдержки. Номер 'ТП-000001' из seq_ticket_number. Клиент опционален. */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(SUPPORT_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: "bad body" }, { status: 400 });
  if (b.channel && !TICKET_CHANNELS.includes(b.channel)) {
    return Response.json({ error: "bad channel" }, { status: 400 });
  }
  if (!b.subject?.trim() && !b.description?.trim()) {
    return Response.json({ error: "Укажите тему или описание" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    const [row] = await q<{ id: string; number: string }>(
      `INSERT INTO tickets (number, client_id, contact, channel, subject, description, assigned_to)
       VALUES ('ТП-' || lpad(nextval('seq_ticket_number')::text, 6, '0'),
               $1::uuid, $2, COALESCE($3, 'manual'), $4, $5, $6::uuid)
       RETURNING id, number`,
      [
        b.client_id || null, b.contact?.trim() || null, b.channel || null,
        b.subject?.trim() || null, b.description?.trim() || null, b.assigned_to || null,
      ]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'create','ticket',$2)`,
      [userId, row.id]
    );
    return row.id;
  });
  return Response.json({ id }, { status: 201 });
}
