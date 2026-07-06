import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { ServiceTabs } from "../tabs";
import { fmtAlmaty } from "../badges";
import { RepairRowActions } from "./row-actions";

type Row = {
  id: string;
  number: string | null;
  doc_type: string;
  client_name: string | null;
  supplier_name: string | null;
  status: string;
  units: string | null;
  days_open: string | null;
  created_at: string;
};

const STATUS_CLS: Record<string, string> = {
  draft: "bg-paper text-ink-dim",
  open: "bg-amber-100 text-amber-800",
  closed: "bg-green-100 text-green-800",
  cancelled: "bg-paper text-ink-dim line-through",
};

/** Ремонтный контур: открытый док приёма = долг перед клиентом (дни — в списке). */
export default async function RepairsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const s = d.service;
  const canEdit = ["admin", "manager", "support", "head"].includes(user.role);

  const rows = await query<Row>(
    `SELECT r.id, r.number, r.doc_type, c.name AS client_name, sp.name AS supplier_name,
            r.status, r.created_at,
            (SELECT string_agg(n.name || COALESCE(' SN ' || e.serial_number, '')
                    || CASE WHEN i.is_replacement THEN ' (подмена)' ELSE '' END, ', ')
             FROM equipment_repair_doc_items i
             JOIN equipment_items e ON e.id = i.equipment_id
             JOIN nomenclature n ON n.id = e.nomenclature_id
             WHERE i.doc_id = r.id) AS units,
            CASE WHEN r.status = 'open'
                 THEN floor(extract(epoch FROM (now() - r.created_at)) / 86400)::text
                 ELSE NULL END AS days_open
     FROM equipment_repair_docs r
     LEFT JOIN clients c ON c.id = r.client_id
     LEFT JOIN suppliers sp ON sp.id = r.supplier_id
     ORDER BY (r.status = 'open') DESC, r.created_at DESC
     LIMIT 500`
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{s.repairsTitle}</h1>
        {canEdit && (
          <Link
            href="/service/repairs/new"
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink"
          >
            {s.newRepairDoc}
          </Link>
        )}
      </div>
      <ServiceTabs d={d} active="repairs" />

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{s.number}</th>
              <th className="px-4 py-3 font-medium">{s.docType}</th>
              <th className="px-4 py-3 font-medium">{s.client}</th>
              <th className="px-4 py-3 font-medium">{s.supplier}</th>
              <th className="px-4 py-3 font-medium">{s.equipment}</th>
              <th className="px-4 py-3 font-medium">{s.createdAt}</th>
              <th className="px-4 py-3 font-medium">{s.daysOpen}</th>
              <th className="px-4 py-3 font-medium">{s.status}</th>
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
                <td className="px-4 py-2.5">
                  {(s.repairDocTypes as Record<string, string>)[r.doc_type] ?? r.doc_type}
                </td>
                <td className="px-4 py-2.5">{r.client_name ?? "—"}</td>
                <td className="px-4 py-2.5">{r.supplier_name ?? "—"}</td>
                <td className="max-w-72 truncate px-4 py-2.5 text-[13px]" title={r.units ?? ""}>
                  {r.units ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-[13px]">{fmtAlmaty(r.created_at)}</td>
                <td className="px-4 py-2.5 font-mono">{r.days_open ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_CLS[r.status] ?? "bg-paper text-ink-dim"}`}
                  >
                    {(s.repairDocStatuses as Record<string, string>)[r.status] ?? r.status}
                  </span>
                </td>
                {canEdit && (
                  <td className="px-4 py-2.5">
                    {r.status === "open" && <RepairRowActions id={r.id} label={s.closeDoc} />}
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
