import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

const READ_ROLES = ["admin", "manager", "accounting", "head", "boss"] as const;
const WRITE_ROLES = ["admin", "accounting", "head"] as const;

export async function GET() {
  try {
    await requireRole([...READ_ROLES]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const rows = await query(
    `SELECT d.id, d.name, d.total_amount, d.used_amount, d.valid_from::text, d.is_active,
            c.name AS client_name, d.client_id
     FROM discounts d
     JOIN clients c ON c.id = d.client_id
     ORDER BY d.created_at DESC
     LIMIT 500`
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
  if (!b?.client_id || !(Number(b.total_amount) > 0)) {
    return Response.json({ error: "client_id и total_amount > 0 обязательны" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    const [row] = await q<{ id: string }>(
      `INSERT INTO discounts (client_id, name, total_amount, valid_from)
       VALUES ($1::uuid, $2, $3, COALESCE($4::date, CURRENT_DATE)) RETURNING id`,
      [b.client_id, b.name?.trim() || null, Number(b.total_amount), b.valid_from || null]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'create', 'discount', $2, $3)`,
      [userId, row.id, JSON.stringify({ client_id: b.client_id, total_amount: b.total_amount })]
    );
    return row.id;
  });
  return Response.json({ id }, { status: 201 });
}
