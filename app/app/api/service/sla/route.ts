import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

export async function GET() {
  try {
    await requireRole(["admin", "manager", "support", "head", "boss"]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  return Response.json(
    await query(`SELECT * FROM request_sla ORDER BY request_type`)
  );
}

export async function PATCH(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(["admin", "head"])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.id) return Response.json({ error: "id required" }, { status: 400 });
  const [row] = await query<{ id: string }>(
    `UPDATE request_sla SET
       reaction_minutes = COALESCE($2::int, reaction_minutes),
       execution_hours  = COALESCE($3::int, execution_hours),
       is_active        = COALESCE($4::boolean, is_active)
     WHERE id = $1::uuid RETURNING id`,
    [b.id, b.reaction_minutes ?? null, b.execution_hours ?? null, b.is_active ?? null]
  );
  if (!row) return Response.json({ error: "not found" }, { status: 404 });
  await query(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'update','request_sla',$2)`,
    [userId, b.id]
  );
  return Response.json({ ok: true });
}
