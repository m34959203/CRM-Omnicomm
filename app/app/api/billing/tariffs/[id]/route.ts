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
      `UPDATE tariffs SET
         amount        = COALESCE($2, amount),
         do_not_charge = COALESCE($3, do_not_charge),
         valid_from    = COALESCE($4::date, valid_from),
         valid_to      = CASE WHEN $6 THEN $5::date ELSE valid_to END,
         is_active     = COALESCE($7, is_active),
         updated_at    = now()
       WHERE id = $1::uuid RETURNING id`,
      [
        id,
        b.amount ?? null,
        typeof b.do_not_charge === "boolean" ? b.do_not_charge : null,
        b.valid_from || null,
        b.valid_to || null,
        "valid_to" in b,
        typeof b.is_active === "boolean" ? b.is_active : null,
      ]
    );
    if (!row) return null;
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'update', 'tariff', $2, $3)`,
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
  const result = await tx(async (q) => {
    // Тариф с начислениями не удаляем — деактивируем (история биллинга неприкосновенна).
    const [used] = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM accruals WHERE tariff_id = $1::uuid`,
      [id]
    );
    if (Number(used.n) > 0) {
      const [row] = await q<{ id: string }>(
        `UPDATE tariffs SET is_active = false, updated_at = now() WHERE id = $1::uuid RETURNING id`,
        [id]
      );
      if (!row) return null;
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
         VALUES ($1, 'deactivate', 'tariff', $2, '{"reason":"has accruals"}')`,
        [userId, id]
      );
      return "deactivated";
    }
    const [row] = await q<{ id: string }>(
      `DELETE FROM tariffs WHERE id = $1::uuid RETURNING id`,
      [id]
    );
    if (!row) return null;
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, 'delete', 'tariff', $2)`,
      [userId, id]
    );
    return "deleted";
  });
  if (!result) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true, result });
}
