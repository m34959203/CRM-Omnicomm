// Omnicomm gap — абонентская плата: планы (раздел 16.1 ТЗ).
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

const PlanSchema = z.object({
  organization_id: z.string().uuid(),
  contract_id: z.string().uuid().optional(),
  amount: z.number().positive(),
  period: z.enum(['month', 'quarter', 'custom']).default('month'),
});

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = (await pool.query(
    `SELECT p.*, o.name AS client_name FROM subscription_plans p
       JOIN organizations o ON o.id = p.organization_id
      WHERE p.is_active ORDER BY o.name`
  )).rows;
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user || !['admin', 'org_admin', 'manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const parsed = PlanSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { organization_id, contract_id, amount, period } = parsed.data;
  const ins = await pool.query(
    `INSERT INTO subscription_plans (organization_id, contract_id, amount, period)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [organization_id, contract_id ?? null, amount, period]
  );
  return NextResponse.json({ data: { id: ins.rows[0].id } }, { status: 201 });
}
