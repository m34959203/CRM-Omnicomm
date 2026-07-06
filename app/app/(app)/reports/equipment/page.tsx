import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import {
  equipmentSummary,
  equipmentSummaryDetails,
  type SummaryRow,
} from "@/lib/reports/equipment-summary";
import { REPORT_READ_ROLES } from "@/lib/reports/common";
import { ReportsTabs } from "../tabs";

type DetailRow = {
  id: string;
  nomenclature: string;
  serial_number: string | null;
  imei: string | null;
  condition: string;
  status: string;
  billing_state: string | null;
  days_here: number;
};

const BUCKET_ORDER: SummaryRow["bucket"][] = [
  "warehouse",
  "technician",
  "client",
  "testing",
  "supplier",
  "written_off",
];

export default async function ReportEquipmentPage({
  searchParams,
}: {
  searchParams: Promise<{ bucket?: string; key?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!REPORT_READ_ROLES.includes(user.role)) redirect("/dashboard");
  const d = t(user.locale);
  const r = d.reports;
  const { bucket = "", key = "" } = await searchParams;
  const expanded = bucket && key ? `${bucket}:${key}` : "";

  const rows = await equipmentSummary(query);
  const details: DetailRow[] = expanded
    ? ((await equipmentSummaryDetails(query, bucket, key)) as DetailRow[])
    : [];

  const byBucket = new Map<string, SummaryRow[]>();
  for (const row of rows) {
    const list = byBucket.get(row.bucket) ?? [];
    list.push(row);
    byBucket.set(row.bucket, list);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{r.title}</h1>
        <a
          href="/api/reports/equipment/export"
          className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
        >
          {d.common.exportExcel}
        </a>
      </div>
      <ReportsTabs d={d} active="equipment" />

      <h2 className="mt-5 text-lg font-semibold">{r.equipmentTitle}</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{r.group}</th>
              <th className="px-4 py-3 font-medium text-right">{r.newCount}</th>
              <th className="px-4 py-3 font-medium text-right">{r.usedCount}</th>
              <th className="px-4 py-3 font-medium text-right">{r.total}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {BUCKET_ORDER.filter((bk) => byBucket.has(bk)).map((bk) => {
              const group = byBucket.get(bk)!;
              const subtotal = group.reduce(
                (a, g) => ({
                  n: a.n + g.new_count,
                  u: a.u + g.used_count,
                  t: a.t + g.total,
                }),
                { n: 0, u: 0, t: 0 }
              );
              return [
                <tr key={bk} className="border-b border-line bg-paper/60">
                  <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink-dim">
                    {r.buckets[bk]}
                  </td>
                  <td className="px-4 py-2 text-right text-xs font-semibold text-ink-dim">
                    {subtotal.n}
                  </td>
                  <td className="px-4 py-2 text-right text-xs font-semibold text-ink-dim">
                    {subtotal.u}
                  </td>
                  <td className="px-4 py-2 text-right text-xs font-semibold text-ink-dim">
                    {subtotal.t}
                  </td>
                </tr>,
                ...group.map((g) => {
                  const isOpen = expanded === `${g.bucket}:${g.group_key}`;
                  return [
                    <tr
                      key={`${g.bucket}:${g.group_key}`}
                      className={`border-b border-line last:border-0 transition hover:bg-accent-soft/40 ${
                        isOpen ? "bg-accent-soft/40" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={
                            isOpen
                              ? "/reports/equipment"
                              : `/reports/equipment?bucket=${g.bucket}&key=${encodeURIComponent(g.group_key)}`
                          }
                          className="flex items-center gap-2 font-medium hover:text-accent-ink"
                        >
                          <span className="font-mono text-[11px] text-ink-dim">
                            {isOpen ? "▾" : "▸"}
                          </span>
                          {g.group_name}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right">{g.new_count}</td>
                      <td className="px-4 py-2.5 text-right">{g.used_count}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{g.total}</td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${g.bucket}:${g.group_key}:details`} className="border-b border-line">
                        <td colSpan={4} className="bg-paper/40 px-4 py-3">
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
                              {r.details}: {g.group_name}
                            </span>
                            <a
                              href={`/api/reports/equipment/export?bucket=${g.bucket}&key=${encodeURIComponent(g.group_key)}`}
                              className="rounded border border-line bg-card px-2 py-1 text-xs transition hover:border-accent hover:text-accent-ink"
                            >
                              {r.exportDetails}
                            </a>
                          </div>
                          <table className="w-full text-[13px]">
                            <thead>
                              <tr className="text-left text-[11px] uppercase tracking-wider text-ink-dim">
                                <th className="px-2 py-1.5 font-medium">{d.equipment.nomenclature}</th>
                                <th className="px-2 py-1.5 font-medium">{d.equipment.serial}</th>
                                <th className="px-2 py-1.5 font-medium">{d.equipment.condition}</th>
                                <th className="px-2 py-1.5 font-medium">{d.equipment.billingState}</th>
                                <th className="px-2 py-1.5 font-medium text-right">{r.daysHere}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {details.map((dt) => (
                                <tr key={dt.id} className="border-t border-line/60">
                                  <td className="px-2 py-1.5">{dt.nomenclature}</td>
                                  <td className="px-2 py-1.5 font-mono text-[12px]">
                                    {dt.serial_number ?? dt.imei ?? "—"}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    {dt.condition === "new" ? r.newCount : r.usedCount}
                                  </td>
                                  <td className="px-2 py-1.5">{dt.billing_state ?? "—"}</td>
                                  <td className="px-2 py-1.5 text-right">{dt.days_here}</td>
                                </tr>
                              ))}
                              {details.length === 0 && (
                                <tr>
                                  <td colSpan={5} className="px-2 py-4 text-center text-ink-dim">
                                    {d.common.empty}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : null,
                  ];
                }),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
