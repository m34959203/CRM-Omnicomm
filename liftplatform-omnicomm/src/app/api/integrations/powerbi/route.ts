// Omnicomm — выгрузка для Power BI (раздел 23 / 11 ТЗ).
// Плоский датасет заявок и счетов для Power BI Web-коннектора. Защита секретом.
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

async function authorized(req: NextRequest) {
  if (req.headers.get('x-bi-secret') === process.env.BI_SECRET) return true;
  const user = await getUserFromRequest(req);
  return !!user && ['admin', 'manager'].includes(user.role);
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const requests = (await pool.query(
    `SELECT i.id, i.request_number, i.request_type, i.omnicomm_status, i.priority_level,
            i.source, i.created_at, i.due_at, o.name AS client
       FROM incidents i LEFT JOIN organizations o ON o.id = i.organization_id
      ORDER BY i.created_at DESC LIMIT 5000`
  )).rows;

  const invoices = (await pool.query(
    `SELECT inv.id, inv.period_start, inv.period_end, inv.amount, inv.paid_amount,
            inv.status, o.name AS client
       FROM subscription_invoices inv JOIN organizations o ON o.id = inv.organization_id
      ORDER BY inv.period_start DESC LIMIT 5000`
  )).rows;

  return NextResponse.json({ generated_at: new Date().toISOString(), requests, invoices });
}
