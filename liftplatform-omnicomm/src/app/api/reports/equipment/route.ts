// Преимущество над вендором — ЕДИНЫЙ отчёт по оборудованию (у вендора такого нет).
// Сводит всё оборудование по местам и состояниям: склад, техники, клиенты, поставщики, демо, Б/У.
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user || !['admin', 'management', 'head', 'manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const byStatus = (await pool.query(`SELECT status, COUNT(*)::int n FROM equipment GROUP BY status`)).rows;
  const byLocation = (await pool.query(
    `SELECT CASE
        WHEN organization_id IS NOT NULL THEN 'у клиента'
        WHEN holder_id IS NOT NULL THEN 'у техника'
        WHEN status='demo' THEN 'на тестировании'
        ELSE 'на складе' END AS location,
        COUNT(*)::int n
       FROM equipment GROUP BY 1 ORDER BY n DESC`
  )).rows;
  const total = (await pool.query(`SELECT COUNT(*)::int n FROM equipment`)).rows[0].n;
  return NextResponse.json({ data: { total, by_status: byStatus, by_location: byLocation } });
}
