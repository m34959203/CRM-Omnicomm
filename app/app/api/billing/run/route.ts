import { requireRole, authErrorResponse } from "@/lib/auth";
import { query } from "@/lib/db";
import { runBilling } from "@/lib/billing/run";

const RUN_ROLES = ["admin", "accounting", "head"] as const;

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole([...RUN_ROLES])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!/^\d{4}-\d{2}$/.test(b?.period ?? "")) {
    return Response.json({ error: "period (YYYY-MM) обязателен" }, { status: 400 });
  }
  if (!["advance_invoice", "act"].includes(b?.kind)) {
    return Response.json({ error: "kind: advance_invoice | act" }, { status: 400 });
  }
  if (b.scheme && !["advance", "credit"].includes(b.scheme)) {
    return Response.json({ error: "scheme invalid" }, { status: 400 });
  }

  const summary = await runBilling(
    {
      period: b.period,
      kind: b.kind,
      clientId: b.client_id || null,
      categoryId: b.category_id || null,
      scheme: b.scheme || null,
    },
    userId
  );
  await query(
    `INSERT INTO audit_log (user_id, action, entity_type, detail)
     VALUES ($1, 'billing_run', 'billing_document', $2)`,
    [userId, JSON.stringify({ period: b.period, kind: b.kind, created: summary.created, skipped: summary.skipped, errors: summary.errors })]
  );
  return Response.json(summary);
}
