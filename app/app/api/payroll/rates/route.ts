import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { PAYROLL_WRITE_ROLES, PAYROLL_SCOPES } from "@/lib/payroll/common";

/** Создание расценки: scope default / category / performer + вид работ + ставка. */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(PAYROLL_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: "bad body" }, { status: 400 });
  const scope = b.scope ?? "default";
  if (!PAYROLL_SCOPES.includes(scope)) {
    return Response.json({ error: "scope invalid" }, { status: 400 });
  }
  if (!b.work_type_id) return Response.json({ error: "work_type_id required" }, { status: 400 });
  const rate = Number(b.rate);
  if (!Number.isFinite(rate) || rate < 0) {
    return Response.json({ error: "rate invalid" }, { status: 400 });
  }
  if (scope === "category" && !b.category_id) {
    return Response.json({ error: "category_id обязателен для scope=category" }, { status: 400 });
  }
  if (scope === "performer" && !b.user_id) {
    return Response.json({ error: "user_id обязателен для scope=performer" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    const [row] = await q<{ id: string }>(
      `INSERT INTO work_rates (scope, category_id, user_id, work_type_id, rate, valid_from)
       VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::numeric, COALESCE($6::date, CURRENT_DATE))
       RETURNING id`,
      [
        scope,
        scope === "category" ? b.category_id : null,
        scope === "performer" ? b.user_id : null,
        b.work_type_id,
        rate,
        b.valid_from || null,
      ]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
       VALUES ($1, 'create', 'work_rate', $2)`,
      [userId, row.id]
    );
    return row.id;
  });
  return Response.json({ id }, { status: 201 });
}
