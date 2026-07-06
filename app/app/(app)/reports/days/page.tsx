import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { testingDays, fromClientDays, atSupplierDays } from "@/lib/reports/days";
import { REPORT_READ_ROLES } from "@/lib/reports/common";
import { ReportsTabs } from "../tabs";

const TABS = ["testing", "from_client", "supplier"] as const;
type Tab = (typeof TABS)[number];

function fmtDate(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" });
}

function daysBadge(days: number) {
  const cls =
    days > 30
      ? "bg-red-100 text-red-700"
      : days > 14
        ? "bg-amber-100 text-amber-800"
        : "bg-paper text-ink-dim";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${cls}`}>{days}</span>
  );
}

export default async function ReportDaysPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!REPORT_READ_ROLES.includes(user.role)) redirect("/dashboard");
  const d = t(user.locale);
  const r = d.reports;
  const sp = await searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "testing";

  const subTabs: [Tab, string][] = [
    ["testing", r.tabTesting],
    ["from_client", r.tabFromClients],
    ["supplier", r.tabAtSupplier],
  ];

  const th = "px-4 py-3 font-medium";
  const td = "px-4 py-2.5";

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{r.title}</h1>
        <a
          href={`/api/reports/days/export?tab=${tab}`}
          className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
        >
          {d.common.exportExcel}
        </a>
      </div>
      <ReportsTabs d={d} active="days" />

      <div className="mt-5 flex items-center gap-2">
        {subTabs.map(([key, label]) => (
          <Link
            key={key}
            href={`/reports/days?tab=${key}`}
            className={
              key === tab
                ? "rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white"
                : "rounded-md border border-line bg-card px-3 py-1.5 text-sm transition hover:border-accent hover:text-accent-ink"
            }
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-card">
        {tab === "testing" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                <th className={th}>{r.doc}</th>
                <th className={th}>{r.client}</th>
                <th className={th}>{d.clientCard.object}</th>
                <th className={th}>{d.equipment.nomenclature}</th>
                <th className={th}>{d.equipment.serial}</th>
                <th className={th}>{r.sinceDate}</th>
                <th className={`${th} text-right`}>{r.days}</th>
              </tr>
            </thead>
            <tbody>
              {(await testingDays(query)).map((x, i) => (
                <tr key={i} className="border-b border-line last:border-0 transition hover:bg-accent-soft/40">
                  <td className={`${td} font-mono text-[13px]`}>{x.number ?? "—"}</td>
                  <td className={td}>{x.client_name}</td>
                  <td className={td}>{x.object_name ?? "—"}</td>
                  <td className={td}>{x.nomenclature}</td>
                  <td className={`${td} font-mono text-[13px]`}>{x.serial_number ?? "—"}</td>
                  <td className={td}>{fmtDate(x.started_at)}</td>
                  <td className={`${td} text-right`}>{daysBadge(x.days)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "from_client" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                <th className={th}>{r.doc}</th>
                <th className={th}>{r.client}</th>
                <th className={th}>{d.equipment.nomenclature}</th>
                <th className={th}>{d.equipment.serial}</th>
                <th className={th}>{r.defect}</th>
                <th className={th}>{r.sinceDate}</th>
                <th className={`${th} text-right`}>{r.days}</th>
              </tr>
            </thead>
            <tbody>
              {(await fromClientDays(query)).map((x, i) => (
                <tr key={i} className="border-b border-line last:border-0 transition hover:bg-accent-soft/40">
                  <td className={`${td} font-mono text-[13px]`}>{x.number ?? "—"}</td>
                  <td className={td}>{x.client_name ?? "—"}</td>
                  <td className={td}>{x.nomenclature}</td>
                  <td className={`${td} font-mono text-[13px]`}>{x.serial_number ?? "—"}</td>
                  <td className={td}>{x.defect_note ?? "—"}</td>
                  <td className={td}>{fmtDate(x.received_at)}</td>
                  <td className={`${td} text-right`}>{daysBadge(x.days)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "supplier" && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                <th className={th}>{d.warehouses.supplier}</th>
                <th className={th}>{d.equipment.nomenclature}</th>
                <th className={th}>{d.equipment.serial}</th>
                <th className={th}>{r.sinceDate}</th>
                <th className={`${th} text-right`}>{r.days}</th>
              </tr>
            </thead>
            <tbody>
              {(await atSupplierDays(query)).map((x, i) => (
                <tr key={i} className="border-b border-line last:border-0 transition hover:bg-accent-soft/40">
                  <td className={td}>{x.supplier_name ?? "—"}</td>
                  <td className={td}>{x.nomenclature}</td>
                  <td className={`${td} font-mono text-[13px]`}>{x.serial_number ?? "—"}</td>
                  <td className={td}>{fmtDate(x.since)}</td>
                  <td className={`${td} text-right`}>{daysBadge(x.days)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
