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
    `SELECT p.id, p.name, p.name_kk, p.is_active,
            COALESCE(json_agg(json_build_object(
              'id', i.id, 'method', i.method, 'name', i.name, 'amount', i.amount
            ) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]') AS items,
            (SELECT count(*) FROM clients c WHERE c.tariff_plan_id = p.id)::int AS clients_count,
            (SELECT count(*) FROM monitoring_objects o WHERE o.tariff_plan_id = p.id)::int AS objects_count
     FROM tariff_plans p
     LEFT JOIN tariff_plan_items i ON i.plan_id = p.id
     GROUP BY p.id
     ORDER BY p.name`
  );
  return Response.json(rows);
}

type ItemInput = { method: string; name?: string; amount: number };

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole([...WRITE_ROLES])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.name?.trim()) return Response.json({ error: "name required" }, { status: 400 });
  const items: ItemInput[] = Array.isArray(b.items) ? b.items : [];
  for (const i of items) {
    if (!["activity", "subscription", "one_time"].includes(i.method) || !(Number(i.amount) >= 0)) {
      return Response.json({ error: "items: method/amount invalid" }, { status: 400 });
    }
  }

  const id = await tx(async (q) => {
    const [plan] = await q<{ id: string }>(
      `INSERT INTO tariff_plans (name, name_kk) VALUES ($1, $2) RETURNING id`,
      [b.name.trim(), b.name_kk?.trim() || null]
    );
    for (const i of items) {
      await q(
        `INSERT INTO tariff_plan_items (plan_id, method, name, amount) VALUES ($1, $2, $3, $4)`,
        [plan.id, i.method, i.name?.trim() || null, Number(i.amount)]
      );
    }
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'create', 'tariff_plan', $2, $3)`,
      [userId, plan.id, JSON.stringify({ name: b.name, items: items.length })]
    );
    return plan.id;
  });
  return Response.json({ id }, { status: 201 });
}
