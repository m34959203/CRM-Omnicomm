// Omnicomm gap — счета абонплаты со статусами (раздел 16.2 ТЗ).
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const where: string[] = [];
  const params: unknown[] = [];
  if (sp.get('organization_id')) { params.push(sp.get('organization_id')); where.push(`i.organization_id = $${params.length}`); }
  if (sp.get('status')) { params.push(sp.get('status')); where.push(`i.status = $${params.length}`); }
  const sql = `SELECT i.*, o.name AS client_name FROM subscription_invoices i
                 JOIN organizations o ON o.id = i.organization_id
                ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                ORDER BY i.period_start DESC, o.name LIMIT 200`;
  return NextResponse.json({ data: (await pool.query(sql, params)).rows });
}
