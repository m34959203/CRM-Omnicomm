/**
 * Массовый прогон биллинга: по всем подходящим активным клиентам вызывает
 * generateClientDocument. Используется UI (/api/billing/run) и cron (/api/jobs/billing).
 */
import { query } from "@/lib/db";
import { generateClientDocument, type BillingRunResult } from "./engine";

export type RunFilters = {
  period: string; // YYYY-MM
  kind: "advance_invoice" | "act";
  clientId?: string | null;
  categoryId?: string | null;
  scheme?: "advance" | "credit" | null;
};

export type RunSummary = {
  period: string;
  kind: string;
  created: number;
  skipped: number;
  errors: number;
  results: (BillingRunResult & { client_name: string; error?: string })[];
};

export async function runBilling(f: RunFilters, userId?: string): Promise<RunSummary> {
  const clients = await query<{ id: string; name: string }>(
    `SELECT id, name FROM clients
     WHERE is_active
       AND ($1::uuid IS NULL OR id = $1::uuid)
       AND ($2::uuid IS NULL OR category_id = $2::uuid)
       AND ($3::text IS NULL OR billing_scheme = $3)
     ORDER BY name`,
    [f.clientId ?? null, f.categoryId ?? null, f.scheme ?? null]
  );

  const results: RunSummary["results"] = [];
  for (const c of clients) {
    try {
      const r = await generateClientDocument(c.id, f.period, f.kind, userId);
      results.push({ ...r, client_name: c.name });
    } catch (e) {
      results.push({
        clientId: c.id,
        client_name: c.name,
        documentId: null,
        kind: f.kind,
        subtotal: 0,
        discount: 0,
        prepaid: 0,
        vat: 0,
        total: 0,
        accruals: 0,
        skipped: "ошибка",
        error: (e as Error).message,
      });
    }
  }
  return {
    period: f.period,
    kind: f.kind,
    created: results.filter((r) => r.documentId && !r.skipped).length,
    skipped: results.filter((r) => r.skipped && !r.error).length,
    errors: results.filter((r) => r.error).length,
    results,
  };
}
