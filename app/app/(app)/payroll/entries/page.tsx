import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { PAYROLL_READ_ROLES, PAYROLL_WRITE_ROLES } from "@/lib/payroll/common";
import { PayrollTabs } from "../tabs";
import { entryKindBadge, fmtMoney, fmtDate } from "../badges";
import { EntryForm } from "./entries-client";

type Row = {
  id: string;
  entry_date: string;
  performer: string;
  kind: string;
  work_type: string | null;
  reason: string | null;
  amount: string;
  sheet_id: string | null;
};

export default async function PayrollEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{
    user_id?: string;
    kind?: string;
    date_from?: string;
    date_to?: string;
    unsheeted?: string;
  }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!PAYROLL_READ_ROLES.includes(user.role)) redirect("/dashboard");
  const d = t(user.locale);
  const p = d.payroll;
  const canEdit = PAYROLL_WRITE_ROLES.includes(user.role);
  const sp = await searchParams;
  const userId = sp.user_id ?? "";
  const kind = sp.kind ?? "";
  const dateFrom = sp.date_from ?? "";
  const dateTo = sp.date_to ?? "";
  const unsheeted = sp.unsheeted === "1";

  const [rows, performers] = await Promise.all([
    query<Row>(
      `SELECT e.id, e.entry_date::text, u.full_name AS performer, e.kind,
              wt.name AS work_type, e.reason, e.amount::text, l.sheet_id
       FROM payroll_entries e
       JOIN users u ON u.id = e.user_id
       LEFT JOIN act_works aw ON aw.id = e.act_work_id
       LEFT JOIN work_types wt ON wt.id = aw.work_type_id
       LEFT JOIN payroll_sheet_lines l ON l.id = e.sheet_line_id
       WHERE ($1 = '' OR e.user_id = $1::uuid)
         AND ($2 = '' OR e.kind = $2)
         AND ($3 = '' OR e.entry_date >= $3::date)
         AND ($4 = '' OR e.entry_date <= $4::date)
         AND (NOT $5::boolean OR e.sheet_line_id IS NULL)
       ORDER BY e.entry_date DESC, e.created_at DESC
       LIMIT 500`,
      [userId, kind, dateFrom, dateTo, unsheeted]
    ),
    query<{ id: string; name: string }>(
      `SELECT DISTINCT u.id, u.full_name AS name
       FROM users u
       WHERE u.is_active OR EXISTS (SELECT 1 FROM payroll_entries pe WHERE pe.user_id = u.id)
       ORDER BY name`
    ),
  ]);

  const exportQs = new URLSearchParams(
    Object.entries({
      user_id: userId,
      kind,
      date_from: dateFrom,
      date_to: dateTo,
      unsheeted: unsheeted ? "1" : "",
    }).filter(([, v]) => v)
  ).toString();

  const sel =
    "rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none transition focus:border-accent";

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{p.title}</h1>
        <a
          href={`/api/payroll/entries/export${exportQs ? `?${exportQs}` : ""}`}
          className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent"
        >
          {d.common.exportExcel}
        </a>
      </div>
      <PayrollTabs d={d} active="entries" />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <select name="user_id" defaultValue={userId} className={sel}>
            <option value="">{p.allPerformers}</option>
            {performers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <select name="kind" defaultValue={kind} className={sel}>
            <option value="">{p.allKinds}</option>
            {Object.entries(p.kinds).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm text-ink-dim">
            {p.dateFrom}
            <input name="date_from" type="date" defaultValue={dateFrom} className={sel} />
          </label>
          <label className="flex items-center gap-1 text-sm text-ink-dim">
            {p.dateTo}
            <input name="date_to" type="date" defaultValue={dateTo} className={sel} />
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <input name="unsheeted" type="checkbox" value="1" defaultChecked={unsheeted} className="h-4 w-4" />
            {p.notInSheet}
          </label>
          <button className="rounded-md border border-line bg-card px-3 py-1.5 text-sm transition hover:border-accent">
            {p.apply}
          </button>
        </form>
        {canEdit && (
          <EntryForm
            users={performers}
            labels={{
              add: p.addEntry,
              performer: p.performer,
              kind: p.kind,
              compensation: p.kinds.compensation,
              deduction: p.kinds.deduction,
              amount: p.amount,
              reason: p.reason,
              date: p.date,
              save: d.common.save,
            }}
          />
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{p.date}</th>
              <th className="px-4 py-3 font-medium">{p.performer}</th>
              <th className="px-4 py-3 font-medium">{p.kind}</th>
              <th className="px-4 py-3 font-medium">{p.workType}</th>
              <th className="px-4 py-3 font-medium">{p.reason}</th>
              <th className="px-4 py-3 text-right font-medium">{p.amount}</th>
              <th className="px-4 py-3 font-medium">{p.inSheet}</th>
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
              <tr key={r.id} className="border-b border-line last:border-0 transition hover:bg-accent-soft/40">
                <td className="px-4 py-2.5 text-[13px]">{fmtDate(r.entry_date)}</td>
                <td className="px-4 py-2.5">{r.performer}</td>
                <td className="px-4 py-2.5">{entryKindBadge(r.kind, p)}</td>
                <td className="px-4 py-2.5">{r.work_type ?? "—"}</td>
                <td className="px-4 py-2.5">{r.reason ?? "—"}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[13px]">{fmtMoney(r.amount)}</td>
                <td className="px-4 py-2.5">
                  {r.sheet_id ? (
                    <Link href={`/payroll/sheets/${r.sheet_id}`} className="text-accent-ink hover:underline">
                      {p.yes}
                    </Link>
                  ) : (
                    <span className="text-ink-dim">{p.no}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
