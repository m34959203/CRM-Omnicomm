// Omnicomm — обмен с 1С (раздел 23 ТЗ).
// GET  — выгрузка клиентов и счетов для синхронизации.
// POST — приём оплат из 1С (обновление статуса счёта). Защита секретом X-1C-Secret.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';

function authorized(req: NextRequest): boolean {
  return req.headers.get('x-1c-secret') === process.env.ONEC_SECRET;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const clients = (await pool.query(`SELECT id, name, bin_iin, phone, email FROM organizations ORDER BY name`)).rows;
  const invoices = (await pool.query(
    `SELECT id, organization_id, period_start, period_end, amount, paid_amount, status FROM subscription_invoices`
  )).rows;
  return NextResponse.json({ clients, invoices });
}

const PaymentSchema = z.object({
  invoice_id: z.string().uuid(),
  paid_amount: z.number().nonnegative(),
});

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const parsed = PaymentSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { invoice_id, paid_amount } = parsed.data;
  const inv = (await pool.query(`SELECT amount FROM subscription_invoices WHERE id = $1`, [invoice_id])).rows[0];
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const status = paid_amount >= Number(inv.amount) ? 'paid' : paid_amount > 0 ? 'partial' : 'issued';
  await pool.query(
    `UPDATE subscription_invoices SET paid_amount = $1, status = $2, updated_at = NOW() WHERE id = $3`,
    [paid_amount, status, invoice_id]
  );
  return NextResponse.json({ data: { invoice_id, status } });
}
