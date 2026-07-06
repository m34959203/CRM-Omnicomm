/**
 * Отчёты «с днями» (этап 7): где оборудование задержалось и насколько.
 *  - тестирование: открытые testing_orders + единицы, дней с started_at;
 *  - принято от клиентов: открытые ремонтные документы receive_from_client;
 *  - у поставщика: status=at_supplier, дней с последнего движения.
 */

type Q = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

export type TestingDaysRow = {
  number: string | null;
  client_name: string;
  object_name: string | null;
  nomenclature: string;
  serial_number: string | null;
  started_at: string | null;
  days: number;
};

export async function testingDays(q: Q): Promise<TestingDaysRow[]> {
  const rows = await q<Omit<TestingDaysRow, "days"> & { days: string }>(`
    SELECT t.number, c.name AS client_name, o.name AS object_name,
           n.name AS nomenclature, e.serial_number,
           COALESCE(t.started_at, t.created_at)::text AS started_at,
           GREATEST(0, floor(extract(epoch FROM now() - COALESCE(t.started_at, t.created_at)) / 86400))::int AS days
    FROM testing_orders t
    JOIN clients c ON c.id = t.client_id
    LEFT JOIN monitoring_objects o ON o.id = t.object_id
    JOIN testing_order_items i ON i.testing_order_id = t.id
    JOIN equipment_items e ON e.id = i.equipment_id
    JOIN nomenclature n ON n.id = e.nomenclature_id
    WHERE t.status = 'open'
    ORDER BY days DESC, t.number`);
  return rows.map((r) => ({ ...r, days: Number(r.days) }));
}

export type FromClientDaysRow = {
  number: string | null;
  client_name: string | null;
  nomenclature: string;
  serial_number: string | null;
  defect_note: string | null;
  received_at: string;
  days: number;
};

export async function fromClientDays(q: Q): Promise<FromClientDaysRow[]> {
  const rows = await q<Omit<FromClientDaysRow, "days"> & { days: string }>(`
    SELECT d.number, c.name AS client_name, n.name AS nomenclature, e.serial_number,
           i.defect_note, d.created_at::text AS received_at,
           GREATEST(0, floor(extract(epoch FROM now() - d.created_at) / 86400))::int AS days
    FROM equipment_repair_docs d
    LEFT JOIN clients c ON c.id = d.client_id
    JOIN equipment_repair_doc_items i ON i.doc_id = d.id
    JOIN equipment_items e ON e.id = i.equipment_id
    JOIN nomenclature n ON n.id = e.nomenclature_id
    WHERE d.doc_type = 'receive_from_client' AND d.status IN ('draft','open')
    ORDER BY days DESC, d.number`);
  return rows.map((r) => ({ ...r, days: Number(r.days) }));
}

export type AtSupplierDaysRow = {
  nomenclature: string;
  serial_number: string | null;
  supplier_name: string | null;
  since: string;
  days: number;
};

export async function atSupplierDays(q: Q): Promise<AtSupplierDaysRow[]> {
  const rows = await q<Omit<AtSupplierDaysRow, "days"> & { days: string }>(`
    SELECT n.name AS nomenclature, e.serial_number, s.name AS supplier_name,
           COALESCE(m.last_move, e.created_at)::text AS since,
           GREATEST(0, floor(extract(epoch FROM now() - COALESCE(m.last_move, e.created_at)) / 86400))::int AS days
    FROM equipment_items e
    JOIN nomenclature n ON n.id = e.nomenclature_id
    LEFT JOIN suppliers s ON s.id = e.supplier_id
    LEFT JOIN LATERAL (
      SELECT max(created_at) AS last_move FROM equipment_movements WHERE equipment_id = e.id
    ) m ON true
    WHERE e.status = 'at_supplier'
    ORDER BY days DESC, n.name`);
  return rows.map((r) => ({ ...r, days: Number(r.days) }));
}
