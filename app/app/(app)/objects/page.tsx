import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";

type Row = {
  id: string;
  name: string;
  kind: "vehicle" | "stationary" | "other";
  brand: string | null;
  model: string | null;
  reg_number: string | null;
  vin: string | null;
  status: "active" | "archived";
  client_name: string;
};

const KIND_RU: Record<Row["kind"], string> = {
  vehicle: "ТС",
  stationary: "стационарный",
  other: "прочее",
};

export default async function ObjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const { q = "" } = await searchParams;

  const rows = await query<Row>(
    `SELECT o.id, o.name, o.kind, o.brand, o.model, o.reg_number, o.vin, o.status,
            c.name AS client_name
     FROM monitoring_objects o
     JOIN clients c ON c.id = o.client_id
     WHERE ($1 = '' OR o.name ILIKE '%' || $1 || '%' OR o.reg_number ILIKE '%' || $1 || '%')
     ORDER BY o.name
     LIMIT 500`,
    [q.trim()]
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{d.objects.title}</h1>
        <div className="flex items-center gap-2">
          <a
            href="/api/objects/export"
            className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
          >
            {d.common.exportExcel}
          </a>
          <Link
            href="/objects/new"
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
          placeholder={`${d.common.search}: ${d.objects.name} / ${d.objects.regNumber}`}
          className="w-full max-w-md rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </form>

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{d.objects.name}</th>
              <th className="px-4 py-3 font-medium">{d.objects.client}</th>
              <th className="px-4 py-3 font-medium">{d.objects.brandModel}</th>
              <th className="px-4 py-3 font-medium">{d.objects.regNumber}</th>
              <th className="px-4 py-3 font-medium">{d.objects.vin}</th>
              <th className="px-4 py-3 font-medium">{d.objects.kind}</th>
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
                <td className="px-4 py-2.5 font-medium">
                  {r.name}
                  {r.status === "archived" && (
                    <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim">
                      архив
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">{r.client_name}</td>
                <td className="px-4 py-2.5">
                  {[r.brand, r.model].filter(Boolean).join(" ") || "—"}
                </td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{r.reg_number ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{r.vin ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      r.kind === "vehicle"
                        ? "rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink"
                        : "rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim"
                    }
                  >
                    {KIND_RU[r.kind]}
                  </span>
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
