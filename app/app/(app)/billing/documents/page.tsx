import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { money } from "@/lib/billing/amount-words";
import { currentAlmatyPeriod } from "@/lib/billing/dates";
import { BillingTabs } from "../tabs";
import { kindBadge, statusBadge, type DocKind } from "../badges";

type Row = {
  id: string;
  number: string | null;
  kind: DocKind;
  status: string;
  period_start: string | null;
  period_end: string | null;
  subtotal: string;
  total: string;
  paid_amount: string;
  client_name: string;
};

export default async function BillingDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; kind?: string; status?: string; q?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const b = d.billing;
  const { period = "", kind = "", status = "", q = "" } = await searchParams;

  const rows = await query<Row>(
    `SELECT d.id, d.number, d.kind, d.status,
            d.period_start::text, d.period_end::text,
            d.subtotal::text, d.total::text, d.paid_amount::text,
            c.name AS client_name
     FROM billing_documents d
     JOIN clients c ON c.id = d.client_id
     WHERE ($1 = '' OR to_char(d.period_start, 'YYYY-MM') = $1)
       AND ($2 = '' OR d.kind = $2)
       AND ($3 = '' OR d.status = $3)
       AND ($4 = '' OR c.name ILIKE '%' || $4 || '%' OR d.number ILIKE '%' || $4 || '%')
     ORDER BY d.created_at DESC
     LIMIT 500`,
    [period, kind, status, q.trim()]
  );

  const exportQs = new URLSearchParams(
    Object.entries({ period, kind, status }).filter(([, v]) => v)
  ).toString();

  const input =
    "rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent";

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{b.title}</h1>
        <div className="flex items-center gap-2">
          <a
            href={`/api/billing/export-1c?period=${period || currentAlmatyPeriod()}`}
            className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
          >
            {b.export1c}
          </a>
          <a
            href={`/api/billing/documents/export${exportQs ? `?${exportQs}` : ""}`}
            className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
          >
            {d.common.exportExcel}
          </a>
        </div>
      </div>
      <BillingTabs d={d} active="documents" />

      <form className="mt-5 flex flex-wrap gap-2">
        <input type="month" name="period" defaultValue={period} className={input} />
        <select name="kind" defaultValue={kind} className={input}>
          <option value="">{b.kind}: {b.all}</option>
          <option value="advance_invoice">{b.kindAdvanceInvoice}</option>
          <option value="act">{b.kindAct}</option>
          <option value="one_time_invoice">{b.kindOneTime}</option>
        </select>
        <select name="status" defaultValue={status} className={input}>
          <option value="">{b.status}: {b.all}</option>
          <option value="prepared">{b.statusPrepared}</option>
          <option value="issued">{b.statusIssued}</option>
          <option value="sent">{b.statusSent}</option>
          <option value="partial">{b.statusPartial}</option>
          <option value="paid">{b.statusPaid}</option>
          <option value="cancelled">{b.statusCancelled}</option>
        </select>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={`${d.common.search}: ${b.client} / ${b.docNumber}`}
          className={`${input} w-64`}
        />
        <button className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink">
          {d.common.search}
        </button>
      </form>

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{b.docNumber}</th>
              <th className="px-4 py-3 font-medium">{b.kind}</th>
              <th className="px-4 py-3 font-medium">{b.client}</th>
              <th className="px-4 py-3 font-medium">{b.periodCol}</th>
              <th className="px-4 py-3 font-medium">{b.subtotal}</th>
              <th className="px-4 py-3 font-medium">{b.total}</th>
              <th className="px-4 py-3 font-medium">{b.paid}</th>
              <th className="px-4 py-3 font-medium">{b.status}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-line last:border-0 transition hover:bg-accent-soft/40"
              >
                <td className="px-4 py-2.5 font-mono text-[13px]">
                  <Link href={`/billing/documents/${r.id}`} className="font-medium text-accent-ink hover:underline">
                    {r.number ?? r.id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-4 py-2.5">{kindBadge(r.kind, b)}</td>
                <td className="px-4 py-2.5 font-medium">{r.client_name}</td>
                <td className="px-4 py-2.5 whitespace-nowrap text-[13px]">
                  {r.period_start ? r.period_start.slice(0, 7) : "—"}
                </td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{money(Number(r.subtotal))} ₸</td>
                <td className="px-4 py-2.5 font-mono text-[13px] font-medium">{money(Number(r.total))} ₸</td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{money(Number(r.paid_amount))} ₸</td>
                <td className="px-4 py-2.5">{statusBadge(r.status, b)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-dim">{rows.length} (max 500)</p>
    </div>
  );
}
