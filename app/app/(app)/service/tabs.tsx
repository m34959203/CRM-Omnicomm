import Link from "next/link";
import type { Dict } from "@/lib/dict/ru";

export function ServiceTabs({
  d,
  active,
}: {
  d: Dict;
  active: "requests" | "orders" | "schedule" | "acts" | "testing" | "repairs";
}) {
  const tabs: [string, string, string][] = [
    ["requests", "/service/requests", d.service.tabRequests],
    ["orders", "/service/orders", d.service.tabOrders],
    ["schedule", "/service/schedule", d.service.tabSchedule],
    ["acts", "/service/acts", d.service.tabActs],
    ["testing", "/service/testing", d.service.tabTesting],
    ["repairs", "/service/repairs", d.service.tabRepairs],
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
