"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/lib/dict/ru";

const input =
  "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
const label = "block text-sm font-medium";
const btnPrimary =
  "rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60";
const btnGhost =
  "block rounded-md border border-line bg-card px-3 py-2 text-center text-sm transition hover:border-accent hover:text-accent-ink";

export function DocActions({
  d,
  doc,
  canManage,
}: {
  d: Dict;
  doc: {
    id: string;
    client_id: string;
    status: string;
    kind: string;
    total: number;
    paid: number;
  };
  canManage: boolean;
}) {
  const b = d.billing;
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function patch(action: "issue" | "send" | "cancel") {
    if (action === "cancel" && !confirm(b.cancelConfirm)) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/billing/documents/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
    router.refresh();
  }

  async function pay(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(
      [...fd.entries()].filter(([, v]) => v !== "")
    ) as Record<string, unknown>;
    body.client_id = doc.client_id;
    body.billing_document_id = doc.id;
    const res = await fetch("/api/billing/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
    router.refresh();
  }

  const forms: [string, string][] = [
    ["invoice", b.formInvoice],
    ["breakdown", b.formBreakdown],
    ["act", b.formAct],
  ];
  const remaining = Math.max(0, doc.total - doc.paid);
  const cancelled = doc.status === "cancelled";

  return (
    <div className="h-fit space-y-4">
      <section className="rounded-lg border border-line bg-card p-5">
        <h2 className="text-lg font-semibold">{b.print}</h2>
        <div className="mt-3 space-y-2">
          {forms.map(([form, name]) => (
            <div key={form} className="flex gap-2">
              <a
                href={`/print/billing/${doc.id}?form=${form}`}
                target="_blank"
                className={`${btnGhost} min-w-0 flex-1 truncate`}
              >
                {name}
              </a>
              <a
                href={`/api/billing/documents/${doc.id}/pdf?form=${form}`}
                className={`${btnGhost} w-16 shrink-0`}
                title={b.pdfDownload}
              >
                PDF
              </a>
            </div>
          ))}
        </div>
      </section>

      {canManage && !cancelled && (
        <section className="rounded-lg border border-line bg-card p-5">
          <h2 className="text-lg font-semibold">{b.status}</h2>
          <div className="mt-3 space-y-2">
            {["to_accrue", "prepared"].includes(doc.status) && (
              <button disabled={busy} onClick={() => patch("issue")} className={`${btnPrimary} w-full`}>
                {b.markIssued}
              </button>
            )}
            {doc.status === "issued" && (
              <button disabled={busy} onClick={() => patch("send")} className={`${btnPrimary} w-full`}>
                {b.markSent}
              </button>
            )}
            <button
              disabled={busy}
              onClick={() => patch("cancel")}
              className="block w-full rounded-md border border-red-200 bg-card px-3 py-2 text-sm text-red-700 transition hover:border-red-400"
            >
              {b.cancelDoc}
            </button>
          </div>
        </section>
      )}

      {canManage && !cancelled && (
        <form onSubmit={pay} className="rounded-lg border border-line bg-card p-5">
          <h2 className="text-lg font-semibold">{b.addPayment}</h2>
          <div className="mt-3 space-y-3">
            <label className={label}>
              {b.paymentAmount}, ₸ *
              <input
                name="amount"
                type="number"
                min="0.01"
                step="0.01"
                required
                defaultValue={remaining > 0 ? remaining.toFixed(2) : undefined}
                className={input}
              />
            </label>
            <label className={label}>
              {b.paymentMethod}
              <select name="method" className={input} defaultValue="bank">
                <option value="bank">{b.payBank}</option>
                <option value="cash">{b.payCash}</option>
                <option value="card">{b.payCard}</option>
                <option value="offset">{b.payOffset}</option>
              </select>
            </label>
            <label className={label}>
              {b.paymentDate}
              <input name="paid_at" type="date" className={input} />
            </label>
            <label className={label}>
              {b.bankReference}
              <input name="bank_reference" className={input} />
            </label>
            <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
              {d.common.save}
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
