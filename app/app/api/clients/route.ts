import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

const READ_ROLES = ["admin", "manager", "support", "head", "accounting", "boss"] as const;
const WRITE_ROLES = ["admin", "manager", "head"] as const;

export async function GET(req: Request) {
  try {
    await requireRole([...READ_ROLES]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const rows = await query(
    `SELECT c.id, c.name, c.phone, c.email, c.billing_scheme, c.is_active,
            u.full_name AS manager_name,
            cp.bin_iin, cp.legal_form
     FROM clients c
     LEFT JOIN users u ON u.id = c.manager_id
     LEFT JOIN LATERAL (
       SELECT bin_iin, legal_form FROM counterparties
       WHERE client_id = c.id ORDER BY created_at LIMIT 1
     ) cp ON true
     WHERE ($1 = '' OR c.name ILIKE '%' || $1 || '%' OR cp.bin_iin LIKE $1 || '%')
     ORDER BY c.name
     LIMIT 500`,
    [q]
  );
  return Response.json(rows);
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole([...WRITE_ROLES])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.name?.trim()) {
    return Response.json({ error: "name required" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    const [client] = await q<{ id: string }>(
      `INSERT INTO clients (name, phone, email, billing_scheme, manager_id, notes)
       VALUES ($1, $2, $3, COALESCE($4, 'credit'), $5, $6) RETURNING id`,
      [b.name.trim(), b.phone || null, b.email || null, b.billing_scheme || null, b.manager_id || null, b.notes || null]
    );
    if (b.bin_iin || b.legal_form) {
      await q(
        `INSERT INTO counterparties (client_id, name, legal_form, bin_iin, kbe, is_vat_payer, is_government, legal_address)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, false), COALESCE($7, false), $8)`,
        [client.id, b.counterparty_name || b.name.trim(), b.legal_form || null, b.bin_iin || null,
         b.kbe || null, b.is_vat_payer, b.is_government, b.legal_address || null]
      );
    }
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, 'create', 'client', $2)`,
      [userId, client.id]
    );
    return client.id;
  });
  return Response.json({ id }, { status: 201 });
}
