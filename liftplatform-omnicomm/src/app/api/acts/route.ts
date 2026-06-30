// Omnicomm/Blueprint — Акт ТО: триггер биллинга и складского списания (раздел 4 Blueprint).
// done → оборудование «Активен» + старт абонплаты + активация мониторинга + списание материалов.
// needs_rework → авто-создание заявки (рекурсивная доработка), наряд → 'rework'.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

const ActSchema = z.object({
  work_order_id: z.string().uuid(),
  status: z.enum(['done', 'needs_rework']),
  equipment_ids: z.array(z.string().uuid()).default([]),
  materials: z.array(z.object({
    material_name: z.string(), quantity: z.number().positive().default(1),
    equipment_id: z.string().uuid().optional(),
  })).default([]),
  rework_reason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user || !['technician', 'admin', 'support'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const parsed = ActSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = parsed.data;
  const wo = (await pool.query(`SELECT * FROM work_orders WHERE id = $1`, [d.work_order_id])).rows[0];
  if (!wo) return NextResponse.json({ error: 'Work order not found' }, { status: 404 });

  const dbc = await pool.connect();
  try {
    await dbc.query('BEGIN');
    let reworkIncident: string | null = null;

    if (d.status === 'done') {
      const act = await dbc.query(
        `INSERT INTO maintenance_acts (work_order_id, status, equipment_activated, billing_started_at, monitoring_synced, performed_by)
         VALUES ($1,'done',TRUE,NOW(),TRUE,$2) RETURNING id`,
        [wo.id, user.id]
      );
      const actId = act.rows[0].id;
      // активация оборудования + старт учёта активности (биллинг по активности)
      for (const eqId of d.equipment_ids) {
        await dbc.query(`UPDATE equipment SET status='active', organization_id=$1, object_id=$2, updated_at=NOW() WHERE id=$3`,
          [wo.organization_id, wo.object_id, eqId]);
        await dbc.query(`INSERT INTO equipment_activity (equipment_id, active_from) VALUES ($1, CURRENT_DATE)`, [eqId]);
      }
      // списание материалов
      for (const m of d.materials) {
        await dbc.query(`INSERT INTO material_writeoffs (act_id, material_name, quantity, equipment_id) VALUES ($1,$2,$3,$4)`,
          [actId, m.material_name, m.quantity, m.equipment_id ?? null]);
      }
      await dbc.query(`UPDATE work_orders SET status='done' WHERE id=$1`, [wo.id]);
      await dbc.query('COMMIT');
      return NextResponse.json({ data: { act_id: actId, billing_started: true, equipment_activated: d.equipment_ids.length } }, { status: 201 });
    } else {
      // доработка: новая заявка + наряд в rework
      const inc = await dbc.query(
        `INSERT INTO incidents (organization_id, title, description, severity, status, omnicomm_status, source)
         VALUES ($1,$2,$3,'medium','new','new','manual') RETURNING id`,
        [wo.organization_id, 'Доработка по наряду ' + wo.number, d.rework_reason ?? 'Работа выполнена не полностью', ]
      );
      reworkIncident = inc.rows[0].id;
      const act = await dbc.query(
        `INSERT INTO maintenance_acts (work_order_id, status, rework_incident_id, performed_by)
         VALUES ($1,'needs_rework',$2,$3) RETURNING id`,
        [wo.id, reworkIncident, user.id]
      );
      await dbc.query(`UPDATE work_orders SET status='rework' WHERE id=$1`, [wo.id]);
      await dbc.query('COMMIT');
      return NextResponse.json({ data: { act_id: act.rows[0].id, rework_incident_id: reworkIncident } }, { status: 201 });
    }
  } catch (e) {
    await dbc.query('ROLLBACK');
    throw e;
  } finally {
    dbc.release();
  }
}

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = (await pool.query(
    `SELECT a.*, w.number AS work_order_number FROM maintenance_acts a
       JOIN work_orders w ON w.id = a.work_order_id ORDER BY a.created_at DESC LIMIT 200`
  )).rows;
  return NextResponse.json({ data: rows });
}
