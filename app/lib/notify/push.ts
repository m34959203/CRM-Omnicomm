/** Web-push для PWA техника: рассылка по push_subscriptions пользователя (VAPID из env). */
import webpush from "web-push";
import { query } from "@/lib/db";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);
  configured = true;
  return true;
}

export async function sendPushToUser(
  userId: string,
  payload: { title: string; body?: string; url?: string }
): Promise<{ sent: number; stale: number }> {
  if (!ensureConfigured()) return { sent: 0, stale: 0 };
  const subs = await query<{ id: string; endpoint: string; keys: { p256dh: string; auth: string } }>(
    `SELECT id, endpoint, keys FROM push_subscriptions WHERE user_id = $1`,
    [userId]
  );
  let sent = 0, stale = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys },
        JSON.stringify(payload)
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await query(`DELETE FROM push_subscriptions WHERE id = $1`, [s.id]);
        stale++;
      }
    }
  }
  return { sent, stale };
}
