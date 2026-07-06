"use client";

import { useState } from "react";
import Link from "next/link";
import type { Dict } from "@/lib/dict/ru";

type Option = { id: string; name: string };

type RunResult = {
  clientId: string;
  client_name: string;
  documentId: string | null;
  kind: string;
  subtotal: number;
  discount: number;
  prepaid: number;
  vat: number;
  total: number;
  accruals: number;
  skipped?: string;
  error?: string;
};

type Summary = {
  period: string;
  kind: string;
  created: number;
  skipped: number;
  errors: number;
  results: RunResult[];
};

const input =
  "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
const label = "block text-sm font-medium";

const money = (n: number) =>
  n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function RunForm({
  d,
  clients,
  categories,
  defaultPeriod,
}: {
  d: Dict;
  clients: Option[];
  categories: Option[];
  defaultPeriod: string;
}) {
  const b = d.billing;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSummary(null);
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(
      [...fd.entries()].filter(([, v]) => v !== "")
    ) as Record<string, unknown>;
    const res = await fetch("/api/billing/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) setSummary(data as Summary);
    else setError(data?.error ?? `HTTP ${res.status}`);
    setBusy(false);
  }

  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={submit} className="rounded-lg border border-line bg-card p-5">
        <h2 className="text-lg font-semibold">{b.runTitle}</h2>
        <p className="mt-1 text-sm text-ink-dim">{b.runHint}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3 xl:grid-cols-5">
          <label className={label}>
            {b.period} *
            <input name="period" type="month" required defaultValue={defaultPeriod} className={input} />
          </label>
          <label className={label}>
            {b.kind} *
            <select name="kind" required className={input} defaultValue="act">
              <option value="advance_invoice">{b.kindAdvance}</option>
              <option value="act">{b.kindActs}</option>
            </select>
          </label>
          <label className={label}>
            {b.client}
            <select name="client_id" className={input} defaultValue="">
              <option value="">{b.all}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            {b.levelCategory}
            <select name="category_id" className={input} defaultValue="">
              <option value="">{b.all}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            {b.scheme}
            <select name="scheme" className={input} defaultValue="">
              <option value="">{b.all}</option>
              <option value="advance">{b.schemeAdvance}</option>
              <option value="credit">{b.schemeCredit}</option>
            </select>
          </label>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
        >
          {busy ? "…" : b.run}
        </button>
      </form>

      {summary && (
        <section>
          <h2 className="text-lg font-semibold">{b.results}</h2>
          <p className="mt-1 text-sm text-ink-dim">
            {b.createdCount}: <b className="text-ink">{summary.created}</b> ·{" "}
            {b.skippedCount}: <b className="text-ink">{summary.skipped}</b>
            {summary.errors > 0 && (
              <>
                {" "}· <span className="text-danger">ошибки: {summary.errors}</span>
              </>
            )}
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                  <th className="px-4 py-3 font-medium">{b.client}</th>
                  <th className="px-4 py-3 font-medium">{b.status}</th>
                  <th className="px-4 py-3 font-medium">{b.subtotal}</th>
                  <th className="px-4 py-3 font-medium">{b.discount}</th>
                  <th className="px-4 py-3 font-medium">{b.prepaid}</th>
                  <th className="px-4 py-3 font-medium">{b.total}</th>
                  <th className="px-4 py-3 font-medium">{b.reason}</th>
                </tr>
              </thead>
              <tbody>
                {summary.results.map((r) => (
                  <tr key={r.clientId} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-medium">{r.client_name}</td>
                    <td className="px-4 py-2.5">
                      {r.error ? (
                        <span className="rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
                          ошибка
                        </span>
                      ) : r.skipped ? (
                        <span className="rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim">
                          {b.resultSkipped}
                        </span>
                      ) : (
                        <Link
                          href={`/billing/documents/${r.documentId}`}
                          className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink hover:underline"
                        >
                          {b.resultCreated}
                        </Link>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[13px]">
                      {r.skipped ? "—" : `${money(r.subtotal)} ₸`}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[13px]">
                      {r.skipped || !r.discount ? "—" : `${money(r.discount)} ₸`}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[13px]">
                      {r.skipped || !r.prepaid ? "—" : `${money(r.prepaid)} ₸`}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[13px]">
                      {r.skipped ? "—" : `${money(r.total)} ₸`}
                    </td>
                    <td className="px-4 py-2.5 text-[13px] text-ink-dim">
                      {r.error ?? r.skipped ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
