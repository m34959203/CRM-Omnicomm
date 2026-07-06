import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

const READ_ROLES = ["admin", "manager", "accounting", "head", "boss"] as const;

export async function GET(req: Request) {
  try {
    await requireRole([...READ_ROLES]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const p = new URL(req.url).searchParams;
  const period = p.get("period"); // YYYY-MM
  const kind = p.get("kind");
  const status = p.get("status");
  const q = p.get("q")?.trim() ?? "";

  const rows = await query(
    `SELECT d.id, d.number, d.kind, d.scheme, d.status,
            d.period_start::text, d.period_end::text,
            d.subtotal, d.discount_amount, d.prepaid_amount, d.vat_amount, d.total,
            d.paid_amount, d.issued_at::text, d.created_at::text,
            c.name AS client_name
     FROM billing_documents d
     JOIN clients c ON c.id = d.client_id
     WHERE ($1::text IS NULL OR to_char(d.period_start, 'YYYY-MM') = $1)
       AND ($2::text IS NULL OR d.kind = $2)
       AND ($3::text IS NULL OR d.status = $3)
       AND ($4 = '' OR c.name ILIKE '%' || $4 || '%' OR d.number ILIKE '%' || $4 || '%')
     ORDER BY d.created_at DESC
     LIMIT 500`,
    [period || null, kind || null, status || null, q]
  );
  return Response.json(rows);
}
