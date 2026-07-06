/**
 * Закрытие акта ТО — центральная документная операция сервисного контура
 * (эталон Аскан, docs/ascan/): порождает движения оборудования, записи
 * equipment_state_history (старт/стоп биллинга), SIM-операции, фиксацию
 * сдельных расценок → payroll_entries, и продвигает наряд/заявку/тикет.
 *
 * Активация оборудования дополнительно требует создания объекта в Omnicomm —
 * вызов вынесен за инъектируемый hook (syncActivation), чтобы логика документа
 * тестировалась без сети, а UI/джоба решали, когда синхронизировать.
 */
import { tx } from "@/lib/db";

type Q = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

export class ActCloseError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

export type ActivationEvent = {
  equipmentId: string;
  objectId: string | null;
  clientId: string;
  kind: "activated" | "deactivated";
};

export type CloseActResult = {
  actId: string;
  number: string;
  movements: number;
  activations: ActivationEvent[];
  payrollEntries: number;
  workOrderStatus: string;
  requestClosed: boolean;
  ticketClosed: boolean;
};

/** Разрешение сдельной расценки: исполнитель > категория > умолчание > work_types.default_rate. */
async function resolveRate(q: Q, workTypeId: string, performerId: string): Promise<number> {
  const [byPerformer] = await q<{ rate: string }>(
    `SELECT rate FROM work_rates
     WHERE is_active AND work_type_id = $1 AND scope = 'performer' AND user_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [workTypeId, performerId]
  );
  if (byPerformer) return Number(byPerformer.rate);

  const [byCategory] = await q<{ rate: string }>(
    `SELECT wr.rate FROM work_rates wr
     JOIN performer_category_assignments pca
       ON pca.category_id = wr.category_id AND pca.user_id = $2
     WHERE wr.is_active AND wr.work_type_id = $1 AND wr.scope = 'category'
     ORDER BY pca.valid_from DESC LIMIT 1`,
    [workTypeId, performerId]
  );
  if (byCategory) return Number(byCategory.rate);

  const [byDefault] = await q<{ rate: string }>(
    `SELECT rate FROM work_rates
     WHERE is_active AND work_type_id = $1 AND scope = 'default'
     ORDER BY created_at DESC LIMIT 1`,
    [workTypeId]
  );
  if (byDefault) return Number(byDefault.rate);

  const [wt] = await q<{ default_rate: string | null }>(
    `SELECT default_rate FROM work_types WHERE id = $1`,
    [workTypeId]
  );
  return wt?.default_rate ? Number(wt.default_rate) : 0;
}

/** Закрыть открытый интервал состояний и открыть новый. */
async function pushState(
  q: Q,
  equipmentId: string,
  state: "active" | "conservation" | "disabled",
  ctx: { objectId: string | null; clientId: string; contractId?: string | null; actId: string }
) {
  await q(
    `UPDATE equipment_state_history SET valid_to = now()
     WHERE equipment_id = $1 AND valid_to IS NULL`,
    [equipmentId]
  );
  await q(
    `INSERT INTO equipment_state_history
       (equipment_id, object_id, client_id, contract_id, state, valid_from, source_type, source_id)
     VALUES ($1,$2,$3,$4,$5, now(), 'maintenance_act', $6)`,
    [equipmentId, ctx.objectId, ctx.clientId, ctx.contractId ?? null, state, ctx.actId]
  );
  await q(`UPDATE equipment_items SET billing_state = $2 WHERE id = $1`, [equipmentId, state]);
}

export async function closeMaintenanceAct(
  actId: string,
  userId: string,
  opts: { returnWarehouseId?: string } = {}
): Promise<CloseActResult> {
  return tx(async (q) => {
    const [act] = await q<{
      id: string;
      number: string | null;
      status: string;
      work_order_id: string;
      performed_by: string | null;
      client_id: string | null;
      wo_object_id: string | null;
      contract_id: string | null;
      request_id: string | null;
    }>(
      `SELECT a.id, a.number, a.status, a.work_order_id, a.performed_by,
              w.client_id, w.object_id AS wo_object_id, NULL::uuid AS contract_id, w.request_id
       FROM maintenance_acts a
       JOIN work_orders w ON w.id = a.work_order_id
       WHERE a.id = $1 FOR UPDATE OF a`,
      [actId]
    );
    if (!act) throw new ActCloseError("Акт не найден", 404);
    if (act.status === "done") throw new ActCloseError("Акт уже закрыт");
    if (act.status === "cancelled") throw new ActCloseError("Акт отменён");
    if (!act.client_id) throw new ActCloseError("У наряда не указан клиент");

    const lines = await q<{
      id: string;
      action: string;
      basis: string | null;
      object_id: string | null;
      installed_equipment_id: string | null;
      removed_equipment_id: string | null;
    }>(`SELECT * FROM maintenance_act_lines WHERE act_id = $1`, [actId]);
    if (lines.length === 0) throw new ActCloseError("В акте нет строк оборудования/работ");

    // Бизнес-правило легаси: фотоотчёт обязателен, если заявка того требует.
    if (act.request_id) {
      const [req] = await q<{ photo_required: boolean }>(
        `SELECT photo_required FROM requests WHERE id = $1`,
        [act.request_id]
      );
      if (req?.photo_required) {
        const [photo] = await q(
          `SELECT 1 FROM attachments
           WHERE entity_type = 'maintenance_act' AND entity_id = $1 AND kind = 'photo' LIMIT 1`,
          [actId]
        );
        if (!photo) throw new ActCloseError("Нельзя закрыть: обязателен фотоотчёт (нет фото в акте)");
      }
    }

    let movements = 0;
    const activations: ActivationEvent[] = [];

    // Склад возврата снятого оборудования: параметр или первый физический склад.
    let returnWarehouse = opts.returnWarehouseId ?? null;
    if (!returnWarehouse) {
      const [wh] = await q<{ id: string }>(
        `SELECT id FROM warehouses WHERE type = 'physical' AND is_active ORDER BY created_at LIMIT 1`
      );
      returnWarehouse = wh?.id ?? null;
    }

    for (const line of lines) {
      const objectId = line.object_id ?? act.wo_object_id;

      if (line.action === "install" || line.action === "replace") {
        const eqId = line.installed_equipment_id;
        if (!eqId) throw new ActCloseError(`Строка ${line.action}: не указано устанавливаемое оборудование`);
        const [eq] = await q<{ id: string; status: string; warehouse_id: string | null; holder_id: string | null }>(
          `SELECT id, status, warehouse_id, holder_id FROM equipment_items WHERE id = $1 FOR UPDATE`,
          [eqId]
        );
        if (!eq) throw new ActCloseError("Устанавливаемое оборудование не найдено", 404);
        if (eq.status === "installed") throw new ActCloseError("Оборудование уже установлено у клиента");
        if (eq.status === "written_off") throw new ActCloseError("Оборудование списано");

        await q(
          `INSERT INTO equipment_movements
             (equipment_id, from_warehouse_id, from_holder_id, to_client_id,
              new_status, reason, source_type, source_id, performed_by)
           VALUES ($1,$2,$3,$4,'installed','install','maintenance_act',$5,$6)`,
          [eqId, eq.warehouse_id, eq.holder_id, act.client_id, actId, userId]
        );
        await q(
          `UPDATE equipment_items
           SET status='installed', warehouse_id=NULL, holder_id=NULL, client_id=$2, object_id=$3
           WHERE id = $1`,
          [eqId, act.client_id, objectId]
        );
        // Тестирование — на виртуальный склад без активации абонплаты (запрет продажи БУ учтён выше).
        if (line.basis === "testing") {
          await q(
            `UPDATE equipment_items SET status='on_testing',
               warehouse_id=(SELECT id FROM warehouses WHERE type='testing' AND is_active LIMIT 1)
             WHERE id = $1`,
            [eqId]
          );
        } else {
          await pushState(q, eqId, "active", { objectId, clientId: act.client_id, actId });
          activations.push({ equipmentId: eqId, objectId, clientId: act.client_id, kind: "activated" });
        }
        movements++;
      }

      if (line.action === "dismantle" || line.action === "replace") {
        const eqId = line.removed_equipment_id;
        if (!eqId) throw new ActCloseError(`Строка ${line.action}: не указано снимаемое оборудование`);
        const writeOff = line.basis === "write_off";
        await q(
          `INSERT INTO equipment_movements
             (equipment_id, from_client_id, to_warehouse_id,
              new_status, new_condition, reason, source_type, source_id, performed_by)
           VALUES ($1,$2,$3,$4,'used','dismantle','maintenance_act',$5,$6)`,
          [eqId, act.client_id, writeOff ? null : returnWarehouse,
           writeOff ? "written_off" : "in_stock", actId, userId]
        );
        await q(
          `UPDATE equipment_items
           SET status=$2, condition='used', client_id=NULL, object_id=NULL,
               warehouse_id=$3, billing_state=NULL
           WHERE id = $1`,
          [eqId, writeOff ? "written_off" : "in_stock", writeOff ? null : returnWarehouse]
        );
        await q(
          `UPDATE equipment_state_history SET valid_to = now()
           WHERE equipment_id = $1 AND valid_to IS NULL`,
          [eqId]
        );
        await q(
          `INSERT INTO equipment_state_history
             (equipment_id, object_id, client_id, state, valid_from, valid_to, source_type, source_id)
           VALUES ($1,$2,$3,'disabled', now(), now(), 'maintenance_act', $4)`,
          [eqId, objectId, act.client_id, actId]
        );
        activations.push({ equipmentId: eqId, objectId, clientId: act.client_id, kind: "deactivated" });
        movements++;
      }
    }

    // SIM-операции: контроль слотов и движения.
    const simOps = await q<{ id: string; sim_id: string; op: string; equipment_id: string | null }>(
      `SELECT id, sim_id, op, equipment_id FROM act_sim_ops WHERE act_id = $1`,
      [actId]
    );
    for (const s of simOps) {
      if (s.op === "install") {
        if (!s.equipment_id) throw new ActCloseError("SIM-установка без оборудования");
        const [slots] = await q<{ max_sim_slots: number; used: string }>(
          `SELECT n.max_sim_slots,
                  (SELECT count(*) FROM sim_cards WHERE equipment_id = e.id) AS used
           FROM equipment_items e JOIN nomenclature n ON n.id = e.nomenclature_id
           WHERE e.id = $1`,
          [s.equipment_id]
        );
        if (slots && slots.max_sim_slots > 0 && Number(slots.used) >= slots.max_sim_slots) {
          throw new ActCloseError(`Превышен лимит SIM в устройстве (${slots.max_sim_slots})`);
        }
        await q(
          `UPDATE sim_cards SET location_type='equipment', equipment_id=$2, warehouse_id=NULL,
             holder_id=NULL, status='installed' WHERE id = $1`,
          [s.sim_id, s.equipment_id]
        );
        await q(
          `INSERT INTO sim_movements (sim_id, from_type, to_type, equipment_id, source_type, source_id, performed_by)
           VALUES ($1, 'warehouse', 'equipment', $2, 'maintenance_act', $3, $4)`,
          [s.sim_id, s.equipment_id, actId, userId]
        );
      } else {
        await q(
          `UPDATE sim_cards SET location_type='warehouse', equipment_id=NULL, warehouse_id=$2,
             status='in_stock' WHERE id = $1`,
          [s.sim_id, returnWarehouse]
        );
        await q(
          `INSERT INTO sim_movements (sim_id, from_type, to_type, warehouse_id, source_type, source_id, performed_by)
           VALUES ($1, 'equipment', 'warehouse', $2, 'maintenance_act', $3, $4)`,
          [s.sim_id, returnWarehouse, actId, userId]
        );
      }
    }

    // Сдельные работы: фиксация расценки на момент закрытия + payroll_entries.
    const works = await q<{ id: string; work_type_id: string; performer_id: string; quantity: string; rate: string }>(
      `SELECT id, work_type_id, performer_id, quantity, rate FROM act_works WHERE act_id = $1`,
      [actId]
    );
    let payrollEntries = 0;
    for (const w of works) {
      let rate = Number(w.rate);
      if (rate === 0) rate = await resolveRate(q, w.work_type_id, w.performer_id);
      const amount = Math.round(rate * Number(w.quantity) * 100) / 100;
      await q(`UPDATE act_works SET rate=$2, amount=$3 WHERE id=$1`, [w.id, rate, amount]);
      await q(
        `INSERT INTO payroll_entries (user_id, kind, amount, act_work_id, entry_date)
         VALUES ($1, 'work', $2, $3, CURRENT_DATE)`,
        [w.performer_id, amount, w.id]
      );
      payrollEntries++;
    }

    // Номер, статус, наряд.
    const number =
      act.number ??
      (await q<{ n: string }>(`SELECT 'АТО-' || lpad(nextval('seq_act_number')::text, 6, '0') AS n`))[0].n;
    await q(
      `UPDATE maintenance_acts SET status='done', number=$2, closed_by=$3, closed_at=now() WHERE id=$1`,
      [actId, number, userId]
    );
    await q(`UPDATE work_orders SET status='done' WHERE id = $1`, [act.work_order_id]);

    // Заявка → completed; тикет автозакрывается, когда закрыты все его заявки.
    let requestClosed = false;
    let ticketClosed = false;
    if (act.request_id) {
      await q(
        `UPDATE requests SET status='completed', closed_at=now() WHERE id=$1 AND status NOT IN ('closed','cancelled')`,
        [act.request_id]
      );
      await q(
        `INSERT INTO request_history (request_id, action, detail, user_id)
         VALUES ($1, 'status', 'completed: закрыт акт ' || $2, $3)`,
        [act.request_id, number, userId]
      );
      requestClosed = true;
      const [reqRow] = await q<{ ticket_id: string | null }>(
        `SELECT ticket_id FROM requests WHERE id = $1`,
        [act.request_id]
      );
      if (reqRow?.ticket_id) {
        const [open] = await q<{ cnt: string }>(
          `SELECT count(*) AS cnt FROM requests
           WHERE ticket_id = $1 AND status NOT IN ('completed','closed','cancelled')`,
          [reqRow.ticket_id]
        );
        if (Number(open.cnt) === 0) {
          await q(
            `UPDATE tickets SET status='done', closed_at=now() WHERE id=$1 AND status <> 'done'`,
            [reqRow.ticket_id]
          );
          ticketClosed = true;
        }
      }
    }

    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'close','maintenance_act',$2)`,
      [userId, actId]
    );

    return {
      actId, number, movements, activations, payrollEntries,
      workOrderStatus: "done", requestClosed, ticketClosed,
    };
  });
}

