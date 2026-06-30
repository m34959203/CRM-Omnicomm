// Omnicomm/Blueprint — мотивация техников (раздел 6 Blueprint): сдельно по закрытым Актам + порог.
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user || !['admin', 'management', 'head', 'accounting'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const rule = (await pool.query(`SELECT * FROM payroll_rules WHERE is_active ORDER BY created_at LIMIT 1`)).rows[0]
    ?? { base_rate: 5000, threshold_count: 20, bonus_rate: 7000 };

  // закрытые Акты за текущий месяц по исполнителю
  const rows = (await pool.query(
    `SELECT a.performed_by AS user_id, u.full_name, COUNT(*)::int AS acts
       FROM maintenance_acts a JOIN users u ON u.id = a.performed_by
      WHERE a.status='done' AND date_trunc('month', a.created_at)=date_trunc('month', CURRENT_DATE)
      GROUP BY a.performed_by, u.full_name`
  )).rows;

  const report = rows.map((r) => {
    const thr = Number(rule.threshold_count);
    const base = Number(rule.base_rate), bonus = Number(rule.bonus_rate);
    const over = Math.max(0, r.acts - thr);
    const within = r.acts - over;
    const total = within * base + over * bonus;
    return { technician: r.full_name, acts: r.acts, threshold: thr, threshold_met: r.acts >= thr,
             base_amount: within * base, bonus_amount: over * bonus, total };
  });
  return NextResponse.json({ data: report });
}
