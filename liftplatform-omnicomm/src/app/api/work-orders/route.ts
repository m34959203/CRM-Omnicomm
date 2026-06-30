// Omnicomm/Blueprint — заказ-наряды (раздел 3 Blueprint): план выезда, бригада, многодневность.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

const WoSchema = z.object({
  organization_id: z.string().uuid(),
  object_id: z.string().uuid().optional(),
  incident_id: z.string().uuid().optional(),
  address: z.string().optional(),
  scheduled_start: z.string().optional(),
  scheduled_end: z.string().optional(),
  performers: z.array(z.string().uuid()).default([]),
});

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = (await pool.query(
    `SELECT w.*, o.name AS client,
            COALESCE(json_agg(u.full_name) FILTER (WHERE u.id IS NOT NULL), '[]') AS performers
       FROM work_orders w
       LEFT JOIN organizations o ON o.id = w.organization_id
       LEFT JOIN work_order_performers p ON p.work_order_id = w.id
       LEFT JOIN users u ON u.id = p.user_id
      GROUP BY w.id, o.name ORDER BY w.scheduled_start DESC NULLS LAST LIMIT 200`
  )).rows;
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user || !['admin', 'manager', 'support', 'head'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const parsed = WoSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = parsed.data;
  const dbc = await pool.connect();
  try {
    await dbc.query('BEGIN');
    const number = 'WO-' + (await dbc.query(`SELECT nextval('work_order_seq') n`)).rows[0].n;
    const wo = await dbc.query(
      `INSERT INTO work_orders (number, organization_id, object_id, incident_id, address, scheduled_start, scheduled_end)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [number, d.organization_id, d.object_id ?? null, d.incident_id ?? null, d.address ?? null, d.scheduled_start ?? null, d.scheduled_end ?? null]
    );
    for (const uid of d.performers) {
      await dbc.query(`INSERT INTO work_order_performers (work_order_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [wo.rows[0].id, uid]);
    }
    await dbc.query('COMMIT');
    return NextResponse.json({ data: { id: wo.rows[0].id, number } }, { status: 201 });
  } catch (e) {
    await dbc.query('ROLLBACK');
    throw e;
  } finally {
    dbc.release();
  }
}
