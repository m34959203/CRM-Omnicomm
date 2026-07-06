import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SERVICE_WRITE_ROLES, PHOTO_REQUIRED_TYPES } from "@/lib/service/common";

type Q = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

/** Открыть интервал состояний active (как pushState в act-close). */
async function pushActiveState(
  q: Q,
  equipmentId: string,
  ctx: { objectId: string | null; clientId: string; sourceId: string }
) {
  await q(
    `UPDATE equipment_state_history SET valid_to = now()
     WHERE equipment_id = $1::uuid AND valid_to IS NULL`,
    [equipmentId]
  );
  await q(
    `INSERT INTO equipment_state_history
       (equipment_id, object_id, client_id, state, valid_from, source_type, source_id)
     VALUES ($1::uuid, $2::uuid, $3::uuid, 'active', now(), 'testing_order', $4::uuid)`,
    [equipmentId, ctx.objectId, ctx.clientId, ctx.sourceId]
  );
  await q(`UPDATE equipment_items SET billing_state = 'active', updated_at = now() WHERE id = $1::uuid`, [
    equipmentId,
  ]);
}

/**
 * Завершение тестирования. body: { result: 'sale' | 'refusal' }
 *  - sale: заказ клиента (items по default_price), единицы остаются у клиента:
 *    status=installed + старт абонплаты (ESH active);
 *  - refusal: заявка type='dismantle', единицы ждут демонтажа актом ТО.
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
  if (!["sale", "refusal"].includes(b?.result)) {
    return Response.json({ error: "result: sale | refusal" }, { status: 400 });
  }

  try {
    const out = await tx(async (q) => {
      const [order] = await q<{
        id: string; number: string; status: string; client_id: string; object_id: string | null;
      }>(
        `SELECT id, number, status, client_id, object_id FROM testing_orders WHERE id = $1::uuid FOR UPDATE`,
        [id]
      );
      if (!order) throw Object.assign(new Error("not found"), { status: 404 });
      if (order.status !== "open") throw new Error("Тестирование уже завершено");

      const items = await q<{
        equipment_id: string; nomenclature_id: string; nom_name: string;
        default_price: string | null; serial_number: string | null;
      }>(
        `SELECT ti.equipment_id, e.nomenclature_id, n.name AS nom_name, n.default_price, e.serial_number
         FROM testing_order_items ti
         JOIN equipment_items e ON e.id = ti.equipment_id
         JOIN nomenclature n ON n.id = e.nomenclature_id
         WHERE ti.testing_order_id = $1::uuid`,
        [id]
      );
      if (items.length === 0) throw new Error("В тестировании нет единиц");

      if (b.result === "sale") {
        const total = items.reduce((s, i) => s + Number(i.default_price ?? 0), 0);
        const [so] = await q<{ id: string; number: string }>(
          `INSERT INTO sales_orders (number, client_id, shipment_order, status, manager_id, total_amount, note)
           VALUES ('ЗК-' || lpad(nextval('seq_sales_order_number')::text, 6, '0'),
                   $1::uuid, 'no_install', 'new', $2::uuid, $3, 'По результату тестирования ' || $4)
           RETURNING id, number`,
          [order.client_id, userId, total, order.number]
        );
        for (const it of items) {
          await q(
            `INSERT INTO sales_order_items (order_id, nomenclature_id, name, is_service, quantity, price, object_id)
             VALUES ($1::uuid, $2::uuid, $3, false, 1, COALESCE($4::numeric, 0), $5::uuid)`,
            [so.id, it.nomenclature_id, it.nom_name + (it.serial_number ? ` (SN ${it.serial_number})` : ""),
             it.default_price, order.object_id]
          );
          // единица остаётся у клиента: installed + старт абонплаты
          await q(
            `INSERT INTO equipment_movements
               (equipment_id, to_client_id, new_status, reason, source_type, source_id, performed_by)
             VALUES ($1::uuid, $2::uuid, 'installed', 'from_testing', 'testing_order', $3::uuid, $4::uuid)`,
            [it.equipment_id, order.client_id, id, userId]
          );
          await q(
            `UPDATE equipment_items
             SET status = 'installed', warehouse_id = NULL, holder_id = NULL,
                 client_id = $2::uuid, object_id = $3::uuid, updated_at = now()
             WHERE id = $1::uuid`,
            [it.equipment_id, order.client_id, order.object_id]
          );
          await pushActiveState(q, it.equipment_id, {
            objectId: order.object_id,
            clientId: order.client_id,
            sourceId: id,
          });
        }
        await q(
          `UPDATE testing_orders
           SET status = 'completed', result = 'sale', sales_order_id = $2::uuid,
               finished_at = now(), updated_at = now()
           WHERE id = $1::uuid`,
          [id, so.id]
        );
        await q(
          `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
           VALUES ($1, 'complete_sale', 'testing_order', $2, jsonb_build_object('sales_order', $3::text))`,
          [userId, id, so.number]
        );
        return { result: "sale", sales_order_id: so.id, sales_order_number: so.number };
      }

      // refusal → заявка на демонтаж
      const [reqRow] = await q<{ id: string; number: string }>(
        `INSERT INTO requests (number, client_id, object_id, type, priority, source, subject, photo_required)
         VALUES ('Z-' || lpad(nextval('seq_request_number')::text, 6, '0'),
                 $1::uuid, $2::uuid, 'dismantle', 'normal', 'manual',
                 'Демонтаж после тестирования ' || $3, $4)
         RETURNING id, number`,
        [order.client_id, order.object_id, order.number, PHOTO_REQUIRED_TYPES.includes("dismantle")]
      );
      await q(
        `INSERT INTO request_history (request_id, action, detail, user_id)
         VALUES ($1::uuid, 'create', 'Создана по отказу от тестирования', $2::uuid)`,
        [reqRow.id, userId]
      );
      await q(
        `UPDATE testing_orders
         SET status = 'completed', result = 'refusal', dismantle_request_id = $2::uuid,
             finished_at = now(), updated_at = now()
         WHERE id = $1::uuid`,
        [id, reqRow.id]
      );
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
         VALUES ($1, 'complete_refusal', 'testing_order', $2, jsonb_build_object('request', $3::text))`,
        [userId, id, reqRow.number]
      );
      return { result: "refusal", request_id: reqRow.id, request_number: reqRow.number };
    });
    return Response.json(out);
  } catch (e) {
    const status = (e as { status?: number }).status ?? 422;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
