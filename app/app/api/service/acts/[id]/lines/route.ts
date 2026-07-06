import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse, type SessionUser } from "@/lib/auth";
import { ACT_EDIT_ROLES, editableActFor } from "@/lib/service/common";

const ACTIONS = ["install", "replace", "dismantle", "diagnostics", "service"];
const BASES = ["sales_order", "shipped_earlier", "write_off", "warranty", "testing", "safekeeping"];

/** Строка оборудования акта. Матрица действие × основание — валидация полей серии. */
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
  if (!b?.action || !ACTIONS.includes(b.action)) {
    return Response.json({ error: "bad action" }, { status: 400 });
  }
  if (b.basis && !BASES.includes(b.basis)) {
    return Response.json({ error: "bad basis" }, { status: 400 });
  }
  if (["install", "replace"].includes(b.action) && !b.installed_equipment_id) {
    return Response.json({ error: "Не указана устанавливаемая единица" }, { status: 400 });
  }
  if (["dismantle", "replace"].includes(b.action) && !b.removed_equipment_id) {
    return Response.json({ error: "Не указана снимаемая единица" }, { status: 400 });
  }

  await query(
    `INSERT INTO maintenance_act_lines
       (act_id, action, basis, object_id, installed_equipment_id, removed_equipment_id, work_type_id, note)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5::uuid, $6::uuid, $7::uuid, $8)`,
    [id, b.action, b.basis || null, b.object_id || null,
     b.installed_equipment_id || null, b.removed_equipment_id || null,
     b.work_type_id || null, b.note?.trim() || null]
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
  if (!b?.line_id) return Response.json({ error: "line_id required" }, { status: 400 });
  await tx(async (q) => {
    await q(
      `DELETE FROM maintenance_act_lines WHERE id = $1::uuid AND act_id = $2::uuid`,
      [b.line_id, id]
    );
  });
  return Response.json({ ok: true });
}
