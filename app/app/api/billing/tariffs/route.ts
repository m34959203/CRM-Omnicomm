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
    `SELECT t.id, t.level, t.method, t.amount, t.do_not_charge, t.valid_from::text,
            t.valid_to::text, t.is_active,
            c.name AS client_name, o.name AS object_name, sc.name AS category_name
     FROM tariffs t
     LEFT JOIN clients c ON c.id = t.client_id
     LEFT JOIN monitoring_objects o ON o.id = t.object_id
     LEFT JOIN service_categories sc ON sc.id = t.category_id
     ORDER BY t.level, t.valid_from DESC, t.created_at DESC
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
  const level = b?.level;
  if (!["default", "category", "client", "object"].includes(level)) {
    return Response.json({ error: "level invalid" }, { status: 400 });
  }
  if (level === "category" && !b.category_id)
    return Response.json({ error: "category_id обязателен для level=category" }, { status: 400 });
  if (level === "client" && !b.client_id)
    return Response.json({ error: "client_id обязателен для level=client" }, { status: 400 });
  if (level === "object" && !b.object_id)
    return Response.json({ error: "object_id обязателен для level=object" }, { status: 400 });
  const method = b.method ?? "activity";
  if (!["activity", "subscription", "one_time"].includes(method)) {
    return Response.json({ error: "method invalid" }, { status: 400 });
  }
  const doNotCharge = b.do_not_charge === true || b.do_not_charge === "on";
  if (!doNotCharge && (b.amount === undefined || Number(b.amount) < 0)) {
    return Response.json({ error: "amount required" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    const [row] = await q<{ id: string }>(
      `INSERT INTO tariffs (level, category_id, client_id, object_id, method, amount,
                            do_not_charge, valid_from, valid_to)
       VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, COALESCE($6, 0), $7,
               COALESCE($8::date, CURRENT_DATE), $9::date)
       RETURNING id`,
      [
        level,
        level === "category" ? b.category_id : null,
        level === "client" ? b.client_id : null,
        level === "object" ? b.object_id : null,
        method,
        doNotCharge ? 0 : Number(b.amount),
        doNotCharge,
        b.valid_from || null,
        b.valid_to || null,
      ]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'create', 'tariff', $2, $3)`,
      [userId, row.id, JSON.stringify({ level, method, amount: b.amount })]
    );
    return row.id;
  });
  return Response.json({ id }, { status: 201 });
}
