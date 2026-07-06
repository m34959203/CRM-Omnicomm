import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse, type SessionUser } from "@/lib/auth";
import { ACT_EDIT_ROLES, editableActFor } from "@/lib/service/common";

/**
 * Материалы акта:
 *  - { fill_norms: true } — пересобрать строки by_norm из material_norms
 *    по видам работ акта (норма × количество работы);
 *  - { nomenclature_id, quantity } — ручная строка (by_norm=false).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user: SessionUser;
  try {
    user = await requireRole(ACT_EDIT_ROLES);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const blocked = await editableActFor(id, user);
  if (blocked) return blocked;
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: "bad body" }, { status: 400 });

  if (b.fill_norms) {
    const inserted = await tx(async (q) => {
      await q(`DELETE FROM act_materials WHERE act_id = $1::uuid AND by_norm`, [id]);
      const rows = await q<{ cnt: string }>(
        `WITH ins AS (
           INSERT INTO act_materials (act_id, nomenclature_id, quantity, by_norm)
           SELECT $1::uuid, mn.nomenclature_id, sum(mn.quantity * w.quantity), true
           FROM act_works w
           JOIN material_norms mn ON mn.work_type_id = w.work_type_id
           WHERE w.act_id = $1::uuid
           GROUP BY mn.nomenclature_id
           RETURNING 1
         ) SELECT count(*) AS cnt FROM ins`,
        [id]
      );
      return Number(rows[0]?.cnt ?? 0);
    });
    return Response.json({ ok: true, inserted });
  }

  if (!b.nomenclature_id || !(Number(b.quantity) > 0)) {
    return Response.json({ error: "nomenclature_id и quantity обязательны" }, { status: 400 });
  }
  await query(
    `INSERT INTO act_materials (act_id, nomenclature_id, quantity, by_norm)
     VALUES ($1::uuid, $2::uuid, $3, false)`,
    [id, b.nomenclature_id, Number(b.quantity)]
  );
  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user: SessionUser;
  try {
    user = await requireRole(ACT_EDIT_ROLES);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const blocked = await editableActFor(id, user);
  if (blocked) return blocked;
  const b = await req.json().catch(() => null);
  if (!b?.material_id) return Response.json({ error: "material_id required" }, { status: 400 });
  await query(
    `DELETE FROM act_materials WHERE id = $1::uuid AND act_id = $2::uuid`,
    [b.material_id, id]
  );
  return Response.json({ ok: true });
}
