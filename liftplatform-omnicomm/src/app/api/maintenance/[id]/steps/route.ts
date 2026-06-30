// Omnicomm gap — этапы выезда монтажника с геолокацией (раздел 9.3 ТЗ).
// Опирается на maintenance_schedules (= выезд) и visit_steps (migration-017).
// Стиль LiftPlatform: App Router + pg pool + Zod + getUserFromRequest + audit.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';
import { writeAudit } from '@/lib/audit'; // существующий помощник аудита LiftPlatform

// этап → новый статус ТО (раздел 8) и статус монтажника (раздел 9.2)
const STEP_FLOW: Record<string, { status: string; installer: string }> = {
  accept: { status: 'assigned', installer: 'assigned' },
  depart: { status: 'en_route', installer: 'en_route' },
  arrive: { status: 'on_site', installer: 'on_site' },
  start:  { status: 'in_progress', installer: 'working' },
  finish: { status: 'completed', installer: 'done' },
};

const StepSchema = z.object({
  step: z.enum(['accept', 'depart', 'arrive', 'start', 'finish', 'cant_do', 'repeat']),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  note: z.string().max(1000).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const rows = (await pool.query(
    `SELECT vs.*, u.name AS performed_by_name
       FROM visit_steps vs LEFT JOIN users u ON u.id = vs.performed_by
      WHERE vs.maintenance_id = $1 ORDER BY vs.created_at`, [id]
  )).rows;
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['technician', 'admin'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const parsed = StepSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { step, lat, lng, note } = parsed.data;

  const m = (await pool.query(`SELECT id, photo_required FROM maintenance_schedules WHERE id = $1`, [id])).rows[0];
  if (!m) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Правило ТЗ (раздел 20): завершение монтажной заявки без фотоотчёта запрещено.
  if (step === 'finish' && m.photo_required) {
    const photos = (await pool.query(
      `SELECT COUNT(*)::int n FROM documents
        WHERE maintenance_id = $1 AND document_type IN ('photo','photo_before','photo_after','photo_result')`, [id]
    )).rows[0].n;
    if (photos === 0) {
      return NextResponse.json({ error: 'Нельзя завершить выезд без обязательного фотоотчёта' }, { status: 422 });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO visit_steps (maintenance_id, step, lat, lng, performed_by, note)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, step, lat ?? null, lng ?? null, user.id, note ?? null]
    );
    const flow = STEP_FLOW[step];
    if (flow) {
      await client.query(`UPDATE maintenance_schedules SET status = $1, updated_at = NOW() WHERE id = $2`, [flow.status, id]);
      await client.query(`UPDATE users SET installer_status = $1 WHERE id = $2`, [flow.installer, user.id]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await writeAudit({ userId: user.id, action: 'visit_step', entityType: 'maintenance', entityId: id, details: { step, lat, lng } });
  return NextResponse.json({ data: { ok: true, step } }, { status: 201 });
}
