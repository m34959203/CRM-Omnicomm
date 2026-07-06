import type { Dict } from "@/lib/dict/ru";

export type DocKind = "advance_invoice" | "act" | "one_time_invoice";

export function kindBadge(kind: DocKind, b: Dict["billing"]) {
  if (kind === "act") {
    return (
      <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink">
        {b.kindAct}
      </span>
    );
  }
  return (
    <span className="rounded bg-paper px-1.5 py-0.5 text-[11px] font-medium text-ink-dim">
      {kind === "advance_invoice" ? b.kindAdvanceInvoice : b.kindOneTime}
    </span>
  );
}

export function statusBadge(status: string, b: Dict["billing"]) {
  const labels: Record<string, string> = {
    to_accrue: b.statusToAccrue,
    prepared: b.statusPrepared,
    issued: b.statusIssued,
    sent: b.statusSent,
    partial: b.statusPartial,
    paid: b.statusPaid,
    overdue: b.statusOverdue,
    cancelled: b.statusCancelled,
  };
  const cls: Record<string, string> = {
    paid: "bg-green-100 text-green-800",
    partial: "bg-amber-100 text-amber-800",
    overdue: "bg-red-100 text-red-700",
    cancelled: "bg-paper text-ink-dim line-through",
    issued: "bg-accent-soft text-accent-ink",
    sent: "bg-accent-soft text-accent-ink",
  };
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls[status] ?? "bg-paper text-ink-dim"}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
