import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";

type Row = {
  id: string;
  serial_number: string | null;
  imei: string | null;
  condition: "new" | "used";
  status: string;
  billing_state: "active" | "conservation" | "disabled" | null;
  nomenclature_name: string;
  location: string | null;
};

const STATUS_RU: Record<string, string> = {
  in_stock: "на складе",
  with_technician: "у техника",
  on_testing: "на тестировании",
  at_supplier: "у поставщика",
  installed: "установлено",
  reserved: "резерв",
  written_off: "списано",
};
const BILLING_RU: Record<string, string> = {
  active: "активно",
  conservation: "консервация",
  disabled: "отключено",
};

export default async function EquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const { q = "" } = await searchParams;

  const rows = await query<Row>(
    `SELECT e.id, e.serial_number, e.imei, e.condition, e.status, e.billing_state,
            n.name AS nomenclature_name,
            COALESCE(w.name, u.full_name, o.name, c.name) AS location
     FROM equipment_items e
     JOIN nomenclature n ON n.id = e.nomenclature_id
     LEFT JOIN warehouses w ON w.id = e.warehouse_id
     LEFT JOIN users u ON u.id = e.holder_id
     LEFT JOIN clients c ON c.id = e.client_id
     LEFT JOIN monitoring_objects o ON o.id = e.object_id
     WHERE ($1 = '' OR e.serial_number ILIKE '%' || $1 || '%'
            OR e.imei ILIKE '%' || $1 || '%' OR n.name ILIKE '%' || $1 || '%')
     ORDER BY e.created_at DESC
     LIMIT 500`,
    [q.trim()]
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{d.equipment.title}</h1>
        <div className="flex items-center gap-2">
          <a
            href="/api/equipment/export"
            className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
          >
            {d.common.exportExcel}
          </a>
          <Link
            href="/equipment/new"
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink"
          >
            {d.common.create}
          </Link>
        </div>
      </div>

      <form className="mt-5">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={`${d.common.search}: ${d.equipment.serial} / ${d.equipment.imei} / ${d.equipment.nomenclature}`}
          className="w-full max-w-md rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </form>

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{d.equipment.nomenclature}</th>
              <th className="px-4 py-3 font-medium">{d.equipment.serial}</th>
              <th className="px-4 py-3 font-medium">{d.equipment.imei}</th>
              <th className="px-4 py-3 font-medium">{d.equipment.condition}</th>
              <th className="px-4 py-3 font-medium">{d.equipment.status}</th>
              <th className="px-4 py-3 font-medium">{d.equipment.location}</th>
              <th className="px-4 py-3 font-medium">{d.equipment.billingState}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-line last:border-0 transition hover:bg-accent-soft/40"
              >
                <td className="px-4 py-2.5 font-medium">{r.nomenclature_name}</td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{r.serial_number ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{r.imei ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      r.condition === "new"
                        ? "rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink"
                        : "rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim"
                    }
                  >
                    {r.condition === "new" ? "новое" : "БУ"}
                  </span>
                </td>
                <td className="px-4 py-2.5">{STATUS_RU[r.status] ?? r.status}</td>
                <td className="px-4 py-2.5">{r.location ?? "—"}</td>
                <td className="px-4 py-2.5">
                  {r.billing_state ? (
                    <span
                      className={
                        r.billing_state === "active"
                          ? "rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink"
                          : "rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim"
                      }
                    >
                      {BILLING_RU[r.billing_state]}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-dim">{rows.length} записей (max 500)</p>
    </div>
  );
}
