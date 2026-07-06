"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Формирование ведомости: месяц + пресет периода (1–15 / 16–конец / полный месяц). */
export function BuildSheetForm({
  labels,
}: {
  labels: { build: string; month: string; preset: string; firstHalf: string; secondHalf: string; fullMonth: string };
}) {
  const router = useRouter();
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [preset, setPreset] = useState<"full" | "first" | "second">("full");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function build() {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dd = (n: number) => String(n).padStart(2, "0");
    const periodStart = preset === "second" ? `${month}-16` : `${month}-01`;
    const periodEnd = preset === "first" ? `${month}-15` : `${month}-${dd(lastDay)}`;

    setBusy(true);
    setMsg("");
    setError("");
    const res = await fetch("/api/payroll/sheets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period_start: periodStart, period_end: periodEnd }),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      if (data?.skipped) {
        setMsg(String(data.skipped));
        router.refresh();
      } else if (data?.sheetId) {
        router.push(`/payroll/sheets/${data.sheetId}`);
      }
    } else {
      setError(data?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
  }

  const sel =
    "rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none transition focus:border-accent";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-sm text-ink-dim">
        {labels.month}
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className={sel}
        />
      </label>
      <label className="flex items-center gap-1 text-sm text-ink-dim">
        {labels.preset}
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value as typeof preset)}
          className={sel}
        >
          <option value="full">{labels.fullMonth}</option>
          <option value="first">{labels.firstHalf}</option>
          <option value="second">{labels.secondHalf}</option>
        </select>
      </label>
      <button
        onClick={build}
        disabled={busy}
        className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
      >
        {busy ? "…" : labels.build}
      </button>
      {msg && <span className="text-sm text-ink-dim">{msg}</span>}
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
