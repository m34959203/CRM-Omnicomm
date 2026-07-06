import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import {
  PAYROLL_READ_ROLES,
  PAYROLL_WRITE_ROLES,
  PAYROLL_APPROVE_ROLES,
} from "@/lib/payroll/common";
import { sheetStatusBadge, fmtMoney, fmtDate } from "../../badges";
import { SheetActions } from "./sheet-actions";

type SheetRow = {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  created_by_name: string | null;
  created_at: string;
};
type LineRow = {
  id: string;
  performer: string;
  acts_count: number;
  work_amount: string;
  salary_amount: string;
  bonus_amount: string;
  compensation_amount: string;
  deduction_amount: string;
  total: string;
  threshold_met: boolean;
};

export default async function PayrollSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!PAYROLL_READ_ROLES.includes(user.role)) redirect("/dashboard");
  const d = t(user.locale);
  const p = d.payroll;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [[sheet], lines] = await Promise.all([
    query<SheetRow>(
      `SELECT s.id, s.period_start::text, s.period_end::text, s.status,
              u.full_name AS created_by_name, s.created_at::text
       FROM payroll_sheets s LEFT JOIN users u ON u.id = s.created_by
       WHERE s.id = $1::uuid`,
      [id]
    ),
    query<LineRow>(
      `SELECT l.id, u.full_name AS performer, l.acts_count, l.work_amount::text,
              l.salary_amount::text, l.bonus_amount::text, l.compensation_amount::text,
              l.deduction_amount::text, l.total::text, l.threshold_met
       FROM payroll_sheet_lines l JOIN users u ON u.id = l.user_id
       WHERE l.sheet_id = $1::uuid
       ORDER BY u.full_name`,
      [id]
    ),
  ]);
  if (!sheet) notFound();

  const sum = (key: keyof LineRow) =>
    lines.reduce((s, l) => s + Number(l[key] ?? 0), 0);

  const th = "px-4 py-3 font-medium";
  const thNum = "px-4 py-3 text-right font-medium";
  const tdNum = "px-4 py-2.5 text-right font-mono text-[13px]";

  return (
    <div>
      <Link href="/payroll/sheets" className="text-sm text-ink-dim hover:text-accent-ink">
        ← {p.sheetsTitle}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {p.sheetTitle}: {fmtDate(sheet.period_start)} — {fmtDate(sheet.period_end)}
        </h1>
        {sheetStatusBadge(sheet.status, p)}
      </div>
      <p className="mt-1 text-sm text-ink-dim">
        {p.createdBy}: {sheet.created_by_name ?? "—"} ·{" "}
        {new Date(sheet.created_at).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <a
          href={`/api/payroll/sheets/${sheet.id}/export`}
          className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent"
        >
          {d.common.exportExcel}
        </a>
        <SheetActions
          id={sheet.id}
          status={sheet.status}
          canApprove={PAYROLL_APPROVE_ROLES.includes(user.role)}
          canCancel={PAYROLL_WRITE_ROLES.includes(user.role)}
          labels={{
            approve: p.approve,
            markPaid: p.markPaid,
            cancel: p.cancelSheet,
            cancelConfirm: p.cancelConfirm,
          }}
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className={th}>{p.performer}</th>
              <th className={thNum}>{p.actsCount}</th>
              <th className={thNum}>{p.workAmount}</th>
              <th className={thNum}>{p.salaryAmount}</th>
              <th className={thNum}>{p.bonusAmount}</th>
              <th className={thNum}>{p.compensationAmount}</th>
              <th className={thNum}>{p.deductionAmount}</th>
              <th className={thNum}>{p.total}</th>
              <th className={th}>{p.thresholdMet}</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5">{l.performer}</td>
                <td className={tdNum}>{l.acts_count}</td>
                <td className={tdNum}>{fmtMoney(l.work_amount)}</td>
                <td className={tdNum}>{fmtMoney(l.salary_amount)}</td>
                <td className={tdNum}>{fmtMoney(l.bonus_amount)}</td>
                <td className={tdNum}>{fmtMoney(l.compensation_amount)}</td>
                <td className={tdNum}>{fmtMoney(l.deduction_amount)}</td>
                <td className={`${tdNum} font-semibold`}>{fmtMoney(l.total)}</td>
                <td className="px-4 py-2.5">
                  {l.threshold_met ? (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-800">
                      {p.yes}
                    </span>
                  ) : (
                    <span className="rounded bg-paper px-1.5 py-0.5 text-[11px] font-medium text-ink-dim">
                      {p.no}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {lines.length > 0 && (
            <tfoot>
              <tr className="border-t border-line bg-paper/50 font-semibold">
                <td className="px-4 py-2.5">{p.total}</td>
                <td className={tdNum}>{sum("acts_count")}</td>
                <td className={tdNum}>{fmtMoney(sum("work_amount"))}</td>
                <td className={tdNum}>{fmtMoney(sum("salary_amount"))}</td>
                <td className={tdNum}>{fmtMoney(sum("bonus_amount"))}</td>
                <td className={tdNum}>{fmtMoney(sum("compensation_amount"))}</td>
                <td className={tdNum}>{fmtMoney(sum("deduction_amount"))}</td>
                <td className={tdNum}>{fmtMoney(sum("total"))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
