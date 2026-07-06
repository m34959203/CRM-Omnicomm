import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";

type Row = {
  id: string;
  name: string;
  type: "physical" | "technician" | "contractor" | "testing" | "supplier" | "virtual";
  is_active: boolean;
  holder_name: string | null;
  supplier_name: string | null;
};

const TYPE_RU: Record<Row["type"], string> = {
  physical: "обычный",
  technician: "исполнителя (техник)",
  contractor: "исполнителя (подрядчик)",
  testing: "виртуальный: тестирование",
  supplier: "виртуальный: поставщик",
  virtual: "виртуальный",
};

export default async function WarehousesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const { q = "" } = await searchParams;

  const rows = await query<Row>(
    `SELECT w.id, w.name, w.type, w.is_active,
            u.full_name AS holder_name, s.name AS supplier_name
     FROM warehouses w
     LEFT JOIN users u ON u.id = w.holder_id
     LEFT JOIN suppliers s ON s.id = w.supplier_id
     WHERE ($1 = '' OR w.name ILIKE '%' || $1 || '%')
     ORDER BY w.name
     LIMIT 500`,
    [q.trim()]
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{d.warehouses.title}</h1>
        <div className="flex items-center gap-2">
          <a
            href="/api/warehouses/export"
            className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
          >
            {d.common.exportExcel}
          </a>
          <Link
            href="/warehouses/new"
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
          placeholder={`${d.common.search}: ${d.warehouses.name}`}
          className="w-full max-w-md rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </form>

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{d.warehouses.name}</th>
              <th className="px-4 py-3 font-medium">{d.warehouses.type}</th>
              <th className="px-4 py-3 font-medium">{d.warehouses.holder}</th>
              <th className="px-4 py-3 font-medium">{d.warehouses.supplier}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-line last:border-0 transition hover:bg-accent-soft/40"
              >
                <td className="px-4 py-2.5 font-medium">
                  {r.name}
                  {!r.is_active && (
                    <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim">
                      архив
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      r.type === "physical"
                        ? "rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink"
                        : "rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim"
                    }
                  >
                    {TYPE_RU[r.type]}
                  </span>
                </td>
                <td className="px-4 py-2.5">{r.holder_name ?? "—"}</td>
                <td className="px-4 py-2.5">{r.supplier_name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-dim">{rows.length} записей (max 500)</p>
    </div>
  );
}
