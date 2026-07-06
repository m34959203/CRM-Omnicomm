import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SERVICE_WRITE_ROLES, ensureTechnicianWarehouse } from "@/lib/service/common";

/**
 * «Передать оборудование технику»: автоперемещение единиц со склада на склад
 * техника (type='technician', создаётся при первом использовании).
 * body: { technician_id, equipment_ids: string[] }
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(SERVICE_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(b?.equipment_ids) ? b.equipment_ids : [];
  if (!b?.technician_id || ids.length === 0) {
    return Response.json({ error: "technician_id и equipment_ids обязательны" }, { status: 400 });
  }

  const [wo] = await query<{ id: string; status: string }>(
    `SELECT id, status FROM work_orders WHERE id = $1::uuid`,
    [id]
  );
  if (!wo) return Response.json({ error: "not found" }, { status: 404 });
  if (["done", "cancelled"].includes(wo.status)) {
    return Response.json({ error: "Наряд уже завершён" }, { status: 422 });
  }

  try {
    const moved = await tx(async (q) => {
      const techWh = await ensureTechnicianWarehouse(q, b.technician_id);
      let count = 0;
      for (const eqId of ids) {
        const [eq] = await q<{
          id: string; status: string; warehouse_id: string | null; holder_id: string | null; serial_number: string | null;
        }>(
          `SELECT id, status, warehouse_id, holder_id, serial_number
           FROM equipment_items WHERE id = $1::uuid FOR UPDATE`,
          [eqId]
        );
        if (!eq) throw new Error(`Единица ${eqId} не найдена`);
        if (!["in_stock", "reserved", "with_technician"].includes(eq.status)) {
          throw new Error(`Единица ${eq.serial_number ?? eqId}: статус «${eq.status}» не позволяет передачу`);
        }
        await q(
          `INSERT INTO equipment_movements
             (equipment_id, from_warehouse_id, to_warehouse_id, from_holder_id, to_holder_id,
              new_status, reason, source_type, source_id, performed_by)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
                   'with_technician', 'assign_to_technician', 'work_order', $6::uuid, $7::uuid)`,
          [eqId, eq.warehouse_id, techWh, eq.holder_id, b.technician_id, id, userId]
        );
        await q(
          `UPDATE equipment_items
           SET status = 'with_technician', warehouse_id = $2::uuid, holder_id = $3::uuid, updated_at = now()
           WHERE id = $1::uuid`,
          [eqId, techWh, b.technician_id]
        );
        count++;
      }
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
         VALUES ($1, 'transfer_equipment', 'work_order', $2,
                 jsonb_build_object('technician', $3::text, 'count', $4::int))`,
        [userId, id, b.technician_id, count]
      );
      return count;
    });
    return Response.json({ ok: true, moved });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
}
