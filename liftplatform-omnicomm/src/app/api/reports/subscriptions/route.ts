// Omnicomm gap — отчёт по абонентской плате (раздел 16.4 ТЗ).
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user || !['admin', 'org_admin', 'manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const totals = (await pool.query(
    `SELECT
        COALESCE(SUM(amount),0)                                          AS accrued,
        COALESCE(SUM(amount) FILTER (WHERE status IN ('issued','paid','partial','overdue')),0) AS issued,
        COALESCE(SUM(paid_amount),0)                                     AS paid,
        COALESCE(SUM(amount - paid_amount) FILTER (WHERE status = 'overdue'),0) AS overdue,
        COUNT(DISTINCT organization_id) FILTER (WHERE status = 'overdue') AS clients_overdue
       FROM subscription_invoices`
  )).rows[0];
  const activeClients = (await pool.query(
    `SELECT COUNT(DISTINCT organization_id)::int n FROM subscription_plans WHERE is_active`
  )).rows[0].n;
  return NextResponse.json({ data: { ...totals, clients_active: activeClients } });
}
