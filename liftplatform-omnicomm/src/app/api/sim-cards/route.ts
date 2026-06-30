// Vendor-gap — SIM-карты: оприходование (в т.ч. пакетный импорт), остатки.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

const SimSchema = z.object({
  serial_number: z.string(), msisdn: z.string().optional(),
  operator: z.string().optional(), tariff_plan: z.string().optional(),
});
const Body = z.object({ cards: z.array(SimSchema).min(1) });

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const balance = (await pool.query(
    `SELECT location_type, status, COUNT(*)::int n FROM sim_cards GROUP BY location_type, status ORDER BY location_type`
  )).rows;
  const list = (await pool.query(`SELECT * FROM sim_cards ORDER BY created_at DESC LIMIT 500`)).rows;
  return NextResponse.json({ data: { balance, list } });
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user || !['admin', 'support', 'manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  let inserted = 0;
  for (const c of parsed.data.cards) {
    await pool.query(
      `INSERT INTO sim_cards (serial_number, msisdn, operator, tariff_plan) VALUES ($1,$2,$3,$4)
       ON CONFLICT (serial_number) DO NOTHING`,
      [c.serial_number, c.msisdn ?? null, c.operator ?? null, c.tariff_plan ?? null]
    );
    inserted++;
  }
  return NextResponse.json({ data: { received: inserted } }, { status: 201 });
}
