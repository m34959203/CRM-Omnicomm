import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { PAYROLL_WRITE_ROLES } from "@/lib/payroll/common";

/**
 * Ручное добавление компенсации/удержания (kind=work создаётся только
 * закрытием акта ТО — см. lib/service/act-close.ts).
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(PAYROLL_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.user_id) return Response.json({ error: "user_id required" }, { status: 400 });
  if (!["compensation", "deduction"].includes(b.kind)) {
    return Response.json({ error: "kind: compensation | deduction" }, { status: 400 });
  }
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: "amount должен быть > 0" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    const [row] = await q<{ id: string }>(
      `INSERT INTO payroll_entries (user_id, kind, amount, reason, entry_date, note)
       VALUES ($1::uuid, $2, $3::numeric, $4, COALESCE($5::date, CURRENT_DATE), $6)
       RETURNING id`,
      [b.user_id, b.kind, amount, b.reason?.trim() || null, b.entry_date || null,
       b.note?.trim() || null]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'create', 'payroll_entry', $2, $3)`,
      [userId, row.id, JSON.stringify({ kind: b.kind, amount })]
    );
    return row.id;
  });
  return Response.json({ id }, { status: 201 });
}
