import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { PAYROLL_READ_ROLES, PAYROLL_WRITE_ROLES } from "@/lib/payroll/common";
import { PayrollTabs } from "../tabs";
import { sheetStatusBadge, fmtMoney, fmtDate } from "../badges";
import { BuildSheetForm } from "./sheets-client";

type Row = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  lines_count: string;
  total: string | null;
  created_by_name: string | null;
  created_at: string;
};

export default async function PayrollSheetsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!PAYROLL_READ_ROLES.includes(user.role)) redirect("/dashboard");
  const d = t(user.locale);
  const p = d.payroll;
  const canEdit = PAYROLL_WRITE_ROLES.includes(user.role);

  const rows = await query<Row>(
    `SELECT s.id, s.period_start::text, s.period_end::text, s.status,
            count(l.id)::text AS lines_count, sum(l.total)::text AS total,
            u.full_name AS created_by_name, s.created_at::text
     FROM payroll_sheets s
     LEFT JOIN payroll_sheet_lines l ON l.sheet_id = s.id
     LEFT JOIN users u ON u.id = s.created_by
     GROUP BY s.id, u.full_name
     ORDER BY s.period_start DESC, s.created_at DESC
     LIMIT 200`
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold">{p.title}</h1>
      <PayrollTabs d={d} active="sheets" />

      {canEdit && (
        <div className="mt-4">
          <BuildSheetForm
            labels={{
              build: p.buildSheet,
              month: p.month,
              preset: p.preset,
              firstHalf: p.presetFirstHalf,
              secondHalf: p.presetSecondHalf,
              fullMonth: p.presetFullMonth,
            }}
          />
        </div>
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{p.period}</th>
              <th className="px-4 py-3 font-medium">{p.status}</th>
              <th className="px-4 py-3 text-right font-medium">{p.linesCount}</th>
              <th className="px-4 py-3 text-right font-medium">{p.total}</th>
              <th className="px-4 py-3 font-medium">{p.createdBy}</th>
              <th className="px-4 py-3 font-medium">{p.createdAt}</th>
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
              <tr key={r.id} className="border-b border-line last:border-0 transition hover:bg-accent-soft/40">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/payroll/sheets/${r.id}`}
                    className="font-medium text-accent-ink hover:underline"
                  >
                    {fmtDate(r.period_start)} — {fmtDate(r.period_end)}
                  </Link>
                </td>
                <td className="px-4 py-2.5">{sheetStatusBadge(r.status, p)}</td>
                <td className="px-4 py-2.5 text-right">{r.lines_count}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[13px]">{fmtMoney(r.total)}</td>
                <td className="px-4 py-2.5">{r.created_by_name ?? "—"}</td>
                <td className="px-4 py-2.5 text-[13px]">
                  {new Date(r.created_at).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
