import { requireRole, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { runBilling } from "@/lib/billing/run";

/**
 * Массовый прогон биллинга для cron: body { period: 'YYYY-MM', kind: 'advance_invoice'|'act' }.
 * Защита: заголовок X-Cron-Key == env CRON_KEY или роль admin/head.
 */
export async function POST(req: Request) {
  const cronKey = process.env.CRON_KEY;
  const byCron = Boolean(cronKey) && req.headers.get("x-cron-key") === cronKey;
  let userId: string | undefined;
  if (!byCron) {
    try {
      userId = (await requireRole(["admin", "head"])).userId;
    } catch (e) {
      return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
    }
  }
  const b = await req.json().catch(() => null);
  if (!/^\d{4}-\d{2}$/.test(b?.period ?? "")) {
    return Response.json({ error: "period (YYYY-MM) обязателен" }, { status: 400 });
  }
  if (!["advance_invoice", "act"].includes(b?.kind)) {
    return Response.json({ error: "kind: advance_invoice | act" }, { status: 400 });
  }

  const summary = await runBilling({ period: b.period, kind: b.kind }, userId);
  await query(
    `INSERT INTO audit_log (user_id, action, entity_type, detail)
     VALUES ($1::uuid, 'billing_run', 'billing_document', $2)`,
    [userId ?? null, JSON.stringify({
      by: byCron ? "cron" : "manual",
      period: b.period, kind: b.kind,
      created: summary.created, skipped: summary.skipped, errors: summary.errors,
    })]
  );
  return Response.json(summary);
}
