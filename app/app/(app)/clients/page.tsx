import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";

type Row = {
  id: string;
  name: string;
  bin_iin: string | null;
  legal_form: string | null;
  phone: string | null;
  manager_name: string | null;
  billing_scheme: "advance" | "credit";
  is_active: boolean;
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const { q = "" } = await searchParams;

  const rows = await query<Row>(
    `SELECT c.id, c.name, c.phone, c.billing_scheme, c.is_active,
            u.full_name AS manager_name, cp.bin_iin, cp.legal_form
     FROM clients c
     LEFT JOIN users u ON u.id = c.manager_id
     LEFT JOIN LATERAL (
       SELECT bin_iin, legal_form FROM counterparties
       WHERE client_id = c.id ORDER BY created_at LIMIT 1
     ) cp ON true
     WHERE ($1 = '' OR c.name ILIKE '%' || $1 || '%' OR cp.bin_iin LIKE $1 || '%')
     ORDER BY c.name
     LIMIT 500`,
    [q.trim()]
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{d.clients.title}</h1>
        <div className="flex items-center gap-2">
          <a
            href="/api/clients/export"
            className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
          >
            {d.common.exportExcel}
          </a>
          <Link
            href="/clients/new"
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
          placeholder={`${d.common.search}: ${d.clients.name} / ${d.clients.binIin}`}
          className="w-full max-w-md rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
      </form>

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{d.clients.name}</th>
              <th className="px-4 py-3 font-medium">{d.clients.binIin}</th>
              <th className="px-4 py-3 font-medium">{d.clients.phone}</th>
              <th className="px-4 py-3 font-medium">{d.clients.manager}</th>
              <th className="px-4 py-3 font-medium">Схема</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-ink-dim">
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
                  <Link href={`/clients/${r.id}`} className="hover:text-accent-ink">
                    {r.name}
                  </Link>
                  {!r.is_active && (
                    <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim">
                      архив
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-[13px]">
                  {r.bin_iin ?? "—"}
                  {r.legal_form ? ` · ${r.legal_form}` : ""}
                </td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{r.phone ?? "—"}</td>
                <td className="px-4 py-2.5">{r.manager_name ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      r.billing_scheme === "advance"
                        ? "rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink"
                        : "rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim"
                    }
                  >
                    {r.billing_scheme === "advance" ? "аванс" : "кредит"}
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
