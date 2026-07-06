import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SERVICE_WRITE_ROLES } from "@/lib/service/common";

type Q = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;
type Item = { equipment_id: string; is_replacement?: boolean; defect_note?: string };

const DOC_TYPES = ["receive_from_client", "send_to_supplier", "receive_from_supplier", "issue_to_client"];

async function lockUnit(q: Q, id: string) {
  const [eq] = await q<{
    id: string; status: string; condition: string; client_id: string | null;
    object_id: string | null; warehouse_id: string | null; serial_number: string | null;
  }>(
    `SELECT id, status, condition, client_id, object_id, warehouse_id, serial_number
     FROM equipment_items WHERE id = $1::uuid FOR UPDATE`,
    [id]
  );
  if (!eq) throw new Error(`Единица ${id} не найдена`);
  return eq;
}

/**
 * Ремонтный контур — 4 типа документов:
 *  receive_from_client  — единицы клиента → склад (БУ, in_stock); док остаётся open = долг перед клиентом;
 *  send_to_supplier     — со склада → at_supplier; док open до получения;
 *  receive_from_supplier— от поставщика → склад in_stock; док closed;
 *  issue_to_client      — та же или подменная (is_replacement) единица → installed у клиента; док closed.
 * body: { doc_type, client_id?, supplier_id?, warehouse_id?, note?, items: [{equipment_id, is_replacement?, defect_note?}] }
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(SERVICE_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  const items: Item[] = Array.isArray(b?.items) ? b.items : [];
  if (!b?.doc_type || !DOC_TYPES.includes(b.doc_type)) {
    return Response.json({ error: "bad doc_type" }, { status: 400 });
  }
  if (items.length === 0) return Response.json({ error: "items required" }, { status: 400 });
  if (["receive_from_client", "issue_to_client"].includes(b.doc_type) && !b.client_id) {
    return Response.json({ error: "client_id required" }, { status: 400 });
  }
  if (["send_to_supplier", "receive_from_supplier"].includes(b.doc_type) && !b.supplier_id) {
    return Response.json({ error: "supplier_id required" }, { status: 400 });
  }
  if (["receive_from_client", "receive_from_supplier"].includes(b.doc_type) && !b.warehouse_id) {
    return Response.json({ error: "warehouse_id required" }, { status: 400 });
  }

  try {
    const id = await tx(async (q) => {
      const status = ["receive_from_supplier", "issue_to_client"].includes(b.doc_type) ? "closed" : "open";
      const [doc] = await q<{ id: string }>(
        `INSERT INTO equipment_repair_docs (number, doc_type, client_id, supplier_id, status, note, performed_by)
         VALUES ('РМ-' || lpad(nextval('seq_repair_doc_number')::text, 6, '0'),
                 $1, $2::uuid, $3::uuid, $4, $5, $6::uuid)
         RETURNING id`,
        [b.doc_type, b.client_id || null, b.supplier_id || null, status, b.note?.trim() || null, userId]
      );

      for (const item of items) {
        const eq = await lockUnit(q, item.equipment_id);
        await q(
          `INSERT INTO equipment_repair_doc_items (doc_id, equipment_id, is_replacement, defect_note)
           VALUES ($1::uuid, $2::uuid, COALESCE($3, false), $4)`,
          [doc.id, item.equipment_id, item.is_replacement, item.defect_note?.trim() || null]
        );

        if (b.doc_type === "receive_from_client") {
          if (eq.status !== "installed" || eq.client_id !== b.client_id) {
            throw new Error(`Единица ${eq.serial_number ?? eq.id}: не установлена у этого клиента`);
          }
          await q(
            `INSERT INTO equipment_movements
               (equipment_id, from_client_id, to_warehouse_id, new_status, new_condition,
                reason, source_type, source_id, performed_by)
             VALUES ($1::uuid, $2::uuid, $3::uuid, 'in_stock', 'used',
                     'receive_from_client', 'repair_doc', $4::uuid, $5::uuid)`,
            [eq.id, b.client_id, b.warehouse_id, doc.id, userId]
          );
          await q(
            `UPDATE equipment_items
             SET status = 'in_stock', condition = 'used', client_id = NULL, object_id = NULL,
                 warehouse_id = $2::uuid, holder_id = NULL, billing_state = NULL, updated_at = now()
             WHERE id = $1::uuid`,
            [eq.id, b.warehouse_id]
          );
          // стоп абонплаты: закрыть открытый интервал состояний
          await q(
            `UPDATE equipment_state_history SET valid_to = now()
             WHERE equipment_id = $1::uuid AND valid_to IS NULL`,
            [eq.id]
          );
        } else if (b.doc_type === "send_to_supplier") {
          if (eq.status !== "in_stock") {
            throw new Error(`Единица ${eq.serial_number ?? eq.id}: не на складе (${eq.status})`);
          }
          await q(
            `INSERT INTO equipment_movements
               (equipment_id, from_warehouse_id, new_status, reason, source_type, source_id, performed_by)
             VALUES ($1::uuid, $2::uuid, 'at_supplier', 'send_to_supplier', 'repair_doc', $3::uuid, $4::uuid)`,
            [eq.id, eq.warehouse_id, doc.id, userId]
          );
          await q(
            `UPDATE equipment_items
             SET status = 'at_supplier', warehouse_id = NULL, supplier_id = $2::uuid, updated_at = now()
             WHERE id = $1::uuid`,
            [eq.id, b.supplier_id]
          );
        } else if (b.doc_type === "receive_from_supplier") {
          if (eq.status !== "at_supplier") {
            throw new Error(`Единица ${eq.serial_number ?? eq.id}: не у поставщика (${eq.status})`);
          }
          await q(
            `INSERT INTO equipment_movements
               (equipment_id, to_warehouse_id, new_status, reason, source_type, source_id, performed_by)
             VALUES ($1::uuid, $2::uuid, 'in_stock', 'receive_from_supplier', 'repair_doc', $3::uuid, $4::uuid)`,
            [eq.id, b.warehouse_id, doc.id, userId]
          );
          await q(
            `UPDATE equipment_items
             SET status = 'in_stock', warehouse_id = $2::uuid, updated_at = now()
             WHERE id = $1::uuid`,
            [eq.id, b.warehouse_id]
          );
        } else {
          // issue_to_client: та же или подменная единица клиенту
          if (!["in_stock", "with_technician"].includes(eq.status)) {
            throw new Error(`Единица ${eq.serial_number ?? eq.id}: недоступна для выдачи (${eq.status})`);
          }
          await q(
            `INSERT INTO equipment_movements
               (equipment_id, from_warehouse_id, to_client_id, new_status,
                reason, source_type, source_id, performed_by)
             VALUES ($1::uuid, $2::uuid, $3::uuid, 'installed',
                     'issue_to_client', 'repair_doc', $4::uuid, $5::uuid)`,
            [eq.id, eq.warehouse_id, b.client_id, doc.id, userId]
          );
          await q(
            `UPDATE equipment_items
             SET status = 'installed', warehouse_id = NULL, holder_id = NULL,
                 client_id = $2::uuid, updated_at = now()
             WHERE id = $1::uuid`,
            [eq.id, b.client_id]
          );
          // возобновление абонплаты (симметрично стопу при приёме)
          await q(
            `UPDATE equipment_state_history SET valid_to = now()
             WHERE equipment_id = $1::uuid AND valid_to IS NULL`,
            [eq.id]
          );
          await q(
            `INSERT INTO equipment_state_history
               (equipment_id, client_id, state, valid_from, source_type, source_id)
             VALUES ($1::uuid, $2::uuid, 'active', now(), 'repair_doc', $3::uuid)`,
            [eq.id, b.client_id, doc.id]
          );
          await q(
            `UPDATE equipment_items SET billing_state = 'active' WHERE id = $1::uuid`,
            [eq.id]
          );
        }
      }

      // выдача клиенту закрывает его долг: открытые доки приёма этого клиента
      if (b.doc_type === "issue_to_client" && b.close_receive_doc_id) {
        await q(
          `UPDATE equipment_repair_docs SET status = 'closed', updated_at = now()
           WHERE id = $1::uuid AND doc_type = 'receive_from_client' AND status = 'open'
             AND client_id = $2::uuid`,
          [b.close_receive_doc_id, b.client_id]
        );
      }

      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
         VALUES ($1, 'create', 'equipment_repair_doc', $2, jsonb_build_object('doc_type', $3::text))`,
        [userId, doc.id, b.doc_type]
      );
      return doc.id;
    });
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
}
