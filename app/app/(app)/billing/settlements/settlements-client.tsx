"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/lib/dict/ru";

type Option = { id: string; name: string };
type DocOption = {
  id: string;
  number: string | null;
  client_id: string;
  total: string;
  paid_amount: string;
};

const input =
  "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
const label = "block text-sm font-medium";

export function PaymentForm({
  d,
  clients,
  docs,
}: {
  d: Dict;
  clients: Option[];
  docs: DocOption[];
}) {
  const b = d.billing;
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const clientDocs = docs.filter((doc) => doc.client_id === clientId);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOkMsg("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    const body = Object.fromEntries(
      [...fd.entries()].filter(([, v]) => v !== "")
    ) as Record<string, unknown>;
    const res = await fetch("/api/billing/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setOkMsg("OK");
      form.reset();
      setClientId("");
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="h-fit rounded-lg border border-line bg-card p-5">
      <h2 className="text-lg font-semibold">{b.addPayment}</h2>
      <div className="mt-4 space-y-3">
        <label className={label}>
          {b.client} *
          <select
            name="client_id"
            required
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className={input}
          >
            <option value="" disabled>—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          {b.paymentAmount}, ₸ *
          <input name="amount" type="number" min="0.01" step="0.01" required className={input} />
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
          {b.linkedDoc}
          <select name="billing_document_id" className={input} defaultValue="">
            <option value="">—</option>
            {clientDocs.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.number ?? doc.id.slice(0, 8)} ({Number(doc.total).toLocaleString("ru-RU")} ₸
                {Number(doc.paid_amount) > 0
                  ? `, оплачено ${Number(doc.paid_amount).toLocaleString("ru-RU")} ₸`
                  : ""}
                )
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          {b.bankReference}
          <input name="bank_reference" className={input} />
        </label>
        <label className={label}>
          {d.telematics.note}
          <textarea name="note" rows={2} className={input} />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        {okMsg && <p className="text-sm text-accent-ink">{okMsg}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
        >
          {d.common.save}
        </button>
      </div>
    </form>
  );
}
