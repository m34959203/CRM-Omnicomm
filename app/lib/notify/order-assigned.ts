/**
 * Уведомление технику о назначении на заказ-наряд (этап 4):
 * web-push по push_subscriptions + telegram через notification_queue (если задан
 * users.telegram_chat_id). Ошибки глотаются — уведомления НЕ должны ронять назначение.
 */
import { query } from "@/lib/db";
import { sendPushToUser } from "@/lib/notify/push";
import { enqueueNotification } from "@/lib/notify/worker";

export async function notifyOrderAssigned(userId: string, workOrderId: string): Promise<void> {
  try {
    const [wo] = await query<{
      number: string;
      address: string | null;
      scheduled_start: string | null;
      client_name: string | null;
    }>(
      `SELECT w.number, w.address, w.scheduled_start, c.name AS client_name
       FROM work_orders w LEFT JOIN clients c ON c.id = w.client_id
       WHERE w.id = $1::uuid`,
      [workOrderId]
    );
    if (!wo) return;

    const when = wo.scheduled_start
      ? new Date(wo.scheduled_start).toLocaleString("ru-RU", {
          timeZone: "Asia/Almaty",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
    const body = [wo.number, wo.client_name, wo.address, when].filter(Boolean).join(" · ");
    const url = `/m/orders/${workOrderId}`;

    await sendPushToUser(userId, { title: "Новый наряд", body, url }).catch(() => undefined);

    const [u] = await query<{ telegram_chat_id: string | null }>(
      `SELECT telegram_chat_id FROM users WHERE id = $1::uuid`,
      [userId]
    );
    if (u?.telegram_chat_id) {
      await enqueueNotification({
        channel: "telegram",
        recipient: u.telegram_chat_id,
        subject: "Новый наряд",
        body: `Вам назначен заказ-наряд: ${body}\n${process.env.APP_URL ?? ""}${url}`,
        entityType: "work_order",
        entityId: workOrderId,
      });
    }
  } catch {
    // уведомление не должно ронять основную операцию
  }
}
