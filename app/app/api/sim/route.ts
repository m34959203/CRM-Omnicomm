import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

const READ_ROLES = ["admin", "manager", "support", "head", "accounting", "boss"] as const;
const WRITE_ROLES = ["admin", "manager", "head"] as const;

export async function GET(req: Request) {
  try {
    await requireRole([...READ_ROLES]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const rows = await query(
    `SELECT s.id, s.icc, s.msisdn, s.location_type, s.status,
            op.name AS operator_name, p.name AS plan_name,
            w.name AS warehouse_name, u.full_name AS holder_name,
            e.serial_number AS equipment_serial
     FROM sim_cards s
     LEFT JOIN sim_operators op ON op.id = s.operator_id
     LEFT JOIN sim_operator_plans p ON p.id = s.plan_id
     LEFT JOIN warehouses w ON w.id = s.warehouse_id
     LEFT JOIN users u ON u.id = s.holder_id
     LEFT JOIN equipment_items e ON e.id = s.equipment_id
     WHERE ($1 = '' OR s.icc ILIKE '%' || $1 || '%' OR s.msisdn ILIKE '%' || $1 || '%')
     ORDER BY s.created_at DESC
     LIMIT 500`,
    [q]
  );
  return Response.json(rows);
}

/** Создание = оприходование SIM на склад: карта + движение в одной транзакции. */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole([...WRITE_ROLES])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.icc?.trim()) {
    return Response.json({ error: "icc required" }, { status: 400 });
  }
  if (!b.warehouse_id) {
    return Response.json({ error: "warehouse_id required" }, { status: 400 });
  }

  try {
    const id = await tx(async (q) => {
      const [sim] = await q<{ id: string }>(
        `INSERT INTO sim_cards (icc, msisdn, operator_id, plan_id, location_type, warehouse_id, status)
         VALUES ($1, $2, $3::uuid, $4::uuid, 'warehouse', $5::uuid, 'in_stock')
         RETURNING id`,
        [b.icc.trim(), b.msisdn?.trim() || null, b.operator_id || null,
         b.plan_id || null, b.warehouse_id]
      );
      await q(
        `INSERT INTO sim_movements (sim_id, to_type, warehouse_id, source_type, performed_by)
         VALUES ($1::uuid, 'warehouse', $2::uuid, 'manual', $3::uuid)`,
        [sim.id, b.warehouse_id, userId]
      );
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, 'create', 'sim_card', $2)`,
        [userId, sim.id]
      );
      return sim.id;
    });
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server";
    const status = msg.includes("duplicate key") ? 409 : 500;
    return Response.json({ error: status === 409 ? "ICCID уже существует" : "server" }, { status });
  }
}
