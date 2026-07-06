import Link from "next/link";
import type { Dict } from "@/lib/dict/ru";

export function TelematicsTabs({
  d,
  active,
}: {
  d: Dict;
  active: "servers" | "objects" | "log" | "blocking";
}) {
  const tabs: [string, string, string][] = [
    ["servers", "/telematics", d.telematics.servers],
    ["objects", "/telematics/objects", d.telematics.objects],
    ["log", "/telematics/log", d.telematics.syncLog],
    ["blocking", "/telematics/blocking", d.telematics.blocking],
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
