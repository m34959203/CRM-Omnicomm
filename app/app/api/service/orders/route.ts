import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SERVICE_WRITE_ROLES } from "@/lib/service/common";

/**
 * Создание заказ-наряда: напрямую или из заявки (request_id — клиент/объект
 * подтягиваются из неё, если не заданы). Несколько исполнителей + командировки.
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(SERVICE_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: "bad body" }, { status: 400 });

  try {
    const id = await tx(async (q) => {
      let clientId = b.client_id || null;
      let objectId = b.object_id || null;
      if (b.request_id) {
        const [r] = await q<{ client_id: string; object_id: string | null }>(
          `SELECT client_id, object_id FROM requests WHERE id = $1::uuid`,
          [b.request_id]
        );
        if (!r) throw new Error("request not found");
        clientId = clientId ?? r.client_id;
        objectId = objectId ?? r.object_id;
      }
      if (!clientId) throw new Error("client_id required");

      const [wo] = await q<{ id: string }>(
        `INSERT INTO work_orders
           (number, client_id, object_id, request_id, address,
            scheduled_start, scheduled_end, status, note, created_by)
         VALUES ('ЗН-' || lpad(nextval('seq_work_order_number')::text, 6, '0'),
                 $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, 'planned', $7, $8::uuid)
         RETURNING id`,
        [clientId, objectId, b.request_id || null, b.address?.trim() || null,
         b.scheduled_start || null, b.scheduled_end || null, b.note?.trim() || null, userId]
      );

      for (const [i, p] of ((b.performers as string[] | undefined) ?? []).entries()) {
        await q(
          `INSERT INTO work_order_performers (work_order_id, user_id, is_lead)
           VALUES ($1::uuid, $2::uuid, $3) ON CONFLICT DO NOTHING`,
          [wo.id, p, i === 0]
        );
      }
      for (const trip of (b.trips as Record<string, unknown>[] | undefined) ?? []) {
        if (!trip.date_from || !trip.date_to) continue;
        await q(
          `INSERT INTO work_order_trips (work_order_id, date_from, date_to, transport, cost, include_in_cost, note)
           VALUES ($1::uuid, $2, $3, $4, COALESCE($5::numeric, 0), COALESCE($6, true), $7)`,
          [wo.id, trip.date_from, trip.date_to, trip.transport || null,
           trip.cost || null, trip.include_in_cost, trip.note || null]
        );
      }
      if (b.request_id) {
        await q(
          `UPDATE requests SET status = 'visit_planned', updated_at = now()
           WHERE id = $1::uuid AND status IN ('new','assigned','in_progress')`,
          [b.request_id]
        );
        await q(
          `INSERT INTO request_history (request_id, action, detail, user_id)
           VALUES ($1::uuid, 'work_order', 'Создан заказ-наряд', $2::uuid)`,
          [b.request_id, userId]
        );
      }
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'create','work_order',$2)`,
        [userId, wo.id]
      );
      return wo.id;
    });
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    return Response.json({ error: msg }, { status: msg.includes("required") || msg.includes("not found") ? 400 : 500 });
  }
}
