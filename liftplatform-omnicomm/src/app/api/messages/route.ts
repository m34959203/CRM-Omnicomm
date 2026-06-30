// Omnicomm gap — приём сообщений каналов: Telegram, email, форма сайта, чат (раздел 12.2 ТЗ).
// WhatsApp уже покрыт wa-gateway/whatsapp_message_log; этот роут — для остальных каналов.
// Авто-привязка к клиенту по контакту; опционально создаёт заявку (incident).
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

const digits = (s: string) => s.replace(/\D/g, '');

const InboundSchema = z.object({
  channel: z.enum(['telegram', 'email', 'site', 'chat']),
  contact: z.string().min(3),          // телефон или email
  content: z.string().min(1).max(4000),
  create_request: z.boolean().optional().default(false),
  subject: z.string().max(255).optional(),
});

// Вебхук приёма сообщений. Аутентификация — секрет канала (как X-WA-Secret).
export async function POST(req: NextRequest) {
  if (req.headers.get('x-channel-secret') !== process.env.CHANNEL_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const parsed = InboundSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { channel, contact, content, create_request, subject } = parsed.data;

  // привязка к клиенту по email или по нормализованному телефону
  const isEmail = contact.includes('@');
  const org = (await pool.query(
    isEmail
      ? `SELECT id FROM organizations WHERE lower(email) = lower($1) LIMIT 1`
      : `SELECT id FROM organizations WHERE regexp_replace(COALESCE(phone,''), '\\D', '', 'g') = $1 LIMIT 1`,
    [isEmail ? contact : digits(contact)]
  )).rows[0];
  const orgId = org?.id ?? null;

  let incidentId: string | null = null;
  const dbc = await pool.connect();
  try {
    await dbc.query('BEGIN');
    // создаём заявку, если запрошено и клиент определён (правило ТЗ 12.2: «при необходимости»)
    if (create_request && orgId) {
      const inc = await dbc.query(
        `INSERT INTO incidents (organization_id, title, description, severity, status, source)
         VALUES ($1,$2,$3,'medium','new',$4) RETURNING id`,
        [orgId, subject ?? `Обращение из ${channel}`, content, channel]
      );
      incidentId = inc.rows[0].id;
    }
    await dbc.query(
      `INSERT INTO client_messages (channel, direction, contact, organization_id, incident_id, content)
       VALUES ($1,'incoming',$2,$3,$4,$5)`,
      [channel, contact, orgId, incidentId, content]
    );
    await dbc.query('COMMIT');
  } catch (e) {
    await dbc.query('ROLLBACK');
    throw e;
  } finally {
    dbc.release();
  }

  return NextResponse.json(
    { data: { matched: !!orgId, organization_id: orgId, incident_id: incidentId } },
    { status: 201 }
  );
}

// Журнал сообщений (для карточки клиента и истории переписки).
export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.get('organization_id')) { params.push(sp.get('organization_id')); where.push(`organization_id = $${params.length}`); }
  if (sp.get('channel')) { params.push(sp.get('channel')); where.push(`channel = $${params.length}`); }
  const sql = `SELECT * FROM client_messages ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC LIMIT 100`;
  return NextResponse.json({ data: (await pool.query(sql, params)).rows });
}
