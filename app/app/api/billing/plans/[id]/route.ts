import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

const WRITE_ROLES = ["admin", "accounting", "head"] as const;

type ItemInput = { method: string; name?: string; amount: number };

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
  const items: ItemInput[] | null = Array.isArray(b.items) ? b.items : null;
  if (items) {
    for (const i of items) {
      if (!["activity", "subscription", "one_time"].includes(i.method) || !(Number(i.amount) >= 0)) {
        return Response.json({ error: "items: method/amount invalid" }, { status: 400 });
      }
    }
  }

  const updated = await tx(async (q) => {
    const [row] = await q<{ id: string }>(
      `UPDATE tariff_plans SET
         name = COALESCE($2, name), name_kk = COALESCE($3, name_kk),
         is_active = COALESCE($4, is_active), updated_at = now()
       WHERE id = $1::uuid RETURNING id`,
      [id, b.name?.trim() || null, b.name_kk?.trim() || null,
       typeof b.is_active === "boolean" ? b.is_active : null]
    );
    if (!row) return null;
    if (items) {
      // Полная замена строк; строки с начислениями сохраняем историю через FK RESTRICT-free
      // (accruals.tariff_plan_item_id → SET NULL нет, поэтому удаляем только неиспользуемые).
      const used = await q<{ id: string }>(
        `SELECT DISTINCT tariff_plan_item_id AS id FROM accruals
         WHERE tariff_plan_item_id IN (SELECT id FROM tariff_plan_items WHERE plan_id = $1::uuid)`,
        [id]
      );
      if (used.length > 0) {
        return "items_locked";
      }
      await q(`DELETE FROM tariff_plan_items WHERE plan_id = $1::uuid`, [id]);
      for (const i of items) {
        await q(
          `INSERT INTO tariff_plan_items (plan_id, method, name, amount) VALUES ($1, $2, $3, $4)`,
          [id, i.method, i.name?.trim() || null, Number(i.amount)]
        );
      }
    }
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'update', 'tariff_plan', $2, $3)`,
      [userId, id, JSON.stringify(b)]
    );
    return row.id;
  });
  if (!updated) return Response.json({ error: "not found" }, { status: 404 });
  if (updated === "items_locked") {
    return Response.json(
      { error: "по строкам плана уже есть начисления — создайте новый план" },
      { status: 409 }
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
    const [assigned] = await q<{ n: string }>(
      `SELECT ((SELECT count(*) FROM clients WHERE tariff_plan_id = $1::uuid)
             + (SELECT count(*) FROM monitoring_objects WHERE tariff_plan_id = $1::uuid))::text AS n`,
      [id]
    );
    const [used] = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM accruals
       WHERE tariff_plan_item_id IN (SELECT id FROM tariff_plan_items WHERE plan_id = $1::uuid)`,
      [id]
    );
    if (Number(assigned.n) > 0 || Number(used.n) > 0) {
      const [row] = await q<{ id: string }>(
        `UPDATE tariff_plans SET is_active = false, updated_at = now() WHERE id = $1::uuid RETURNING id`,
        [id]
      );
      if (!row) return null;
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
         VALUES ($1, 'deactivate', 'tariff_plan', $2, '{"reason":"in use"}')`,
        [userId, id]
      );
      return "deactivated";
    }
    const [row] = await q<{ id: string }>(
      `DELETE FROM tariff_plans WHERE id = $1::uuid RETURNING id`,
      [id]
    );
    if (!row) return null;
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, 'delete', 'tariff_plan', $2)`,
      [userId, id]
    );
    return "deleted";
  });
  if (!result) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok: true, result });
}
