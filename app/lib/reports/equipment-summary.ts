/**
 * Сводный отчёт по оборудованию во всех размещениях (боль №10 со встречи —
 * у Аскан только платной доработкой). Одна картина: склады, техники, клиенты,
 * поставщики, тестирование, списано; расшифровка до единицы с днями в размещении.
 */

type Q = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

export type SummaryRow = {
  group_key: string;
  group_name: string;
  bucket: "warehouse" | "technician" | "client" | "supplier" | "testing" | "written_off";
  new_count: number;
  used_count: number;
  total: number;
};

export async function equipmentSummary(q: Q): Promise<SummaryRow[]> {
  const rows = await q<{
    bucket: string; group_key: string; group_name: string; new_count: string; used_count: string; total: string;
  }>(`
    WITH buckets AS (
      SELECT e.id, e.condition,
        CASE
          WHEN e.status = 'written_off'    THEN 'written_off'
          WHEN e.status = 'on_testing'     THEN 'testing'
          WHEN e.status = 'at_supplier'    THEN 'supplier'
          WHEN e.status = 'installed'      THEN 'client'
          WHEN e.status = 'with_technician' THEN 'technician'
          ELSE 'warehouse'
        END AS bucket,
        CASE
          WHEN e.status = 'written_off'    THEN 'Списано'
          WHEN e.status = 'on_testing'     THEN COALESCE(w.name, 'Тестирование')
          WHEN e.status = 'at_supplier'    THEN COALESCE(s.name, 'Поставщик')
          WHEN e.status = 'installed'      THEN COALESCE(c.name, '—')
          WHEN e.status = 'with_technician' THEN COALESCE(u.full_name, '—')
          ELSE COALESCE(w.name, 'Без склада')
        END AS group_name,
        CASE
          WHEN e.status = 'written_off'    THEN 'written_off'
          WHEN e.status = 'installed'      THEN COALESCE(e.client_id::text, 'none')
          WHEN e.status = 'with_technician' THEN COALESCE(e.holder_id::text, 'none')
          WHEN e.status = 'at_supplier'    THEN COALESCE(e.supplier_id::text, 'none')
          ELSE COALESCE(e.warehouse_id::text, 'none')
        END AS group_key
      FROM equipment_items e
      LEFT JOIN warehouses w ON w.id = e.warehouse_id
      LEFT JOIN users u      ON u.id = e.holder_id
      LEFT JOIN clients c    ON c.id = e.client_id
      LEFT JOIN suppliers s  ON s.id = e.supplier_id
    )
    SELECT bucket, group_key, group_name,
           count(*) FILTER (WHERE condition = 'new')  AS new_count,
           count(*) FILTER (WHERE condition = 'used') AS used_count,
           count(*) AS total
    FROM buckets
    GROUP BY bucket, group_key, group_name
    ORDER BY CASE bucket
      WHEN 'warehouse' THEN 1 WHEN 'technician' THEN 2 WHEN 'client' THEN 3
      WHEN 'testing' THEN 4 WHEN 'supplier' THEN 5 ELSE 6 END, group_name
  `);
  return rows.map((r) => ({
    bucket: r.bucket as SummaryRow["bucket"],
    group_key: r.group_key,
    group_name: r.group_name,
    new_count: Number(r.new_count),
    used_count: Number(r.used_count),
    total: Number(r.total),
  }));
}

/** Расшифровка размещения до единицы: серийник, номенклатура, дней в текущем размещении. */
export async function equipmentSummaryDetails(
  q: Q,
  bucket: string,
  groupKey: string
): Promise<Record<string, unknown>[]> {
  return q(
    `
    SELECT e.id, n.name AS nomenclature, e.serial_number, e.imei, e.condition, e.status,
           e.billing_state,
           GREATEST(0, floor(extract(epoch FROM now() - COALESCE(m.last_move, e.created_at)) / 86400))::int AS days_here
    FROM equipment_items e
    JOIN nomenclature n ON n.id = e.nomenclature_id
    LEFT JOIN LATERAL (
      SELECT max(created_at) AS last_move FROM equipment_movements WHERE equipment_id = e.id
    ) m ON true
    WHERE CASE
      WHEN $1 = 'written_off' THEN e.status = 'written_off'
      WHEN $1 = 'client'      THEN e.status = 'installed' AND e.client_id::text = $2
      WHEN $1 = 'technician'  THEN e.status = 'with_technician' AND e.holder_id::text = $2
      WHEN $1 = 'supplier'    THEN e.status = 'at_supplier' AND e.supplier_id::text = $2
      WHEN $1 = 'testing'     THEN e.status = 'on_testing' AND COALESCE(e.warehouse_id::text,'none') = $2
      ELSE e.status IN ('in_stock','reserved') AND COALESCE(e.warehouse_id::text,'none') = $2
    END
    ORDER BY n.name, e.serial_number`,
    [bucket, groupKey]
  );
}
