import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { fmtDay, fmtMoney } from "../fmt";

/** Мой заработок: payroll_entries за текущий и прошлый месяц (work/compensation/deduction, итог). */

type Sum = { month: string; kind: string; total: string };
type Entry = {
  id: string;
  entry_date: string;
  kind: string;
  amount: string;
  reason: string | null;
  work_name: string | null;
};

export default async function MobilePayrollPage() {
  const user = await getSession();
  if (!user) redirect("/login?next=/m");
  const d = t(user.locale);
  const m = d.mobile;
  const p = m.payroll;

  const [sums, entries] = await Promise.all([
    query<Sum>(
      `SELECT to_char(date_trunc('month', e.entry_date), 'YYYY-MM') AS month,
              e.kind, sum(e.amount) AS total
       FROM payroll_entries e
       WHERE e.user_id = $1::uuid
         AND e.entry_date >= date_trunc('month', (now() AT TIME ZONE 'Asia/Almaty')::date)::date
                             - interval '1 month'
       GROUP BY 1, 2`,
      [user.userId]
    ),
    query<Entry>(
      `SELECT e.id, to_char(e.entry_date, 'YYYY-MM-DD') AS entry_date, e.kind, e.amount, e.reason,
              wt.name AS work_name
       FROM payroll_entries e
       LEFT JOIN act_works aw ON aw.id = e.act_work_id
       LEFT JOIN work_types wt ON wt.id = aw.work_type_id
       WHERE e.user_id = $1::uuid
         AND e.entry_date >= date_trunc('month', (now() AT TIME ZONE 'Asia/Almaty')::date)::date
                             - interval '1 month'
       ORDER BY e.entry_date DESC, e.created_at DESC
       LIMIT 100`,
      [user.userId]
    ),
  ]);

  const nowAlmaty = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" });
  const curMonth = nowAlmaty.slice(0, 7);
  const prevDate = new Date(`${curMonth}-01T12:00:00`);
  prevDate.setMonth(prevDate.getMonth() - 1);
  const prevMonth = prevDate.toISOString().slice(0, 7);

  function monthCard(month: string, label: string, highlight: boolean) {
    const get = (kind: string) =>
      Number(sums.find((s) => s.month === month && s.kind === kind)?.total ?? 0);
    const work = get("work");
    const comp = get("compensation");
    const ded = get("deduction");
    const total = work + comp - ded;
    return (
      <div
        className={`rounded-xl border px-4 py-3.5 ${
          highlight ? "border-accent/50 bg-accent/5" : "border-chrome-line bg-chrome-raised"
        }`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-white">{label}</span>
          <span className="font-mono text-[11px] uppercase tracking-wider text-chrome-dim">{month}</span>
        </div>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-chrome-dim">{p.work}</dt>
            <dd className="font-mono text-chrome-text">{fmtMoney(work)} ₸</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-chrome-dim">{p.compensation}</dt>
            <dd className="font-mono text-chrome-text">{fmtMoney(comp)} ₸</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-chrome-dim">{p.deduction}</dt>
            <dd className="font-mono text-red-300">−{fmtMoney(ded)} ₸</dd>
          </div>
        </dl>
        <div className="mt-3 flex items-baseline justify-between border-t border-chrome-line pt-2.5">
          <span className="text-xs uppercase tracking-wider text-chrome-dim">{p.total}</span>
          <span className={`font-mono text-lg font-semibold ${highlight ? "text-accent" : "text-white"}`}>
            {fmtMoney(total)} ₸
          </span>
        </div>
      </div>
    );
  }

  const kindLabel: Record<string, string> = {
    work: p.work,
    compensation: p.compensation,
    deduction: p.deduction,
  };

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">{p.title}</h1>
      <div className="mt-4 space-y-3">
        {monthCard(curMonth, p.currentMonth, true)}
        {monthCard(prevMonth, p.prevMonth, false)}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
          {p.entries}
        </span>
        <span className="h-px flex-1 bg-chrome-line" aria-hidden />
      </div>
      <div className="mt-3 space-y-2">
        {entries.length === 0 && (
          <p className="rounded-xl border border-dashed border-chrome-line px-4 py-8 text-center text-sm text-chrome-dim">
            {p.empty}
          </p>
        )}
        {entries.map((e) => (
          <div
            key={e.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-chrome-line bg-chrome-raised px-4 py-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-white">
                {e.work_name ?? e.reason ?? kindLabel[e.kind] ?? e.kind}
              </div>
              <div className="mt-0.5 font-mono text-xs text-chrome-dim">
                {fmtDay(e.entry_date)} · {kindLabel[e.kind] ?? e.kind}
              </div>
            </div>
            <span
              className={`shrink-0 font-mono text-sm font-semibold ${
                e.kind === "deduction" ? "text-red-300" : "text-emerald-300"
              }`}
            >
              {e.kind === "deduction" ? "−" : "+"}
              {fmtMoney(e.amount)} ₸
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
