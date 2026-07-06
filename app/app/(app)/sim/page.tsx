import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { SimImportButton } from "./import-button";

type Row = {
  id: string;
  icc: string;
  msisdn: string | null;
  location_type: "warehouse" | "employee" | "contractor" | "equipment";
  status: string;
  operator_name: string | null;
  plan_name: string | null;
  location: string | null;
};

const STATUS_RU: Record<string, string> = {
  in_stock: "на складе",
  assigned: "выдана",
  installed: "установлена",
  suspended: "приостановлена",
  written_off: "списана",
};

export default async function SimPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const { q = "" } = await searchParams;

  const rows = await query<Row>(
    `SELECT s.id, s.icc, s.msisdn, s.location_type, s.status,
            op.name AS operator_name, p.name AS plan_name,
            COALESCE(w.name, u.full_name, e.serial_number) AS location
     FROM sim_cards s
     LEFT JOIN sim_operators op ON op.id = s.operator_id
     LEFT JOIN sim_operator_plans p ON p.id = s.plan_id
     LEFT JOIN warehouses w ON w.id = s.warehouse_id
     LEFT JOIN users u ON u.id = s.holder_id
     LEFT JOIN equipment_items e ON e.id = s.equipment_id
     WHERE ($1 = '' OR s.icc ILIKE '%' || $1 || '%' OR s.msisdn ILIKE '%' || $1 || '%')
     ORDER BY s.created_at DESC
     LIMIT 500`,
    [q.trim()]
  );

  const operators = await query<{ id: string; name: string }>(
    `SELECT id, name FROM sim_operators WHERE is_active ORDER BY name`
  );
  const importWarehouses = await query<{ id: string; name: string }>(
    `SELECT id, name FROM warehouses WHERE is_active AND type = 'physical' ORDER BY name`
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{d.sim.title}</h1>
        <div className="flex items-center gap-2">
          <SimImportButton
            operators={operators}
            warehouses={importWarehouses}
            labels={{
              button: d.sim.importExcel,
              hint: d.sim.importHint,
              save: d.common.save,
              cancel: d.common.cancel,
            }}
          />
          <a
            href="/api/sim/export"
            className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
          >
            {d.common.exportExcel}
          </a>
          <Link
            href="/sim/new"
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
          placeholder={`${d.common.search}: ${d.sim.icc} / ${d.sim.msisdn}`}
          className="w-full max-w-md rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </form>

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{d.sim.icc}</th>
              <th className="px-4 py-3 font-medium">{d.sim.msisdn}</th>
              <th className="px-4 py-3 font-medium">{d.sim.operator}</th>
              <th className="px-4 py-3 font-medium">{d.sim.plan}</th>
              <th className="px-4 py-3 font-medium">{d.sim.status}</th>
              <th className="px-4 py-3 font-medium">{d.sim.location}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-line last:border-0 transition hover:bg-accent-soft/40"
              >
                <td className="px-4 py-2.5 font-mono text-[13px] font-medium">{r.icc}</td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{r.msisdn ?? "—"}</td>
                <td className="px-4 py-2.5">{r.operator_name ?? "—"}</td>
                <td className="px-4 py-2.5">{r.plan_name ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      r.status === "in_stock" || r.status === "installed"
                        ? "rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink"
                        : "rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim"
                    }
                  >
                    {STATUS_RU[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-2.5">{r.location ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-dim">{rows.length} записей (max 500)</p>
    </div>
  );
}
