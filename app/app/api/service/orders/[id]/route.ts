import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SERVICE_WRITE_ROLES } from "@/lib/service/common";

const ORDER_STATUSES = ["draft", "planned", "in_progress", "done", "rework", "cancelled"];

/** PATCH наряда: статус / адрес / период / примечание. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(SERVICE_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: "bad body" }, { status: 400 });
  if (b.status && !ORDER_STATUSES.includes(b.status)) {
    return Response.json({ error: "bad status" }, { status: 400 });
  }

  const [wo] = await query<{ id: string; status: string }>(
    `SELECT id, status FROM work_orders WHERE id = $1::uuid`,
    [id]
  );
  if (!wo) return Response.json({ error: "not found" }, { status: 404 });
  if (b.status === "done") {
    // «Выполнен» наряд становится только закрытием акта ТО
    return Response.json({ error: "Наряд закрывается актом ТО" }, { status: 422 });
  }

  await tx(async (q) => {
    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [id];
    const push = (frag: string, v: unknown) => {
      vals.push(v);
      sets.push(`${frag}$${vals.length}`);
    };
    if (b.status) push("status = ", b.status);
    if ("address" in b) push("address = ", b.address?.trim() || null);
    if ("scheduled_start" in b) push("scheduled_start = ", b.scheduled_start || null);
    if ("scheduled_end" in b) push("scheduled_end = ", b.scheduled_end || null);
    if ("note" in b) push("note = ", b.note?.trim() || null);
    await q(`UPDATE work_orders SET ${sets.join(", ")} WHERE id = $1::uuid`, vals);
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'update', 'work_order', $2, $3)`,
      [userId, id, JSON.stringify({ status: b.status ?? undefined })]
    );
  });
  return Response.json({ ok: true });
}
