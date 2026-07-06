import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

/**
 * Перевод оборудования из карточки клиента:
 *  - to_client_id ≠ текущего → «перевод другому клиенту» (перепродажа техники):
 *    client_id/object_id, движение reason='install' from/to_client + note,
 *    ESH: закрыть интервал и открыть новый с новым client_id — непрерывность биллинга;
 *  - to_client_id опущен/тот же → «перенос на другой объект» этого же клиента.
 * body: { to_object_id: uuid, to_client_id?: uuid }
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = (await requireRole(["admin", "manager", "head"])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const toObjectId = b?.to_object_id as string | undefined;
  const toClientId = (b?.to_client_id as string | undefined) || undefined;
  if (!toObjectId) {
    return Response.json({ error: "to_object_id обязателен" }, { status: 400 });
  }

  const result = await tx(async (q) => {
    const [eq] = await q<{
      id: string;
      status: string;
      billing_state: string | null;
      client_id: string | null;
      object_id: string | null;
      contract_id: string | null;
    }>(
      `SELECT id, status, billing_state, client_id, object_id, contract_id
       FROM equipment_items WHERE id = $1::uuid FOR UPDATE`,
      [id]
    );
    if (!eq) return { error: "not found", status: 404 } as const;
    if (eq.status !== "installed") {
      return { error: "оборудование не установлено у клиента", status: 409 } as const;
    }

    const targetClient = toClientId ?? eq.client_id;
    if (!targetClient) return { error: "не определён клиент", status: 400 } as const;
    const isTransfer = targetClient !== eq.client_id;

    const [obj] = await q<{ id: string; client_id: string; contract_id: string | null }>(
      `SELECT id, client_id, contract_id FROM monitoring_objects WHERE id = $1::uuid`,
      [toObjectId]
    );
    if (!obj) return { error: "объект не найден", status: 404 } as const;
    if (obj.client_id !== targetClient) {
      return { error: "объект принадлежит другому клиенту", status: 409 } as const;
    }
    if (!isTransfer && eq.object_id === toObjectId) {
      return { error: "оборудование уже на этом объекте", status: 409 } as const;
    }

    // при смене клиента договор прежнего клиента не тянем — берём договор объекта (если задан)
    const newContractId = isTransfer ? obj.contract_id : eq.contract_id;

    await q(
      `UPDATE equipment_items
       SET client_id = $2::uuid, object_id = $3::uuid, contract_id = $4::uuid, updated_at = now()
       WHERE id = $1::uuid`,
      [id, targetClient, toObjectId, newContractId]
    );
    await q(
      `INSERT INTO equipment_movements
         (equipment_id, from_client_id, to_client_id, reason, source_type, performed_by, note)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'install', 'manual', $4::uuid, $5)`,
      [id, eq.client_id, targetClient, userId,
       isTransfer ? "перевод другому клиенту" : "перенос на другой объект"]
    );

    // ESH: закрыть открытый интервал и в тот же момент открыть новый — непрерывность биллинга.
    const [open] = await q<{ state: string }>(
      `UPDATE equipment_state_history SET valid_to = now()
       WHERE equipment_id = $1::uuid AND valid_to IS NULL
       RETURNING state`,
      [id]
    );
    const state = open?.state ?? eq.billing_state ?? "active";
    await q(
      `INSERT INTO equipment_state_history
         (equipment_id, object_id, client_id, contract_id, state, valid_from, source_type)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, now(), 'manual')`,
      [id, toObjectId, targetClient, newContractId, state]
    );

    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, $2, 'equipment_item', $3, $4)`,
      [userId, isTransfer ? "transfer_client" : "move_object", id,
       JSON.stringify({
         from_client_id: eq.client_id,
         to_client_id: targetClient,
         from_object_id: eq.object_id,
         to_object_id: toObjectId,
         state,
       })]
    );
    return { ok: true, isTransfer } as const;
  });

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json({ ok: true, transfer: result.isTransfer });
}
