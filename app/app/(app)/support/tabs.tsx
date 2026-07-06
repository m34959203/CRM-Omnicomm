import Link from "next/link";
import type { Dict } from "@/lib/dict/ru";

export function SupportTabs({
  d,
  active,
}: {
  d: Dict;
  active: "tickets" | "calls" | "messages" | "notifications";
}) {
  const tabs: [string, string, string][] = [
    ["tickets", "/support/tickets", d.support.tabTickets],
    ["calls", "/support/calls", d.support.tabCalls],
    ["messages", "/support/messages", d.support.tabMessages],
    ["notifications", "/support/notifications", d.support.tabNotifications],
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
