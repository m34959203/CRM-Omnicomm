import { query } from "@/lib/db";
import { requireRole, authErrorResponse, type SessionUser } from "@/lib/auth";
import { ACT_EDIT_ROLES, editableActFor } from "@/lib/service/common";

/** SIM-операция акта: { sim_id, op: install|remove, equipment_id? } */
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
  if (!b?.sim_id || !["install", "remove"].includes(b.op)) {
    return Response.json({ error: "sim_id и op (install|remove) обязательны" }, { status: 400 });
  }
  if (b.op === "install" && !b.equipment_id) {
    return Response.json({ error: "Для установки SIM укажите оборудование" }, { status: 400 });
  }
  await query(
    `INSERT INTO act_sim_ops (act_id, sim_id, op, equipment_id)
     VALUES ($1::uuid, $2::uuid, $3, $4::uuid)`,
    [id, b.sim_id, b.op, b.equipment_id || null]
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
  if (!b?.op_id) return Response.json({ error: "op_id required" }, { status: 400 });
  await query(`DELETE FROM act_sim_ops WHERE id = $1::uuid AND act_id = $2::uuid`, [b.op_id, id]);
  return Response.json({ ok: true });
}
