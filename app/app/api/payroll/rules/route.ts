import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { PAYROLL_WRITE_ROLES, PAYROLL_SCOPES } from "@/lib/payroll/common";

/** Создание правила «оклад за норму N + сделка сверх нормы». */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(PAYROLL_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.name?.trim()) return Response.json({ error: "name required" }, { status: 400 });
  const scope = b.scope ?? "default";
  if (!PAYROLL_SCOPES.includes(scope)) {
    return Response.json({ error: "scope invalid" }, { status: 400 });
  }
  if (scope === "category" && !b.category_id) {
    return Response.json({ error: "category_id обязателен для scope=category" }, { status: 400 });
  }
  if (scope === "performer" && !b.user_id) {
    return Response.json({ error: "user_id обязателен для scope=performer" }, { status: 400 });
  }
  const salary = Number(b.salary ?? 0);
  const normCount = Number(b.norm_count ?? 0);
  if (!Number.isFinite(salary) || salary < 0 || !Number.isInteger(normCount) || normCount < 0) {
    return Response.json({ error: "salary/norm_count invalid" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    const [row] = await q<{ id: string }>(
      `INSERT INTO payroll_rules (name, scope, category_id, user_id, salary, norm_count, piece_over_norm)
       VALUES ($1, $2, $3::uuid, $4::uuid, $5::numeric, $6::int, COALESCE($7, false))
       RETURNING id`,
      [
        b.name.trim(), scope,
        scope === "category" ? b.category_id : null,
        scope === "performer" ? b.user_id : null,
        salary, normCount, b.piece_over_norm ?? null,
      ]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'create', 'payroll_rule', $2)`,
      [userId, row.id]
    );
    return row.id;
  });
  return Response.json({ id }, { status: 201 });
}
