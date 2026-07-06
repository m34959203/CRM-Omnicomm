import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { PAYROLL_READ_ROLES, PAYROLL_WRITE_ROLES } from "@/lib/payroll/common";
import { PayrollTabs } from "../tabs";
import { fmtMoney, fmtDate } from "../badges";
import { CategoryForm, AssignForm, RateForm, RuleForm, RowActions } from "./settings-client";

type CategoryRow = { id: string; name: string; note: string | null; is_active: boolean };
type AssignmentRow = {
  id: string;
  user_name: string;
  category_name: string;
  valid_from: string;
};
type RateRow = {
  id: string;
  scope: string;
  category_name: string | null;
  user_name: string | null;
  work_type: string;
  rate: string;
  valid_from: string;
  is_active: boolean;
};
type RuleRow = {
  id: string;
  name: string;
  scope: string;
  category_name: string | null;
  user_name: string | null;
  salary: string;
  norm_count: number;
  piece_over_norm: boolean;
  is_active: boolean;
};

export default async function PayrollSettingsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!PAYROLL_READ_ROLES.includes(user.role)) redirect("/dashboard");
  const d = t(user.locale);
  const p = d.payroll;
  const canEdit = PAYROLL_WRITE_ROLES.includes(user.role);

  const [categories, assignments, rates, rules, installers, workTypes] = await Promise.all([
    query<CategoryRow>(
      `SELECT id, name, note, is_active FROM performer_categories ORDER BY name`
    ),
    query<AssignmentRow>(
      `SELECT a.id, u.full_name AS user_name, c.name AS category_name, a.valid_from::text
       FROM performer_category_assignments a
       JOIN users u ON u.id = a.user_id
       JOIN performer_categories c ON c.id = a.category_id
       ORDER BY u.full_name, a.valid_from DESC`
    ),
    query<RateRow>(
      `SELECT r.id, r.scope, c.name AS category_name, u.full_name AS user_name,
              wt.name AS work_type, r.rate::text, r.valid_from::text, r.is_active
       FROM work_rates r
       LEFT JOIN performer_categories c ON c.id = r.category_id
       LEFT JOIN users u ON u.id = r.user_id
       JOIN work_types wt ON wt.id = r.work_type_id
       ORDER BY r.scope, wt.name, r.valid_from DESC`
    ),
    query<RuleRow>(
      `SELECT r.id, r.name, r.scope, c.name AS category_name, u.full_name AS user_name,
              r.salary::text, r.norm_count, r.piece_over_norm, r.is_active
       FROM payroll_rules r
       LEFT JOIN performer_categories c ON c.id = r.category_id
       LEFT JOIN users u ON u.id = r.user_id
       ORDER BY r.scope, r.name`
    ),
    query<{ id: string; name: string }>(
      `SELECT u.id, u.full_name AS name FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.is_active AND r.code = 'installer' ORDER BY u.full_name`
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM work_types WHERE is_active ORDER BY name`
    ),
  ]);

  const activeCategories = categories.filter((c) => c.is_active);
  const scopeLabel = (scope: string, categoryName: string | null, userName: string | null) =>
    scope === "default" ? p.scopeDefault : scope === "category" ? categoryName ?? p.scopeCategory : userName ?? p.scopePerformer;

  const th = "px-4 py-2.5 font-medium";
  const td = "px-4 py-2";
  const table = "mt-3 overflow-x-auto rounded-lg border border-line bg-card";
  const headRow = "border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim";
  const bodyRow = "border-b border-line last:border-0";

  return (
    <div>
      <h1 className="text-2xl font-semibold">{p.title}</h1>
      <PayrollTabs d={d} active="settings" />

      <div className="mt-6 grid gap-8 xl:grid-cols-2">
        {/* Категории */}
        <section>
          <h2 className="text-lg font-semibold">{p.categories}</h2>
          <div className={table}>
            <table className="w-full text-sm">
              <thead>
                <tr className={headRow}>
                  <th className={th}>{p.categoryName}</th>
                  <th className={th}>{p.note}</th>
                  {canEdit && <th className={th}>{d.common.actions}</th>}
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-6 text-center text-ink-dim">{d.common.empty}</td></tr>
                )}
                {categories.map((c) => (
                  <tr key={c.id} className={`${bodyRow} ${c.is_active ? "" : "opacity-50"}`}>
                    <td className={`${td} font-medium`}>{c.name}</td>
                    <td className={td}>{c.note ?? "—"}</td>
                    {canEdit && (
                      <td className={td}>
                        <RowActions
                          endpoint="/api/payroll/categories"
                          id={c.id}
                          isActive={c.is_active}
                          deleteLabel={d.common.delete}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <CategoryForm
              labels={{ add: p.addCategory, name: p.categoryName, note: p.note, save: d.common.save }}
            />
          )}
        </section>

        {/* Назначения */}
        <section>
          <h2 className="text-lg font-semibold">{p.assignments}</h2>
          <div className={table}>
            <table className="w-full text-sm">
              <thead>
                <tr className={headRow}>
                  <th className={th}>{p.performer}</th>
                  <th className={th}>{p.category}</th>
                  <th className={th}>{p.validFrom}</th>
                  {canEdit && <th className={th}>{d.common.actions}</th>}
                </tr>
              </thead>
              <tbody>
                {assignments.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-ink-dim">{d.common.empty}</td></tr>
                )}
                {assignments.map((a) => (
                  <tr key={a.id} className={bodyRow}>
                    <td className={td}>{a.user_name}</td>
                    <td className={td}>{a.category_name}</td>
                    <td className={td}>{fmtDate(a.valid_from)}</td>
                    {canEdit && (
                      <td className={td}>
                        <RowActions
                          endpoint="/api/payroll/assignments"
                          id={a.id}
                          deleteLabel={d.common.delete}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <AssignForm
              users={installers}
              categories={activeCategories.map((c) => ({ id: c.id, name: c.name }))}
              labels={{
                add: p.assignCategory,
                performer: p.performer,
                category: p.category,
                validFrom: p.validFrom,
                save: d.common.save,
              }}
            />
          )}
        </section>
      </div>

      {/* Расценки */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">{p.rates}</h2>
        <div className={table}>
          <table className="w-full text-sm">
            <thead>
              <tr className={headRow}>
                <th className={th}>{p.scope}</th>
                <th className={th}>{p.workType}</th>
                <th className={th}>{p.rate}</th>
                <th className={th}>{p.validFrom}</th>
                {canEdit && <th className={th}>{d.common.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {rates.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-ink-dim">{d.common.empty}</td></tr>
              )}
              {rates.map((r) => (
                <tr key={r.id} className={`${bodyRow} ${r.is_active ? "" : "opacity-50"}`}>
                  <td className={td}>{scopeLabel(r.scope, r.category_name, r.user_name)}</td>
                  <td className={td}>{r.work_type}</td>
                  <td className={`${td} text-right font-mono text-[13px]`}>{fmtMoney(r.rate)}</td>
                  <td className={td}>{fmtDate(r.valid_from)}</td>
                  {canEdit && (
                    <td className={td}>
                      <RowActions
                        endpoint="/api/payroll/rates"
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
        {canEdit && (
          <RateForm
            users={installers}
            categories={activeCategories.map((c) => ({ id: c.id, name: c.name }))}
            workTypes={workTypes}
            labels={{
              add: p.addRate,
              scope: p.scope,
              scopeDefault: p.scopeDefault,
              scopeCategory: p.scopeCategory,
              scopePerformer: p.scopePerformer,
              workType: p.workType,
              rate: p.rate,
              validFrom: p.validFrom,
              save: d.common.save,
            }}
          />
        )}
      </section>

      {/* Правила */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">{p.rules}</h2>
        <p className="mt-1 text-sm text-ink-dim">{p.rulesHint}</p>
        <div className={table}>
          <table className="w-full text-sm">
            <thead>
              <tr className={headRow}>
                <th className={th}>{p.ruleName}</th>
                <th className={th}>{p.scope}</th>
                <th className={th}>{p.salary}</th>
                <th className={th}>{p.normCount}</th>
                <th className={th}>{p.pieceOverNorm}</th>
                {canEdit && <th className={th}>{d.common.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-ink-dim">{d.common.empty}</td></tr>
              )}
              {rules.map((r) => (
                <tr key={r.id} className={`${bodyRow} ${r.is_active ? "" : "opacity-50"}`}>
                  <td className={`${td} font-medium`}>{r.name}</td>
                  <td className={td}>{scopeLabel(r.scope, r.category_name, r.user_name)}</td>
                  <td className={`${td} text-right font-mono text-[13px]`}>{fmtMoney(r.salary)}</td>
                  <td className={`${td} text-center`}>{r.norm_count}</td>
                  <td className={td}>{r.piece_over_norm ? p.yes : p.no}</td>
                  {canEdit && (
                    <td className={td}>
                      <RowActions
                        endpoint="/api/payroll/rules"
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
        {canEdit && (
          <RuleForm
            users={installers}
            categories={activeCategories.map((c) => ({ id: c.id, name: c.name }))}
            labels={{
              add: p.addRule,
              name: p.ruleName,
              scope: p.scope,
              scopeDefault: p.scopeDefault,
              scopeCategory: p.scopeCategory,
              scopePerformer: p.scopePerformer,
              salary: p.salary,
              normCount: p.normCount,
              pieceOverNorm: p.pieceOverNorm,
              save: d.common.save,
            }}
          />
        )}
      </section>
    </div>
  );
}
