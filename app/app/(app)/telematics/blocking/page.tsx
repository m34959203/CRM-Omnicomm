import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { TelematicsTabs } from "../tabs";
import { RuleForm, RuleRowActions, ManualBlockForm, AutoBlockButton } from "./blocking-client";

type RuleRow = {
  id: string;
  name: string;
  scope: "default" | "category" | "client";
  client_name: string | null;
  category_name: string | null;
  advance_grace_days: number;
  credit_grace_days: number;
  allowed_debt: string;
  warn_days_before: number;
  is_active: boolean;
};

type EventRow = {
  id: string;
  created_at: string;
  client_name: string;
  action: "warning" | "block" | "unblock" | "manual_unblock";
  debt_amount: string | null;
  unblock_until: string | null;
  performed_by_name: string | null;
  note: string | null;
};

const ACTION_BADGE: Record<EventRow["action"], string> = {
  warning: "bg-amber-100 text-amber-800",
  block: "bg-red-100 text-red-700",
  unblock: "bg-accent-soft text-accent-ink",
  manual_unblock: "bg-accent-soft text-accent-ink",
};

export default async function BlockingPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const canManage = ["admin", "manager", "head"].includes(user.role);

  const [rules, events, clients, categories] = await Promise.all([
    query<RuleRow>(
      `SELECT r.id, r.name, r.scope, r.advance_grace_days, r.credit_grace_days,
              r.allowed_debt, r.warn_days_before, r.is_active,
              c.name AS client_name, sc.name AS category_name
       FROM blocking_rules r
       LEFT JOIN clients c ON c.id = r.client_id
       LEFT JOIN service_categories sc ON sc.id = r.category_id
       ORDER BY r.scope, r.name`
    ),
    query<EventRow>(
      `SELECT e.id, e.created_at, c.name AS client_name, e.action,
              e.debt_amount, e.unblock_until, e.note, u.full_name AS performed_by_name
       FROM blocking_events e
       JOIN clients c ON c.id = e.client_id
       LEFT JOIN users u ON u.id = e.performed_by
       ORDER BY e.created_at DESC
       LIMIT 200`
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE is_active ORDER BY name LIMIT 500`
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM service_categories WHERE is_active ORDER BY name`
    ),
  ]);

  const dd = d.telematics;

  const canRunAuto = ["admin", "head"].includes(user.role);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{dd.title}</h1>
        {canRunAuto && (
          <AutoBlockButton labels={{ run: dd.runAutoBlock, done: dd.autoBlockDone }} />
        )}
      </div>
      <TelematicsTabs d={d} active="blocking" />

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section>
            <h2 className="text-lg font-semibold">{dd.rules}</h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                    <th className="px-4 py-3 font-medium">{d.clients.name}</th>
                    <th className="px-4 py-3 font-medium">{dd.scope}</th>
                    <th className="px-4 py-3 font-medium">{dd.advanceGraceDays}</th>
                    <th className="px-4 py-3 font-medium">{dd.creditGraceDays}</th>
                    <th className="px-4 py-3 font-medium">{dd.allowedDebt}</th>
                    <th className="px-4 py-3 font-medium">{dd.warnDaysBefore}</th>
                    {canManage && (
                      <th className="px-4 py-3 font-medium">{d.common.actions}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rules.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-ink-dim">
                        {d.common.empty}
                      </td>
                    </tr>
                  )}
                  {rules.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 font-medium">
                        {r.name}
                        {!r.is_active && (
                          <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim">
                            выкл
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {r.scope === "default"
                          ? dd.scopeDefault
                          : r.scope === "category"
                            ? `${dd.scopeCategory}: ${r.category_name ?? "—"}`
                            : `${dd.scopeClient}: ${r.client_name ?? "—"}`}
                      </td>
                      <td className="px-4 py-2.5">{r.advance_grace_days}</td>
                      <td className="px-4 py-2.5">{r.credit_grace_days}</td>
                      <td className="px-4 py-2.5 font-mono text-[13px]">
                        {Number(r.allowed_debt).toLocaleString("ru-RU")} ₸
                      </td>
                      <td className="px-4 py-2.5">{r.warn_days_before}</td>
                      {canManage && (
                        <td className="px-4 py-2.5">
                          <RuleRowActions
                            id={r.id}
                            isActive={r.is_active}
                            deleteLabel={d.common.delete}
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canManage && (
              <RuleForm
                clients={clients}
                categories={categories}
                labels={{
                  addRule: dd.addRule,
                  scope: dd.scope,
                  scopeDefault: dd.scopeDefault,
                  scopeCategory: dd.scopeCategory,
                  scopeClient: dd.scopeClient,
                  advance: dd.advanceGraceDays,
                  credit: dd.creditGraceDays,
                  allowedDebt: dd.allowedDebt,
                  warnDays: dd.warnDaysBefore,
                  save: d.common.save,
                  name: d.clients.name,
                }}
              />
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold">{dd.events}</h2>
            <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                    <th className="px-4 py-3 font-medium">Дата/время</th>
                    <th className="px-4 py-3 font-medium">{dd.client}</th>
                    <th className="px-4 py-3 font-medium">{d.common.actions}</th>
                    <th className="px-4 py-3 font-medium">{dd.debt}</th>
                    <th className="px-4 py-3 font-medium">{dd.unblockUntil}</th>
                    <th className="px-4 py-3 font-medium">{dd.performedBy}</th>
                    <th className="px-4 py-3 font-medium">{dd.note}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-ink-dim">
                        {d.common.empty}
                      </td>
                    </tr>
                  )}
                  {events.map((e) => (
                    <tr key={e.id} className="border-b border-line last:border-0">
                      <td className="whitespace-nowrap px-4 py-2.5 text-[13px]">
                        {new Date(e.created_at).toLocaleString("ru-RU", {
                          timeZone: "Asia/Almaty",
                        })}
                      </td>
                      <td className="px-4 py-2.5 font-medium">{e.client_name}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${ACTION_BADGE[e.action]}`}
                        >
                          {e.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[13px]">
                        {e.debt_amount
                          ? `${Number(e.debt_amount).toLocaleString("ru-RU")} ₸`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[13px]">
                        {e.unblock_until
                          ? new Date(e.unblock_until).toLocaleDateString("ru-RU")
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {e.performed_by_name ?? dd.auto}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-ink-dim">
                        {e.note ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {canManage && (
          <ManualBlockForm
            clients={clients}
            labels={{
              title: dd.manualTitle,
              client: dd.client,
              block: dd.block,
              unblock: dd.unblock,
              unblockUntil: dd.unblockUntil,
              note: dd.note,
            }}
          />
        )}
      </div>
    </div>
  );
}
