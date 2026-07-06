import Link from "next/link";
import type { Dict } from "@/lib/dict/ru";

export function ReportsTabs({
  d,
  active,
}: {
  d: Dict;
  active: "equipment" | "days" | "workload" | "activity" | "installers";
}) {
  const tabs: [string, string, string][] = [
    ["equipment", "/reports/equipment", d.reports.tabEquipment],
    ["days", "/reports/days", d.reports.tabDays],
    ["workload", "/reports/workload", d.reports.tabWorkload],
    ["activity", "/reports/activity", d.reports.tabActivity],
    ["installers", "/reports/installers", d.reports.tabInstallers],
  ];
  return (
    <div className="mt-4 flex gap-1 border-b border-line">
      {tabs.map(([key, href, label]) => (
        <Link
          key={key}
          href={href}
          className={
            key === active
              ? "border-b-2 border-accent px-3 py-2 text-sm font-semibold text-accent-ink"
              : "px-3 py-2 text-sm text-ink-dim transition hover:text-accent-ink"
          }
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
