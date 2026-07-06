import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SUPPORT_WRITE_ROLES, CALL_DIRECTIONS } from "@/lib/support/common";

/** Ручная фиксация звонка в журнале. */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(SUPPORT_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.phone?.trim()) return Response.json({ error: "phone required" }, { status: 400 });
  if (!CALL_DIRECTIONS.includes(b.direction)) {
    return Response.json({ error: "direction: incoming | outgoing | missed" }, { status: 400 });
  }
  const duration = Number(b.duration_sec ?? 0);
  if (!Number.isInteger(duration) || duration < 0) {
    return Response.json({ error: "duration_sec invalid" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    const [row] = await q<{ id: string }>(
      `INSERT INTO calls (direction, phone, client_id, request_id, ticket_id, user_id, duration_sec, result)
       VALUES ($1, $2, $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::int, $8)
       RETURNING id`,
      [
        b.direction, b.phone.trim(), b.client_id || null, b.request_id || null,
        b.ticket_id || null, userId, duration, b.result?.trim() || null,
      ]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'create','call',$2)`,
      [userId, row.id]
    );
    return row.id;
  });
  return Response.json({ id }, { status: 201 });
}
