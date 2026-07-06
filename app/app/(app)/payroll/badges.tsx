import type { Dict } from "@/lib/dict/ru";

const BADGE = "rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap";

const SHEET_STATUS_CLS: Record<string, string> = {
  draft: "bg-paper text-ink-dim",
  approved: "bg-accent-soft text-accent-ink",
  paid: "bg-green-100 text-green-800",
};

export function sheetStatusBadge(status: string, p: Dict["payroll"]) {
  return (
    <span className={`${BADGE} ${SHEET_STATUS_CLS[status] ?? "bg-paper text-ink-dim"}`}>
      {(p.statuses as Record<string, string>)[status] ?? status}
    </span>
  );
}

const KIND_CLS: Record<string, string> = {
  work: "bg-accent-soft text-accent-ink",
  compensation: "bg-green-100 text-green-800",
  deduction: "bg-red-100 text-red-700",
};

export function entryKindBadge(kind: string, p: Dict["payroll"]) {
  return (
    <span className={`${BADGE} ${KIND_CLS[kind] ?? "bg-paper text-ink-dim"}`}>
      {(p.kinds as Record<string, string>)[kind] ?? kind}
    </span>
  );
}

export function fmtMoney(v: unknown): string {
  return Number(v ?? 0).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtDate(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" });
}
