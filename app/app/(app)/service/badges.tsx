import type { Dict } from "@/lib/dict/ru";

const BADGE = "rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap";

export const REQUEST_STATUS_CLS: Record<string, string> = {
  new: "bg-sky-100 text-sky-800",
  assigned: "bg-accent-soft text-accent-ink",
  in_progress: "bg-accent-soft text-accent-ink",
  visit_planned: "bg-indigo-100 text-indigo-800",
  installer_departed: "bg-indigo-100 text-indigo-800",
  installer_on_site: "bg-indigo-100 text-indigo-800",
  working: "bg-indigo-100 text-indigo-800",
  wait_client: "bg-amber-100 text-amber-800",
  wait_parts: "bg-amber-100 text-amber-800",
  completed: "bg-green-100 text-green-800",
  in_review: "bg-amber-100 text-amber-800",
  closed: "bg-paper text-ink-dim",
  overdue: "bg-red-100 text-red-700",
  cancelled: "bg-paper text-ink-dim line-through",
};

export function requestStatusBadge(status: string, s: Dict["service"]) {
  return (
    <span className={`${BADGE} ${REQUEST_STATUS_CLS[status] ?? "bg-paper text-ink-dim"}`}>
      {(s.requestStatuses as Record<string, string>)[status] ?? status}
    </span>
  );
}

export const ORDER_STATUS_CLS: Record<string, string> = {
  draft: "bg-paper text-ink-dim",
  planned: "bg-sky-100 text-sky-800",
  in_progress: "bg-accent-soft text-accent-ink",
  done: "bg-green-100 text-green-800",
  rework: "bg-amber-100 text-amber-800",
  cancelled: "bg-paper text-ink-dim line-through",
};

export function orderStatusBadge(status: string, s: Dict["service"]) {
  return (
    <span className={`${BADGE} ${ORDER_STATUS_CLS[status] ?? "bg-paper text-ink-dim"}`}>
      {(s.orderStatuses as Record<string, string>)[status] ?? status}
    </span>
  );
}

const ACT_STATUS_CLS: Record<string, string> = {
  in_preparation: "bg-sky-100 text-sky-800",
  done: "bg-green-100 text-green-800",
  needs_rework: "bg-amber-100 text-amber-800",
  cancelled: "bg-paper text-ink-dim line-through",
};

export function actStatusBadge(status: string, s: Dict["service"]) {
  return (
    <span className={`${BADGE} ${ACT_STATUS_CLS[status] ?? "bg-paper text-ink-dim"}`}>
      {(s.actStatuses as Record<string, string>)[status] ?? status}
    </span>
  );
}

const PRIORITY_CLS: Record<string, string> = {
  low: "bg-paper text-ink-dim",
  normal: "bg-paper text-ink",
  high: "bg-amber-100 text-amber-800",
  critical: "bg-red-100 text-red-700",
};

export function priorityBadge(priority: string, s: Dict["service"]) {
  return (
    <span className={`${BADGE} ${PRIORITY_CLS[priority] ?? "bg-paper text-ink-dim"}`}>
      {(s.priorities as Record<string, string>)[priority] ?? priority}
    </span>
  );
}

export function fmtAlmaty(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDateAlmaty(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" });
}
