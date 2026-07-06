import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { PAYROLL_WRITE_ROLES } from "@/lib/payroll/common";

/** Создание категории исполнителей. */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(PAYROLL_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.name?.trim()) return Response.json({ error: "name required" }, { status: 400 });

  try {
    const id = await tx(async (q) => {
      const [row] = await q<{ id: string }>(
        `INSERT INTO performer_categories (name, note) VALUES ($1, $2) RETURNING id`,
        [b.name.trim(), b.note?.trim() || null]
      );
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id)
         VALUES ($1, 'create', 'performer_category', $2)`,
        [userId, row.id]
      );
      return row.id;
    });
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      return Response.json({ error: "Категория с таким наименованием уже есть" }, { status: 422 });
    }
    throw e;
  }
}
