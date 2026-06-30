// Omnicomm gap — IP-телефония (раздел 12.1 ТЗ).
// Стиль LiftPlatform: Next.js App Router + pg pool + Zod + заголовочная аутентификация.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';                 // существующий пул LiftPlatform
import { getUserFromRequest } from '@/lib/auth'; // существующий помощник LiftPlatform

const WebhookSchema = z.object({
  direction: z.enum(['incoming', 'outgoing', 'missed']),
  phone: z.string().min(3),
  duration_sec: z.number().int().nonnegative().default(0),
  recording_url: z.string().url().optional(),
  result: z.string().max(50).optional(),
});

const digits = (s: string) => s.replace(/\D/g, '');

// Вебхук телефонии: фиксирует звонок и привязывает к клиенту по номеру.
// Аутентификация — секрет в заголовке (как X-Cron-Secret в LiftPlatform).
export async function POST(req: NextRequest) {
  if (req.headers.get('x-telephony-secret') !== process.env.TELEPHONY_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const parsed = WebhookSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { direction, phone, duration_sec, recording_url, result } = parsed.data;

  // авто-привязка к организации-клиенту по нормализованному номеру
  const org = await pool.query(
    `SELECT id FROM organizations WHERE regexp_replace(COALESCE(phone,''), '\\D', '', 'g') = $1 LIMIT 1`,
    [digits(phone)]
  );
  const orgId = org.rows[0]?.id ?? null;

  const ins = await pool.query(
    `INSERT INTO calls (direction, phone, organization_id, duration_sec, recording_url, result)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [direction, phone, orgId, duration_sec, recording_url ?? null, result ?? null]
  );

  // если номер не найден — фронт предложит создать клиента/заявку (раздел 12.1, правило 9 ТЗ)
  return NextResponse.json(
    { data: { call_id: ins.rows[0].id, organization_id: orgId, matched: !!orgId } },
    { status: 201 }
  );
}

// Список звонков (для карточки клиента и журнала). Доступ — по роли.
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.get('organization_id')) { params.push(sp.get('organization_id')); where.push(`organization_id = $${params.length}`); }
  if (sp.get('direction')) { params.push(sp.get('direction')); where.push(`direction = $${params.length}`); }
  const sql = `SELECT * FROM calls ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 100`;
  const rows = (await pool.query(sql, params)).rows;
  return NextResponse.json({ data: rows });
}
