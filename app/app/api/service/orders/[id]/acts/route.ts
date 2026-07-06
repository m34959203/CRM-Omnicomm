import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse, type SessionUser } from "@/lib/auth";
import { SERVICE_WRITE_ROLES } from "@/lib/service/common";

/**
 * Создать акт ТО по наряду (in_preparation). body: { performed_by? }
 * Техник (installer) создаёт акт из PWA по СВОЕМУ наряду (performed_by = он сам);
 * если его открытый акт уже есть — возвращается существующий (идемпотентно).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user: SessionUser;
  try {
    user = await requireRole([...SERVICE_WRITE_ROLES, "installer"]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = (await req.json().catch(() => null)) ?? {};

  const [wo] = await query<{ id: string; status: string }>(
    `SELECT id, status FROM work_orders WHERE id = $1::uuid`,
    [id]
  );
  if (!wo) return Response.json({ error: "not found" }, { status: 404 });
  if (["done", "cancelled"].includes(wo.status)) {
    return Response.json({ error: "Наряд уже завершён" }, { status: 422 });
  }

  if (user.role === "installer") {
    const [perf] = await query(
      `SELECT 1 AS ok FROM work_order_performers WHERE work_order_id = $1::uuid AND user_id = $2::uuid`,
      [id, user.userId]
    );
    if (!perf) return Response.json({ error: "Forbidden" }, { status: 403 });
    // открытый акт техника по наряду уже есть — открываем его
    const [existing] = await query<{ id: string }>(
      `SELECT id FROM maintenance_acts
       WHERE work_order_id = $1::uuid AND status = 'in_preparation' AND performed_by = $2::uuid
       ORDER BY created_at DESC LIMIT 1`,
      [id, user.userId]
    );
    if (existing) return Response.json({ id: existing.id, existing: true });
  }

  const actId = await tx(async (q) => {
    // исполнитель акта: техник — сам себя; офис — явно указан или старший исполнитель наряда
    const [lead] = await q<{ user_id: string }>(
      `SELECT user_id FROM work_order_performers
       WHERE work_order_id = $1::uuid ORDER BY is_lead DESC LIMIT 1`,
      [id]
    );
    const performedBy =
      user.role === "installer" ? user.userId : b.performed_by || lead?.user_id || null;
    const [act] = await q<{ id: string }>(
      `INSERT INTO maintenance_acts (work_order_id, status, performed_by)
       VALUES ($1::uuid, 'in_preparation', $2::uuid) RETURNING id`,
      [id, performedBy]
    );
    await q(
      `UPDATE work_orders SET status = 'in_progress', updated_at = now()
       WHERE id = $1::uuid AND status = 'planned'`,
      [id]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'create','maintenance_act',$2)`,
      [user.userId, act.id]
    );
    return act.id;
  });
  return Response.json({ id: actId }, { status: 201 });
}
