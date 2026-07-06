import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

const WRITE_ROLES = ["admin", "manager", "head"] as const;

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
      `UPDATE blocking_rules SET
         name               = COALESCE($2, name),
         advance_grace_days = COALESCE($3, advance_grace_days),
         credit_grace_days  = COALESCE($4, credit_grace_days),
         allowed_debt       = COALESCE($5, allowed_debt),
         warn_days_before   = COALESCE($6, warn_days_before),
         is_active          = COALESCE($7, is_active),
         updated_at         = now()
       WHERE id = $1::uuid RETURNING id`,
      [id, b.name?.trim() || null, b.advance_grace_days ?? null, b.credit_grace_days ?? null,
       b.allowed_debt ?? null, b.warn_days_before ?? null,
       typeof b.is_active === "boolean" ? b.is_active : null]
    );
    if (!row) return null;
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'update', 'blocking_rule', $2, $3)`,
      [userId, id, JSON.stringify(b)]
    );
    return row.id;
  });
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
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
  const deleted = await tx(async (q) => {
    const [row] = await q<{ id: string }>(
      `DELETE FROM blocking_rules WHERE id = $1::uuid RETURNING id`,
      [id]
    );
    if (!row) return null;
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, 'delete', 'blocking_rule', $2)`,
      [userId, id]
    );
    return row.id;
  });
  if (!deleted) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true });
}
