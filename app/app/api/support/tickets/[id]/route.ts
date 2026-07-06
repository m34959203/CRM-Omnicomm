import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SUPPORT_WRITE_ROLES } from "@/lib/support/common";

/**
 * PATCH тикета: назначение и рабочие статусы (new ↔ in_progress).
 * Исходы (решено удалённо / на обслуживание / отклонён) — через POST .../resolve.
 */
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
  if (b.status && !["new", "in_progress"].includes(b.status)) {
    return Response.json({ error: "Через PATCH доступны только статусы new/in_progress" }, { status: 400 });
  }

  const [current] = await query<{ status: string }>(
    `SELECT status FROM tickets WHERE id = $1::uuid`,
    [id]
  );
  if (!current) return Response.json({ error: "not found" }, { status: 404 });
  if (["done", "rejected"].includes(current.status) && b.status) {
    return Response.json({ error: "Тикет уже закрыт" }, { status: 422 });
  }

  await tx(async (q) => {
    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [id];
    const push = (frag: string, v: unknown) => {
      vals.push(v);
      sets.push(`${frag}$${vals.length}`);
    };
    if (b.status) push("status = ", b.status);
    if ("assigned_to" in b) {
      vals.push(b.assigned_to || null);
      sets.push(`assigned_to = $${vals.length}::uuid`);
    }
    if ("subject" in b) push("subject = ", b.subject?.trim() || null);
    if ("description" in b) push("description = ", b.description?.trim() || null);
    if ("contact" in b) push("contact = ", b.contact?.trim() || null);

    await q(`UPDATE tickets SET ${sets.join(", ")} WHERE id = $1::uuid`, vals);
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'update', 'ticket', $2, $3)`,
      [userId, id, JSON.stringify({ status: b.status ?? undefined, assigned: "assigned_to" in b })]
    );
  });
  return Response.json({ ok: true });
}
