import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { money } from "@/lib/billing/amount-words";
import { BillingTabs } from "../tabs";
import { TariffForm, PlanForm, DiscountForm, RowActions } from "./tariffs-client";

type TariffRow = {
  id: string;
  level: "default" | "category" | "client" | "object";
  method: "activity" | "subscription" | "one_time";
  amount: string;
  do_not_charge: boolean;
  valid_from: string;
  valid_to: string | null;
  is_active: boolean;
  client_name: string | null;
  object_name: string | null;
  category_name: string | null;
};

type PlanRow = {
  id: string;
  name: string;
  is_active: boolean;
  items: { id: string; method: string; name: string | null; amount: string }[];
  clients_count: number;
  objects_count: number;
};

type DiscountRow = {
  id: string;
  name: string | null;
  client_name: string;
  total_amount: string;
  used_amount: string;
  valid_from: string;
  is_active: boolean;
};

export default async function TariffsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const b = d.billing;
  const canManage = ["admin", "accounting", "head"].includes(user.role);

  const [tariffs, plans, discounts, clients, categories, objects] = await Promise.all([
    query<TariffRow>(
      `SELECT t.id, t.level, t.method, t.amount, t.do_not_charge, t.valid_from::text,
              t.valid_to::text, t.is_active,
              c.name AS client_name, o.name AS object_name, sc.name AS category_name
       FROM tariffs t
       LEFT JOIN clients c ON c.id = t.client_id
       LEFT JOIN monitoring_objects o ON o.id = t.object_id
       LEFT JOIN service_categories sc ON sc.id = t.category_id
       ORDER BY t.level, t.valid_from DESC, t.created_at DESC
       LIMIT 500`
    ),
    query<PlanRow>(
      `SELECT p.id, p.name, p.is_active,
              COALESCE(json_agg(json_build_object(
                'id', i.id, 'method', i.method, 'name', i.name, 'amount', i.amount
              ) ORDER BY i.created_at) FILTER (WHERE i.id IS NOT NULL), '[]') AS items,
              (SELECT count(*) FROM clients c WHERE c.tariff_plan_id = p.id)::int AS clients_count,
              (SELECT count(*) FROM monitoring_objects o WHERE o.tariff_plan_id = p.id)::int AS objects_count
       FROM tariff_plans p
       LEFT JOIN tariff_plan_items i ON i.plan_id = p.id
       GROUP BY p.id
       ORDER BY p.name`
    ),
    query<DiscountRow>(
      `SELECT dd.id, dd.name, c.name AS client_name, dd.total_amount, dd.used_amount,
              dd.valid_from::text, dd.is_active
       FROM discounts dd
       JOIN clients c ON c.id = dd.client_id
       ORDER BY dd.created_at DESC
       LIMIT 500`
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE is_active ORDER BY name LIMIT 500`
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM service_categories WHERE is_active ORDER BY name`
    ),
    query<{ id: string; name: string; client_name: string }>(
      `SELECT o.id, o.name, c.name AS client_name
       FROM monitoring_objects o JOIN clients c ON c.id = o.client_id
       ORDER BY c.name, o.name LIMIT 1000`
    ),
  ]);

  const LEVEL_LABEL: Record<TariffRow["level"], string> = {
    default: b.levelDefault,
    category: b.levelCategory,
    client: b.levelClient,
    object: b.levelObject,
  };
  const METHOD_LABEL: Record<TariffRow["method"], string> = {
    activity: b.methodActivity,
    subscription: b.methodSubscription,
    one_time: b.methodOneTime,
  };

  const th = "px-4 py-3 font-medium";
  const td = "px-4 py-2.5";

  return (
    <div>
      <h1 className="text-2xl font-semibold">{b.title}</h1>
      <BillingTabs d={d} active="tariffs" />

      <div className="mt-6 space-y-8">
        {/* Произвольные тарифы */}
        <section>
          <h2 className="text-lg font-semibold">{b.tariffs}</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                  <th className={th}>{b.level}</th>
                  <th className={th}>{b.target}</th>
                  <th className={th}>{b.method}</th>
                  <th className={th}>{b.amount}</th>
                  <th className={th}>{b.validFrom}</th>
                  <th className={th}>{b.validTo}</th>
                  {canManage && <th className={th}>{d.common.actions}</th>}
                </tr>
              </thead>
              <tbody>
                {tariffs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-ink-dim">
                      {d.common.empty}
                    </td>
                  </tr>
                )}
                {tariffs.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className={td}>
                      <span className="rounded bg-paper px-1.5 py-0.5 text-[11px] font-medium">
                        {LEVEL_LABEL[r.level]}
                      </span>
                      {!r.is_active && (
                        <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim">
                          {b.inactive}
                        </span>
                      )}
                    </td>
                    <td className={`${td} font-medium`}>
                      {r.object_name ?? r.client_name ?? r.category_name ?? "—"}
                    </td>
                    <td className={td}>{METHOD_LABEL[r.method]}</td>
                    <td className={`${td} font-mono text-[13px]`}>
                      {r.do_not_charge ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                          {b.doNotCharge}
                        </span>
                      ) : (
                        `${money(Number(r.amount))} ₸`
                      )}
                    </td>
                    <td className={`${td} text-[13px]`}>
                      {new Date(r.valid_from).toLocaleDateString("ru-RU")}
                    </td>
                    <td className={`${td} text-[13px]`}>
                      {r.valid_to ? new Date(r.valid_to).toLocaleDateString("ru-RU") : "—"}
                    </td>
                    {canManage && (
                      <td className={td}>
                        <RowActions
                          endpoint={`/api/billing/tariffs/${r.id}`}
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
            <TariffForm d={d} clients={clients} categories={categories} objects={objects} />
          )}
        </section>

        {/* Тарифные планы */}
        <section>
          <h2 className="text-lg font-semibold">{b.plans}</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                  <th className={th}>{b.planName}</th>
                  <th className={th}>{b.planItems}</th>
                  <th className={th}>{b.levelClient} / {b.levelObject}</th>
                  {canManage && <th className={th}>{d.common.actions}</th>}
                </tr>
              </thead>
              <tbody>
                {plans.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-ink-dim">
                      {d.common.empty}
                    </td>
                  </tr>
                )}
                {plans.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className={`${td} font-medium`}>
                      {p.name}
                      {!p.is_active && (
                        <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim">
                          {b.inactive}
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      {p.items.length === 0
                        ? "—"
                        : p.items.map((i) => (
                            <div key={i.id} className="text-[13px]">
                              {METHOD_LABEL[i.method as TariffRow["method"]] ?? i.method}
                              {i.name ? ` «${i.name}»` : ""} —{" "}
                              <span className="font-mono">{money(Number(i.amount))} ₸</span>
                            </div>
                          ))}
                    </td>
                    <td className={`${td} font-mono text-[13px]`}>
                      {p.clients_count} / {p.objects_count}
                    </td>
                    {canManage && (
                      <td className={td}>
                        <RowActions
                          endpoint={`/api/billing/plans/${p.id}`}
                          isActive={p.is_active}
                          deleteLabel={d.common.delete}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canManage && <PlanForm d={d} />}
        </section>

        {/* Скидки */}
        <section>
          <h2 className="text-lg font-semibold">{b.discounts}</h2>
          <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                  <th className={th}>{b.client}</th>
                  <th className={th}>{d.clients.name}</th>
                  <th className={th}>{b.discountTotal}</th>
                  <th className={th}>{b.discountUsed}</th>
                  <th className={th}>{b.validFrom}</th>
                  {canManage && <th className={th}>{d.common.actions}</th>}
                </tr>
              </thead>
              <tbody>
                {discounts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-ink-dim">
                      {d.common.empty}
                    </td>
                  </tr>
                )}
                {discounts.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className={`${td} font-medium`}>
                      {r.client_name}
                      {!r.is_active && (
                        <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim">
                          {b.inactive}
                        </span>
                      )}
                    </td>
                    <td className={td}>{r.name ?? "—"}</td>
                    <td className={`${td} font-mono text-[13px]`}>
                      {money(Number(r.total_amount))} ₸
                    </td>
                    <td className={`${td} font-mono text-[13px]`}>
                      {money(Number(r.used_amount))} ₸
                    </td>
                    <td className={`${td} text-[13px]`}>
                      {new Date(r.valid_from).toLocaleDateString("ru-RU")}
                    </td>
                    {canManage && (
                      <td className={td}>
                        <RowActions
                          endpoint={`/api/billing/discounts/${r.id}`}
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
          {canManage && <DiscountForm d={d} clients={clients} />}
        </section>
      </div>
    </div>
  );
}
