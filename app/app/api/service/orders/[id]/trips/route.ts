import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SERVICE_WRITE_ROLES } from "@/lib/service/common";

/** Добавить командировку. body: { date_from, date_to, transport?, cost?, include_in_cost?, note? } */
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
  if (!b?.date_from || !b.date_to) {
    return Response.json({ error: "date_from/date_to required" }, { status: 400 });
  }
  const [wo] = await query(`SELECT id FROM work_orders WHERE id = $1::uuid`, [id]);
  if (!wo) return Response.json({ error: "not found" }, { status: 404 });

  await tx(async (q) => {
    await q(
      `INSERT INTO work_order_trips (work_order_id, date_from, date_to, transport, cost, include_in_cost, note)
       VALUES ($1::uuid, $2, $3, $4, COALESCE($5::numeric, 0), COALESCE($6, true), $7)`,
      [id, b.date_from, b.date_to, b.transport?.trim() || null,
       b.cost || null, b.include_in_cost, b.note?.trim() || null]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'add_trip','work_order',$2)`,
      [userId, id]
    );
  });
  return Response.json({ ok: true }, { status: 201 });
}

/** Удалить командировку. body: { trip_id } */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(SERVICE_WRITE_ROLES);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b?.trip_id) return Response.json({ error: "trip_id required" }, { status: 400 });
  await query(
    `DELETE FROM work_order_trips WHERE id = $1::uuid AND work_order_id = $2::uuid`,
    [b.trip_id, id]
  );
  return Response.json({ ok: true });
}
