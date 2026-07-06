import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SUPPORT_WRITE_ROLES, CALL_DIRECTIONS } from "@/lib/support/common";

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
  if (b.direction && !CALL_DIRECTIONS.includes(b.direction)) {
    return Response.json({ error: "bad direction" }, { status: 400 });
  }

  await tx(async (q) => {
    await q(
      `UPDATE calls SET
         direction = COALESCE($2, direction),
         phone = COALESCE($3, phone),
         duration_sec = COALESCE($4::int, duration_sec),
         result = COALESCE($5, result)
       WHERE id = $1::uuid`,
      [id, b.direction ?? null, b.phone?.trim() || null, b.duration_sec ?? null,
       b.result?.trim() ?? null]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'update','call',$2)`,
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
    await q(`DELETE FROM calls WHERE id = $1::uuid`, [id]);
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'delete','call',$2)`,
      [userId, id]
    );
  });
  return Response.json({ ok: true });
}
