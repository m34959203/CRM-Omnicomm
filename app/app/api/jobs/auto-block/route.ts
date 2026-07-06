import { requireRole, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { runAutoBlocking } from "@/lib/telematics/auto-block";

/**
 * Запуск автоблокировки должников: cron (заголовок X-Cron-Key == env CRON_KEY)
 * или вручную кнопкой из /telematics/blocking (роли admin/head).
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

  const events = await runAutoBlocking();
  await query(
    `INSERT INTO audit_log (user_id, action, entity_type, detail)
     VALUES ($1::uuid, 'auto_block_run', 'blocking_event', $2)`,
    [userId, JSON.stringify({
      by: byCron ? "cron" : "manual",
      events: events.length,
      warnings: events.filter((e) => e.action === "warning").length,
      blocks: events.filter((e) => e.action === "block").length,
      unblocks: events.filter((e) => e.action === "unblock").length,
    })]
  );
  return Response.json({ ok: true, events });
}
