import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { ServiceTabs } from "../tabs";
import { fmtAlmaty } from "../badges";
import { TestingRowActions } from "./row-actions";

type Row = {
  id: string;
  number: string | null;
  client_name: string;
  object_name: string | null;
  status: string;
  result: string | null;
  units: string | null;
  units_count: string;
  started_at: string | null;
  finished_at: string | null;
  days_on_testing: string | null;
  sales_order_id: string | null;
  dismantle_request_id: string | null;
};

const STATUS_CLS: Record<string, string> = {
  open: "bg-sky-100 text-sky-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-paper text-ink-dim line-through",
};

/** Тестирования + отчёт «Товары на тестировании» (дни — прямо в списке). */
export default async function TestingPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const s = d.service;
  const canEdit = ["admin", "manager", "support", "head"].includes(user.role);

  const rows = await query<Row>(
    `SELECT t.id, t.number, c.name AS client_name, o.name AS object_name,
            t.status, t.result, t.started_at, t.finished_at,
            t.sales_order_id, t.dismantle_request_id,
            (SELECT count(*) FROM testing_order_items ti WHERE ti.testing_order_id = t.id) AS units_count,
            (SELECT string_agg(n.name || COALESCE(' SN ' || e.serial_number, ''), ', ')
             FROM testing_order_items ti
             JOIN equipment_items e ON e.id = ti.equipment_id
             JOIN nomenclature n ON n.id = e.nomenclature_id
             WHERE ti.testing_order_id = t.id) AS units,
            floor(extract(epoch FROM (COALESCE(t.finished_at, now()) - t.started_at)) / 86400)::text
              AS days_on_testing
     FROM testing_orders t
     JOIN clients c ON c.id = t.client_id
     LEFT JOIN monitoring_objects o ON o.id = t.object_id
     ORDER BY (t.status = 'open') DESC, t.created_at DESC
     LIMIT 500`
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{s.testingTitle}</h1>
        {canEdit && (
          <Link
            href="/service/testing/new"
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink"
          >
            {s.newTesting}
          </Link>
        )}
      </div>
      <ServiceTabs d={d} active="testing" />

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{s.number}</th>
              <th className="px-4 py-3 font-medium">{s.client}</th>
              <th className="px-4 py-3 font-medium">{s.object}</th>
              <th className="px-4 py-3 font-medium">{s.units}</th>
              <th className="px-4 py-3 font-medium">{s.startedAt}</th>
              <th className="px-4 py-3 font-medium">{s.daysOnTesting}</th>
              <th className="px-4 py-3 font-medium">{s.status}</th>
              <th className="px-4 py-3 font-medium">{s.result}</th>
              {canEdit && <th className="px-4 py-3 font-medium">{d.common.actions}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-line last:border-0 transition hover:bg-accent-soft/40"
              >
                <td className="px-4 py-2.5 font-mono text-[13px] font-medium">{r.number}</td>
                <td className="px-4 py-2.5">{r.client_name}</td>
                <td className="px-4 py-2.5">{r.object_name ?? "—"}</td>
                <td className="max-w-64 truncate px-4 py-2.5 text-[13px]" title={r.units ?? ""}>
                  {r.units ?? "—"} ({r.units_count})
                </td>
                <td className="px-4 py-2.5 text-[13px]">{fmtAlmaty(r.started_at)}</td>
                <td className="px-4 py-2.5 font-mono">{r.days_on_testing ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CLS[r.status] ?? "bg-paper text-ink-dim"}`}
                  >
                    {(s.testingStatuses as Record<string, string>)[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[13px]">
                  {r.result ? (r.result === "sale" ? s.resultSale : s.resultRefusal) : "—"}
                </td>
                {canEdit && (
                  <td className="px-4 py-2.5">
                    {r.status === "open" && (
                      <TestingRowActions
                        id={r.id}
                        labels={{
                          sale: s.resultSale,
                          refusal: s.resultRefusal,
                          saleConfirm: s.saleConfirm,
                          refusalConfirm: s.refusalConfirm,
                        }}
                      />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
