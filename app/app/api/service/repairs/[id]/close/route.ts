import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SERVICE_WRITE_ROLES } from "@/lib/service/common";

/** Закрыть открытый ремонтный документ (долг перед клиентом погашен / цикл завершён). */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(SERVICE_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const [doc] = await query<{ id: string; status: string }>(
    `SELECT id, status FROM equipment_repair_docs WHERE id = $1::uuid`,
    [id]
  );
  if (!doc) return Response.json({ error: "not found" }, { status: 404 });
  if (doc.status !== "open") return Response.json({ error: "Документ не открыт" }, { status: 422 });

  await tx(async (q) => {
    await q(
      `UPDATE equipment_repair_docs SET status = 'closed', updated_at = now() WHERE id = $1::uuid`,
      [id]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'close','equipment_repair_doc',$2)`,
      [userId, id]
    );
  });
  return Response.json({ ok: true });
}
