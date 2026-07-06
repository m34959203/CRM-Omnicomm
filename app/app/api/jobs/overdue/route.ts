import { requireRole, authErrorResponse } from "@/lib/auth";
import { markOverdueAndNotify } from "@/lib/service/sla";

/** Джоб просрочек: cron (X-Cron-Key) или вручную [admin,head]. Рекомендуемый интервал — каждые 15 минут. */
export async function POST(req: Request) {
  const cronKey = process.env.CRON_KEY;
  const provided = req.headers.get("x-cron-key");
  if (!cronKey || provided !== cronKey) {
    try {
      await requireRole(["admin", "head"]);
    } catch (e) {
      return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
    }
  }
  const result = await markOverdueAndNotify();
  return Response.json(result);
}
