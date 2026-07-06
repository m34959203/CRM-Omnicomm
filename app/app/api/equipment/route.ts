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
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const clientId = sp.get("client_id")?.trim() ?? "";
  const status = sp.get("status")?.trim() ?? "";
  const rows = await query(
    `SELECT e.id, e.serial_number, e.imei, e.condition, e.status, e.billing_state,
            n.name AS nomenclature_name,
            w.name AS warehouse_name, u.full_name AS holder_name,
            c.name AS client_name, o.name AS object_name
     FROM equipment_items e
     JOIN nomenclature n ON n.id = e.nomenclature_id
     LEFT JOIN warehouses w ON w.id = e.warehouse_id
     LEFT JOIN users u ON u.id = e.holder_id
     LEFT JOIN clients c ON c.id = e.client_id
     LEFT JOIN monitoring_objects o ON o.id = e.object_id
     WHERE ($1 = '' OR e.serial_number ILIKE '%' || $1 || '%'
            OR e.imei ILIKE '%' || $1 || '%' OR n.name ILIKE '%' || $1 || '%')
       AND ($2 = '' OR e.client_id = $2::uuid)
       AND ($3 = '' OR e.status = ANY(string_to_array($3, ',')))
     ORDER BY e.created_at DESC
     LIMIT 500`,
    [q, clientId, status]
  );
  return Response.json(rows);
}

/** Создание = оприходование на склад: единица + движение receipt в одной транзакции. */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole([...WRITE_ROLES])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.nomenclature_id) {
    return Response.json({ error: "nomenclature_id required" }, { status: 400 });
  }
  if (!b.warehouse_id) {
    return Response.json({ error: "warehouse_id required" }, { status: 400 });
  }
  if (b.condition && !["new", "used"].includes(b.condition)) {
    return Response.json({ error: "bad condition" }, { status: 400 });
  }

  try {
    const id = await tx(async (q) => {
      const [nom] = await q<{ kind: string }>(
        `SELECT kind FROM nomenclature WHERE id = $1::uuid`,
        [b.nomenclature_id]
      );
      if (!nom || nom.kind !== "equipment") {
        throw new Error("nomenclature must be kind=equipment");
      }
      const [item] = await q<{ id: string }>(
        `INSERT INTO equipment_items
           (nomenclature_id, serial_number, imei, condition, status, warehouse_id, supplier_id, purchase_price, note)
         VALUES ($1::uuid, $2, $3, COALESCE($4, 'new'), 'in_stock', $5::uuid, $6::uuid, $7, $8)
         RETURNING id`,
        [b.nomenclature_id, b.serial_number?.trim() || null, b.imei?.trim() || null,
         b.condition || null, b.warehouse_id, b.supplier_id || null,
         b.purchase_price || null, b.note || null]
      );
      await q(
        `INSERT INTO equipment_movements
           (equipment_id, to_warehouse_id, new_status, new_condition, reason, source_type, performed_by)
         VALUES ($1::uuid, $2::uuid, 'in_stock', COALESCE($3, 'new'), 'receipt', 'manual', $4::uuid)`,
        [item.id, b.warehouse_id, b.condition || null, userId]
      );
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, 'create', 'equipment_item', $2)`,
        [userId, item.id]
      );
      return item.id;
    });
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "server";
    const status = msg.includes("nomenclature") ? 400 : msg.includes("duplicate key") ? 409 : 500;
    return Response.json({ error: status === 500 ? "server" : msg }, { status });
  }
}
