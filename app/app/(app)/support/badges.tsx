import type { Dict } from "@/lib/dict/ru";

const BADGE = "rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap";

const TICKET_STATUS_CLS: Record<string, string> = {
  new: "bg-sky-100 text-sky-800",
  in_progress: "bg-accent-soft text-accent-ink",
  on_service: "bg-indigo-100 text-indigo-800",
  done: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
};

export function ticketStatusBadge(status: string, s: Dict["support"]) {
  return (
    <span className={`${BADGE} ${TICKET_STATUS_CLS[status] ?? "bg-paper text-ink-dim"}`}>
      {(s.ticketStatuses as Record<string, string>)[status] ?? status}
    </span>
  );
}

export function channelBadge(channel: string | null, s: Dict["support"]) {
  if (!channel) return <span className="text-ink-dim">—</span>;
  return (
    <span className={`${BADGE} bg-paper text-ink-dim`}>
      {(s.channels as Record<string, string>)[channel] ?? channel}
    </span>
  );
}

const QUEUE_STATUS_CLS: Record<string, string> = {
  queued: "bg-sky-100 text-sky-800",
  sending: "bg-amber-100 text-amber-800",
  sent: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-paper text-ink-dim line-through",
};

export function queueStatusBadge(status: string, s: Dict["support"]) {
  return (
    <span className={`${BADGE} ${QUEUE_STATUS_CLS[status] ?? "bg-paper text-ink-dim"}`}>
      {(s.queueStatuses as Record<string, string>)[status] ?? status}
    </span>
  );
}

const DIRECTION_CLS: Record<string, string> = {
  incoming: "bg-green-100 text-green-800",
  outgoing: "bg-accent-soft text-accent-ink",
  missed: "bg-red-100 text-red-700",
};

export function callDirectionBadge(direction: string, s: Dict["support"]) {
  return (
    <span className={`${BADGE} ${DIRECTION_CLS[direction] ?? "bg-paper text-ink-dim"}`}>
      {(s.directions as Record<string, string>)[direction] ?? direction}
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
