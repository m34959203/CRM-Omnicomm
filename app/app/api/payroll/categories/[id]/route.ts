import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { PAYROLL_WRITE_ROLES } from "@/lib/payroll/common";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(PAYROLL_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: "bad body" }, { status: 400 });

  await tx(async (q) => {
    await q(
      `UPDATE performer_categories SET
         name = COALESCE($2, name),
         note = COALESCE($3, note),
         is_active = COALESCE($4, is_active)
       WHERE id = $1::uuid`,
      [id, b.name?.trim() || null, b.note?.trim() ?? null, b.is_active ?? null]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'update', 'performer_category', $2)`,
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
    userId = (await requireRole(PAYROLL_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  try {
    await tx(async (q) => {
      await q(`DELETE FROM performer_categories WHERE id = $1::uuid`, [id]);
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
         VALUES ($1, 'delete', 'performer_category', $2)`,
        [userId, id]
      );
    });
    return Response.json({ ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === "23503") {
      return Response.json(
        { error: "Категория используется (назначения/расценки/правила) — деактивируйте её" },
        { status: 422 }
      );
    }
    throw e;
  }
}
