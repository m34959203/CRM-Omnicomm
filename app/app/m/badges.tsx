import type { Dict } from "@/lib/dict/ru";

/** Тёмные («полевые») статус-бейджи PWA техника. */
const BADGE = "rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap";

const ORDER_CLS: Record<string, string> = {
  draft: "bg-chrome-raised text-chrome-dim",
  planned: "bg-sky-500/15 text-sky-300",
  in_progress: "bg-accent/15 text-accent",
  done: "bg-ok/20 text-emerald-300",
  rework: "bg-warn/20 text-amber-300",
  cancelled: "bg-chrome-raised text-chrome-dim line-through",
};

export function mOrderBadge(status: string, s: Dict["service"]) {
  return (
    <span className={`${BADGE} ${ORDER_CLS[status] ?? "bg-chrome-raised text-chrome-dim"}`}>
      {(s.orderStatuses as Record<string, string>)[status] ?? status}
    </span>
  );
}

const ACT_CLS: Record<string, string> = {
  in_preparation: "bg-sky-500/15 text-sky-300",
  done: "bg-ok/20 text-emerald-300",
  needs_rework: "bg-warn/20 text-amber-300",
  cancelled: "bg-chrome-raised text-chrome-dim line-through",
};

export function mActBadge(status: string, s: Dict["service"]) {
  return (
    <span className={`${BADGE} ${ACT_CLS[status] ?? "bg-chrome-raised text-chrome-dim"}`}>
      {(s.actStatuses as Record<string, string>)[status] ?? status}
    </span>
  );
}
