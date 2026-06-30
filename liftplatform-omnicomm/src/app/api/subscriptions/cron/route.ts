// Omnicomm gap — cron начисления абонплаты и пометки просрочки (раздел 16.1/16.3 ТЗ).
// Образец: /api/sla/check. Аутентификация: роль admin или заголовок X-Cron-Secret.
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

async function authorized(req: NextRequest) {
  if (req.headers.get('x-cron-secret') === process.env.CRON_SECRET) return true;
  const user = await getUserFromRequest(req);
  return !!user && user.role === 'admin';
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Шаг 1. начисление за текущий месяц для активных помесячных планов (идемпотентно)
  const accrued = await pool.query(
    `INSERT INTO subscription_invoices
       (plan_id, organization_id, period_start, period_end, amount, planned_issue_date, status)
     SELECT p.id, p.organization_id,
            date_trunc('month', CURRENT_DATE)::date,
            (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date,
            p.amount,
            date_trunc('month', CURRENT_DATE)::date,
            'to_accrue'
       FROM subscription_plans p
      WHERE p.is_active AND p.period = 'month'
        AND NOT EXISTS (
          SELECT 1 FROM subscription_invoices i
           WHERE i.plan_id = p.id AND i.period_start = date_trunc('month', CURRENT_DATE)::date)
     RETURNING id`
  );

  // Шаг 2. пометка просрочки: выставленные и неоплаченные после окончания периода
  const overdue = await pool.query(
    `UPDATE subscription_invoices
        SET status = 'overdue', updated_at = NOW()
      WHERE status IN ('issued','partial') AND paid_amount < amount AND period_end < CURRENT_DATE
      RETURNING id`
  );

  return NextResponse.json({ data: { accrued: accrued.rowCount, marked_overdue: overdue.rowCount } });
}
