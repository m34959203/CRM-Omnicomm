import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

const READ_ROLES = ["admin", "manager", "support", "head", "accounting", "boss"] as const;
const WRITE_ROLES = ["admin", "manager", "head"] as const;

const TYPES = ["physical", "technician", "contractor", "testing", "supplier", "virtual"];

export async function GET(req: Request) {
  try {
    await requireRole([...READ_ROLES]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const rows = await query(
    `SELECT w.id, w.name, w.type, w.is_active,
            u.full_name AS holder_name, s.name AS supplier_name
     FROM warehouses w
     LEFT JOIN users u ON u.id = w.holder_id
     LEFT JOIN suppliers s ON s.id = w.supplier_id
     WHERE ($1 = '' OR w.name ILIKE '%' || $1 || '%')
     ORDER BY w.name
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
  if (b.type && !TYPES.includes(b.type)) {
    return Response.json({ error: "bad type" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    const [wh] = await q<{ id: string }>(
      `INSERT INTO warehouses (name, type, holder_id, supplier_id)
       VALUES ($1, COALESCE($2, 'physical'), $3::uuid, $4::uuid)
       RETURNING id`,
      [b.name.trim(), b.type || null, b.holder_id || null, b.supplier_id || null]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, 'create', 'warehouse', $2)`,
      [userId, wh.id]
    );
    return wh.id;
  });
  return Response.json({ id }, { status: 201 });
}
