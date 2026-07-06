import { requireRole, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { processNotificationQueue } from "@/lib/notify/worker";

/**
 * Обработка очереди уведомлений: cron (заголовок X-Cron-Key == env CRON_KEY)
 * или вручную кнопкой из /support/notifications (роли admin/head).
 */
export async function POST(req: Request) {
  const cronKey = process.env.CRON_KEY;
  const byCron = Boolean(cronKey) && req.headers.get("x-cron-key") === cronKey;
  let userId: string | null = null;
  if (!byCron) {
    try {
      userId = (await requireRole(["admin", "head"])).userId;
    } catch (e) {
      return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
    }
  }

  const result = await processNotificationQueue(50);
  await query(
    `INSERT INTO audit_log (user_id, action, entity_type, detail)
     VALUES ($1::uuid, 'notify_run', 'notification_queue', $2)`,
    [userId, JSON.stringify({ by: byCron ? "cron" : "manual", ...result })]
  );
  return Response.json({ ok: true, ...result });
}
