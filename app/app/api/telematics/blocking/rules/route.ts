import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

const READ_ROLES = ["admin", "manager", "support", "head", "boss"] as const;
const WRITE_ROLES = ["admin", "manager", "head"] as const;

export async function GET() {
  try {
    await requireRole([...READ_ROLES]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const rows = await query(
    `SELECT r.id, r.name, r.scope, r.category_id, r.client_id,
            r.advance_grace_days, r.credit_grace_days, r.allowed_debt,
            r.warn_days_before, r.is_active,
            c.name AS client_name, sc.name AS category_name
     FROM blocking_rules r
     LEFT JOIN clients c ON c.id = r.client_id
     LEFT JOIN service_categories sc ON sc.id = r.category_id
     ORDER BY r.scope, r.name`
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
  if (!b?.name?.trim()) return Response.json({ error: "name required" }, { status: 400 });
  const scope = b.scope ?? "default";
  if (!["default", "category", "client"].includes(scope)) {
    return Response.json({ error: "scope invalid" }, { status: 400 });
  }
  if (scope === "category" && !b.category_id) {
    return Response.json({ error: "category_id обязателен для scope=category" }, { status: 400 });
  }
  if (scope === "client" && !b.client_id) {
    return Response.json({ error: "client_id обязателен для scope=client" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    const [row] = await q<{ id: string }>(
      `INSERT INTO blocking_rules
         (name, scope, category_id, client_id, advance_grace_days, credit_grace_days,
          allowed_debt, warn_days_before, is_active, disable_objects_after_days)
       VALUES ($1, $2, $3::uuid, $4::uuid, COALESCE($5, 0), COALESCE($6, 0),
               COALESCE($7, 0), COALESCE($8, 3), COALESCE($9, true), $10::int)
       RETURNING id`,
      [
        b.name.trim(), scope,
        scope === "category" ? b.category_id : null,
        scope === "client" ? b.client_id : null,
        b.advance_grace_days ?? null, b.credit_grace_days ?? null,
        b.allowed_debt ?? null, b.warn_days_before ?? null, b.is_active ?? null,
        b.disable_objects_after_days || null,
      ]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, 'create', 'blocking_rule', $2)`,
      [userId, row.id]
    );
    return row.id;
  });
  return Response.json({ id }, { status: 201 });
}
