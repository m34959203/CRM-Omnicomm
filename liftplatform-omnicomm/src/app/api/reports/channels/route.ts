// Omnicomm gap — отчёт по каналам связи (раздел 17 ТЗ).
// Сводит обращения по источникам: телефон, WhatsApp, Telegram, email, сайт, ручное.
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user || !['admin', 'org_admin', 'manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const calls = (await pool.query(`SELECT COUNT(*)::int n FROM calls`)).rows[0].n;
  const byChannel = (await pool.query(
    `SELECT channel, COUNT(*)::int n FROM client_messages GROUP BY channel ORDER BY n DESC`
  )).rows;
  return NextResponse.json({ data: { calls, messages_by_channel: byChannel } });
}