/** «Требуется доработка»: акт → needs_rework + новый наряд по той же заявке. */
export async function reworkMaintenanceAct(
  actId: string,
  userId: string,
  note?: string
): Promise<{ newWorkOrderId: string }> {
  return tx(async (q) => {
    const [act] = await q<{ id: string; status: string; work_order_id: string }>(
      `SELECT id, status, work_order_id FROM maintenance_acts WHERE id = $1 FOR UPDATE`,
      [actId]
    );
    if (!act) throw new ActCloseError("Акт не найден", 404);
    if (act.status === "done") throw new ActCloseError("Акт уже закрыт");

    const [wo] = await q<{ client_id: string | null; object_id: string | null; request_id: string | null; address: string | null }>(
      `SELECT client_id, object_id, request_id, address FROM work_orders WHERE id = $1`,
      [act.work_order_id]
    );
    const [newWo] = await q<{ id: string }>(
      `INSERT INTO work_orders (number, client_id, object_id, request_id, address, status, note, created_by)
       VALUES ('ЗН-' || lpad(nextval('seq_work_order_number')::text, 6, '0'),
               $1, $2, $3, $4, 'planned', $5, $6)
       RETURNING id`,
      [wo?.client_id, wo?.object_id, wo?.request_id, wo?.address,
       note ?? "Повторный выезд: требуется доработка", userId]
    );
    await q(
      `UPDATE maintenance_acts SET status='needs_rework' WHERE id = $1`,
      [actId]
    );
    await q(`UPDATE work_orders SET status='rework' WHERE id = $1`, [act.work_order_id]);
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1,'rework','maintenance_act',$2, jsonb_build_object('new_work_order', $3::text))`,
      [userId, actId, newWo.id]
    );
    return { newWorkOrderId: newWo.id };
  });
}
