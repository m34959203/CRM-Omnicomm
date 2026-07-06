import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

const WRITE_ROLES = ["admin", "accounting", "head"] as const;

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole([...WRITE_ROLES])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: "body required" }, { status: 400 });

  const updated = await tx(async (q) => {
    const [row] = await q<{ id: string }>(
      `UPDATE discounts SET
         name = COALESCE($2, name),
         total_amount = COALESCE($3, total_amount),
         valid_from = COALESCE($4::date, valid_from),
         is_active = COALESCE($5, is_active),
         updated_at = now()
       WHERE id = $1::uuid AND COALESCE($3, total_amount) >= used_amount
       RETURNING id`,
      [id, b.name?.trim() || null, b.total_amount ?? null, b.valid_from || null,
       typeof b.is_active === "boolean" ? b.is_active : null]
    );
    if (!row) return null;
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'update', 'discount', $2, $3)`,
      [userId, id, JSON.stringify(b)]
    );
    return row.id;
  });
  if (!updated) {
    return Response.json(
      { error: "не найдено или total_amount меньше уже использованного" },
      { status: 400 }
    );
  }
  return Response.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole([...WRITE_ROLES])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const result = await tx(async (q) => {
    const [used] = await q<{ used_amount: string } | undefined>(
      `SELECT used_amount::text FROM discounts WHERE id = $1::uuid`,
      [id]
    );
    if (!used) return null;
    if (Number(used.used_amount) > 0) {
      await q(
        `UPDATE discounts SET is_active = false, updated_at = now() WHERE id = $1::uuid`,
        [id]
      );
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
         VALUES ($1, 'deactivate', 'discount', $2, '{"reason":"partially used"}')`,
        [userId, id]
      );
      return "deactivated";
    }
    await q(`DELETE FROM discounts WHERE id = $1::uuid`, [id]);
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, 'delete', 'discount', $2)`,
      [userId, id]
    );
    return "deleted";
  });
  if (!result) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true, result });
}
