import Link from "next/link";
import type { Dict } from "@/lib/dict/ru";

export function BillingTabs({
  d,
  active,
}: {
  d: Dict;
  active: "documents" | "run" | "tariffs" | "settlements";
}) {
  const tabs: [string, string, string][] = [
    ["documents", "/billing/documents", d.billing.tabDocuments],
    ["run", "/billing/run", d.billing.tabRun],
    ["tariffs", "/billing/tariffs", d.billing.tabTariffs],
    ["settlements", "/billing/settlements", d.billing.tabSettlements],
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
