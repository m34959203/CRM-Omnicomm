import Link from "next/link";
import type { Dict } from "@/lib/dict/ru";

export function PayrollTabs({
  d,
  active,
}: {
  d: Dict;
  active: "sheets" | "entries" | "settings";
}) {
  const tabs: [string, string, string][] = [
    ["sheets", "/payroll/sheets", d.payroll.tabSheets],
    ["entries", "/payroll/entries", d.payroll.tabEntries],
    ["settings", "/payroll/settings", d.payroll.tabSettings],
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
