// Vendor-gap — заказ клиента с порядком отгрузки (из демо: без/при/до установки).
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db';
import { getUserFromRequest } from '@/lib/auth';

const ItemSchema = z.object({
  name: z.string(), is_service: z.boolean().default(false),
  quantity: z.number().positive().default(1), price: z.number().nonnegative().default(0),
  object_id: z.string().uuid().optional(),
});
const OrderSchema = z.object({
  organization_id: z.string().uuid(),
  shipment_order: z.enum(['no_install', 'on_install', 'before_install']).default('on_install'),
  seller_org: z.string().optional(),
  items: z.array(ItemSchema).default([]),
});

export async function GET(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const rows = (await pool.query(
    `SELECT s.*, o.name AS client FROM sales_orders s JOIN organizations o ON o.id=s.organization_id
      ORDER BY s.created_at DESC LIMIT 200`
  )).rows;
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const user = await getUserFromRequest(req);
  if (!user || !['admin', 'manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const parsed = OrderSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const d = parsed.data;
  const total = d.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const dbc = await pool.connect();
  try {
    await dbc.query('BEGIN');
    const num = 'SO-' + (await dbc.query(`SELECT nextval('sales_order_seq') n`)).rows[0].n;
    const so = await dbc.query(
      `INSERT INTO sales_orders (number, organization_id, seller_org, shipment_order, manager_id, total_amount)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [num, d.organization_id, d.seller_org ?? null, d.shipment_order, user.id, total]
    );
    for (const it of d.items) {
      await dbc.query(`INSERT INTO sales_order_items (order_id,name,is_service,quantity,price,object_id) VALUES ($1,$2,$3,$4,$5,$6)`,
        [so.rows[0].id, it.name, it.is_service, it.quantity, it.price, it.object_id ?? null]);
    }
    // для no_install реализация сразу; для on_install — после Акта ТО; before_install — счёт авансом
    if (d.shipment_order === 'no_install') {
      await dbc.query(`INSERT INTO sales_invoices (order_id,kind,amount) VALUES ($1,'realization',$2)`, [so.rows[0].id, total]);
      await dbc.query(`UPDATE sales_orders SET status='realized' WHERE id=$1`, [so.rows[0].id]);
    }
    await dbc.query('COMMIT');
    return NextResponse.json({ data: { id: so.rows[0].id, number: num, shipment_order: d.shipment_order, total } }, { status: 201 });
  } catch (e) {
    await dbc.query('ROLLBACK'); throw e;
  } finally { dbc.release(); }
}
