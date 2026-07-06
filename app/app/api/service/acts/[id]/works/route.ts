import { query } from "@/lib/db";
import { requireRole, authErrorResponse, type SessionUser } from "@/lib/auth";
import { ACT_EDIT_ROLES, editableActFor } from "@/lib/service/common";

/** Работа акта: rate=0 — фиксация расценки произойдёт при закрытии (work_rates). */
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
  // техник добавляет работы только на себя
  const performerId = user.role === "installer" ? user.userId : b?.performer_id;
  if (!b?.work_type_id || !performerId) {
    return Response.json({ error: "work_type_id и performer_id обязательны" }, { status: 400 });
  }
  const qty = Number(b.quantity) > 0 ? Number(b.quantity) : 1;
  await query(
    `INSERT INTO act_works (act_id, work_type_id, performer_id, quantity, rate, amount)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 0, 0)`,
    [id, b.work_type_id, performerId, qty]
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
  if (!b?.work_id) return Response.json({ error: "work_id required" }, { status: 400 });
  await query(`DELETE FROM act_works WHERE id = $1::uuid AND act_id = $2::uuid`, [b.work_id, id]);
  return Response.json({ ok: true });
}
