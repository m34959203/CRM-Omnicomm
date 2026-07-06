import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SERVICE_WRITE_ROLES, ensureTestingWarehouse } from "@/lib/service/common";

/**
 * Тест-драйв: единицы со склада → виртуальный склад тестирования (движение to_testing).
 * body: { client_id, object_id?, equipment_ids: string[], note? }
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(SERVICE_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  const ids: string[] = Array.isArray(b?.equipment_ids) ? b.equipment_ids : [];
  if (!b?.client_id || ids.length === 0) {
    return Response.json({ error: "client_id и equipment_ids обязательны" }, { status: 400 });
  }

  try {
    const id = await tx(async (q) => {
      const testWh = await ensureTestingWarehouse(q);
      const [order] = await q<{ id: string }>(
        `INSERT INTO testing_orders (number, client_id, object_id, warehouse_id, status, started_at, note)
         VALUES ('ЗТ-' || lpad(nextval('seq_testing_order_number')::text, 6, '0'),
                 $1::uuid, $2::uuid, $3::uuid, 'open', now(), $4)
         RETURNING id`,
        [b.client_id, b.object_id || null, testWh, b.note?.trim() || null]
      );
      for (const eqId of ids) {
        const [eq] = await q<{
          id: string; status: string; condition: string; warehouse_id: string | null; serial_number: string | null;
        }>(
          `SELECT id, status, condition, warehouse_id, serial_number
           FROM equipment_items WHERE id = $1::uuid FOR UPDATE`,
          [eqId]
        );
        if (!eq) throw new Error(`Единица ${eqId} не найдена`);
        if (!["in_stock", "with_technician"].includes(eq.status)) {
          throw new Error(`Единица ${eq.serial_number ?? eqId}: недоступна для тестирования (${eq.status})`);
        }
        if (eq.condition === "used") {
          // Бизнес-правило: БУ нельзя отдать на тест (equipment_items.condition COMMENT)
          throw new Error(`Единица ${eq.serial_number ?? eqId}: БУ нельзя отдавать на тестирование`);
        }
        await q(
          `INSERT INTO testing_order_items (testing_order_id, equipment_id) VALUES ($1::uuid, $2::uuid)`,
          [order.id, eqId]
        );
        await q(
          `INSERT INTO equipment_movements
             (equipment_id, from_warehouse_id, to_warehouse_id, to_client_id,
              new_status, reason, source_type, source_id, performed_by)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid,
                   'on_testing', 'to_testing', 'testing_order', $5::uuid, $6::uuid)`,
          [eqId, eq.warehouse_id, testWh, b.client_id, order.id, userId]
        );
        await q(
          `UPDATE equipment_items
           SET status = 'on_testing', warehouse_id = $2::uuid, holder_id = NULL,
               client_id = $3::uuid, object_id = $4::uuid, updated_at = now()
           WHERE id = $1::uuid`,
          [eqId, testWh, b.client_id, b.object_id || null]
        );
      }
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'create','testing_order',$2)`,
        [userId, order.id]
      );
      return order.id;
    });
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
}
