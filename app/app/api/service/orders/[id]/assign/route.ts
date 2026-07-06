import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SERVICE_WRITE_ROLES } from "@/lib/service/common";
import { notifyOrderAssigned } from "@/lib/notify/order-assigned";

/**
 * Назначение из графика (drag-and-drop): body { user_id, date: 'YYYY-MM-DD', replace_user_id? }.
 * Добавляет исполнителя и переносит scheduled_start на указанный день,
 * сохраняя время (по умолчанию 09:00). replace_user_id — перетаскивание между техниками.
 */
export async function POST(
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
  if (!b?.user_id || !/^\d{4}-\d{2}-\d{2}$/.test(b.date ?? "")) {
    return Response.json({ error: "user_id и date (YYYY-MM-DD) обязательны" }, { status: 400 });
  }

  const [wo] = await query<{ id: string; status: string }>(
    `SELECT id, status FROM work_orders WHERE id = $1::uuid`,
    [id]
  );
  if (!wo) return Response.json({ error: "not found" }, { status: 404 });
  if (["done", "cancelled"].includes(wo.status)) {
    return Response.json({ error: "Наряд уже завершён" }, { status: 422 });
  }

  await tx(async (q) => {
    if (b.replace_user_id && b.replace_user_id !== b.user_id) {
      await q(
        `DELETE FROM work_order_performers WHERE work_order_id = $1::uuid AND user_id = $2::uuid`,
        [id, b.replace_user_id]
      );
    }
    await q(
      `INSERT INTO work_order_performers (work_order_id, user_id, is_lead)
       VALUES ($1::uuid, $2::uuid,
               NOT EXISTS (SELECT 1 FROM work_order_performers WHERE work_order_id = $1::uuid))
       ON CONFLICT (work_order_id, user_id) DO NOTHING`,
      [id, b.user_id]
    );
    // Перенос дня с сохранением времени; длительность (end − start) сохраняется.
    await q(
      `UPDATE work_orders
       SET scheduled_end = CASE
             WHEN scheduled_start IS NOT NULL AND scheduled_end IS NOT NULL
             THEN ($2::date + (scheduled_start AT TIME ZONE 'Asia/Almaty')::time) AT TIME ZONE 'Asia/Almaty'
                  + (scheduled_end - scheduled_start)
             ELSE scheduled_end END,
           scheduled_start = CASE
             WHEN scheduled_start IS NOT NULL
             THEN ($2::date + (scheduled_start AT TIME ZONE 'Asia/Almaty')::time) AT TIME ZONE 'Asia/Almaty'
             ELSE ($2::date + time '09:00') AT TIME ZONE 'Asia/Almaty' END,
           updated_at = now()
       WHERE id = $1::uuid`,
      [id, b.date]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'schedule_assign', 'work_order', $2,
               jsonb_build_object('performer', $3::text, 'date', $4::text))`,
      [userId, id, b.user_id, b.date]
    );
  });
  // web-push + telegram технику; ошибки уведомлений назначение не роняют
  await notifyOrderAssigned(b.user_id, id);
  return Response.json({ ok: true });
}
