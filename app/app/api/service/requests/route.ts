import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import {
  SERVICE_WRITE_ROLES,
  REQUEST_TYPES,
  PHOTO_REQUIRED_TYPES,
} from "@/lib/service/common";

/** Создание заявки ТО. Номер 'Z-000001' из seq_request_number. */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(SERVICE_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.client_id) return Response.json({ error: "client_id required" }, { status: 400 });
  if (!b.type || !REQUEST_TYPES.includes(b.type)) {
    return Response.json({ error: "bad type" }, { status: 400 });
  }
  if (b.priority && !["low", "normal", "high", "critical"].includes(b.priority)) {
    return Response.json({ error: "bad priority" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    const [row] = await q<{ id: string; number: string }>(
      `INSERT INTO requests
         (number, client_id, object_id, type, priority, source, subject, description,
          photo_required, due_at, manager_id, support_id, installer_id)
       VALUES ('Z-' || lpad(nextval('seq_request_number')::text, 6, '0'),
               $1::uuid, $2::uuid, $3, COALESCE($4, 'normal'), COALESCE($5, 'manual'),
               $6, $7, $8, $9, $10::uuid, $11::uuid, $12::uuid)
       RETURNING id, number`,
      [
        b.client_id, b.object_id || null, b.type, b.priority || null, b.source || null,
        b.subject?.trim() || null, b.description?.trim() || null,
        PHOTO_REQUIRED_TYPES.includes(b.type), b.due_at || null,
        b.manager_id || null, b.support_id || null, b.installer_id || null,
      ]
    );
    await q(
      `INSERT INTO request_history (request_id, action, detail, user_id)
       VALUES ($1::uuid, 'create', 'Заявка создана', $2::uuid)`,
      [row.id, userId]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'create','request',$2)`,
      [userId, row.id]
    );
    return row.id;
  });
  return Response.json({ id }, { status: 201 });
}
