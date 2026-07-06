import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SUPPORT_WRITE_ROLES } from "@/lib/support/common";
import { REQUEST_TYPES, PHOTO_REQUIRED_TYPES } from "@/lib/service/common";

/**
 * Исходы тикета:
 *  - remote  → status=done, resolution=remote, closed_at;
 *  - rejected → status=rejected, resolution=rejected, closed_at;
 *  - service → по ОДНОЙ заявке ТО на каждый выбранный объект клиента (в одной tx),
 *    photo_required — авто по PHOTO_REQUIRED_TYPES; тикет → on_service +
 *    resolution=service_requests. Авто-закрытие тикета при выполнении всех
 *    заявок делает закрытие акта ТО (lib/service/act-close.ts).
 */
export async function POST(
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
  if (!["remote", "rejected", "service"].includes(b?.outcome)) {
    return Response.json({ error: "outcome: remote | rejected | service" }, { status: 400 });
  }
  if (b.outcome === "service") {
    if (!b.type || !REQUEST_TYPES.includes(b.type)) {
      return Response.json({ error: "bad type" }, { status: 400 });
    }
    if (!Array.isArray(b.object_ids) || b.object_ids.length === 0) {
      return Response.json({ error: "object_ids: выберите хотя бы один объект" }, { status: 400 });
    }
  }

  try {
    const result = await tx(async (q) => {
      const [ticket] = await q<{
        id: string;
        number: string;
        client_id: string | null;
        channel: string | null;
        subject: string | null;
        description: string | null;
        status: string;
      }>(
        `SELECT id, number, client_id, channel, subject, description, status
         FROM tickets WHERE id = $1::uuid FOR UPDATE`,
        [id]
      );
      if (!ticket) throw new ResolveError("not found", 404);
      if (["done", "rejected", "on_service"].includes(ticket.status)) {
        throw new ResolveError("Тикет уже обработан", 422);
      }

      if (b.outcome === "remote" || b.outcome === "rejected") {
        const status = b.outcome === "remote" ? "done" : "rejected";
        const resolution = b.outcome === "remote" ? "remote" : "rejected";
        await q(
          `UPDATE tickets SET status = $2, resolution = $3, closed_at = now() WHERE id = $1::uuid`,
          [id, status, resolution]
        );
        await q(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
           VALUES ($1, 'resolve', 'ticket', $2, $3)`,
          [userId, id, JSON.stringify({ outcome: b.outcome })]
        );
        return { status, requests: [] as { id: string; number: string }[] };
      }

      // service: заявки ТО по объектам
      if (!ticket.client_id) {
        throw new ResolveError("У тикета не указан клиент — передать на обслуживание нельзя", 422);
      }
      const objects = await q<{ id: string }>(
        `SELECT id FROM monitoring_objects
         WHERE client_id = $1::uuid AND id = ANY($2::uuid[])`,
        [ticket.client_id, b.object_ids]
      );
      if (objects.length !== b.object_ids.length) {
        throw new ResolveError("Часть объектов не принадлежит клиенту тикета", 422);
      }

      const created: { id: string; number: string }[] = [];
      for (const obj of objects) {
        const [row] = await q<{ id: string; number: string }>(
          `INSERT INTO requests
             (number, ticket_id, client_id, object_id, type, source, subject, description, photo_required)
           VALUES ('Z-' || lpad(nextval('seq_request_number')::text, 6, '0'),
                   $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8)
           RETURNING id, number`,
          [
            id, ticket.client_id, obj.id, b.type, ticket.channel || "manual",
            ticket.subject, ticket.description, PHOTO_REQUIRED_TYPES.includes(b.type),
          ]
        );
        await q(
          `INSERT INTO request_history (request_id, action, detail, user_id)
           VALUES ($1::uuid, 'create', $2, $3::uuid)`,
          [row.id, `Заявка создана из тикета ${ticket.number}`, userId]
        );
        await q(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
           VALUES ($1, 'create', 'request', $2, $3)`,
          [userId, row.id, JSON.stringify({ from_ticket: id })]
        );
        created.push(row);
      }

      await q(
        `UPDATE tickets SET status = 'on_service', resolution = 'service_requests' WHERE id = $1::uuid`,
        [id]
      );
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
         VALUES ($1, 'resolve', 'ticket', $2, $3)`,
        [userId, id, JSON.stringify({ outcome: "service", requests: created.map((r) => r.number) })]
      );
      return { status: "on_service", requests: created };
    });
    return Response.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof ResolveError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

class ResolveError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}
