import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

const READ_ROLES = ["admin", "manager", "support", "head", "accounting", "boss"] as const;
const WRITE_ROLES = ["admin", "manager", "head"] as const;

const KINDS = ["vehicle", "stationary", "other"];

export async function GET(req: Request) {
  try {
    await requireRole([...READ_ROLES]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const clientId = sp.get("client_id")?.trim() ?? "";
  const rows = await query(
    `SELECT o.id, o.name, o.kind, o.brand, o.model, o.reg_number, o.vin, o.status,
            c.name AS client_name
     FROM monitoring_objects o
     JOIN clients c ON c.id = o.client_id
     WHERE ($1 = '' OR o.name ILIKE '%' || $1 || '%' OR o.reg_number ILIKE '%' || $1 || '%')
       AND ($2 = '' OR o.client_id = $2::uuid)
     ORDER BY o.name
     LIMIT 500`,
    [q, clientId]
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
  if (!b.client_id) {
    return Response.json({ error: "client_id required" }, { status: 400 });
  }
  if (b.kind && !KINDS.includes(b.kind)) {
    return Response.json({ error: "bad kind" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    const [obj] = await q<{ id: string }>(
      `INSERT INTO monitoring_objects
         (client_id, name, kind, brand, model, reg_number, vin, address, contact_person, contact_phone)
       VALUES ($1::uuid, $2, COALESCE($3, 'vehicle'), $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [b.client_id, b.name.trim(), b.kind || null, b.brand || null, b.model || null,
       b.reg_number || null, b.vin || null, b.address || null,
       b.contact_person || null, b.contact_phone || null]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, 'create', 'monitoring_object', $2)`,
      [userId, obj.id]
    );
    return obj.id;
  });
  return Response.json({ id }, { status: 201 });
}
