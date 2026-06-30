// Преимущество над вендором — авто-блокировка по задолженности (у вендора только вручную).
// Находит клиентов с просрочкой выше порога и деактивирует их оборудование + мониторинг.
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

async function authorized(req: NextRequest) {
  if (req.headers.get('x-cron-secret') === process.env.CRON_SECRET) return true;
  const user = await getUserFromRequest(req);
  return !!user && ['admin', 'accounting'].includes(user.role);
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { threshold = 0, dry_run = true } = await req.json().catch(() => ({}));

  const debtors = (await pool.query(
    `SELECT organization_id, SUM(amount - paid_amount) AS debt
       FROM subscription_invoices WHERE status='overdue'
      GROUP BY organization_id HAVING SUM(amount - paid_amount) > $1`, [threshold]
  )).rows;

  let blocked = 0;
  if (!dry_run) {
    for (const d of debtors) {
      const r = await pool.query(
        `UPDATE equipment SET status='disabled', updated_at=NOW()
          WHERE organization_id=$1 AND status='active'`, [d.organization_id]
      );
      blocked += r.rowCount ?? 0;
      // здесь же — вызов коннектора мониторинга для деактивации объектов
    }
  }
  return NextResponse.json({ data: { debtors: debtors.length, equipment_blocked: blocked, dry_run } });
}
