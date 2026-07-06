"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

const input =
  "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
const label = "block text-sm font-medium";

export function CallForm({
  clients,
  requests,
  labels,
}: {
  clients: Option[];
  requests: Option[];
  labels: {
    add: string;
    direction: string;
    directions: Record<string, string>;
    phone: string;
    client: string;
    request: string;
    durationSec: string;
    result: string;
    save: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries([...fd.entries()].filter(([, v]) => v !== ""));
    const res = await fetch("/api/support/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink"
      >
        {labels.add}
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-3 w-full rounded-lg border border-line bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          {labels.direction}
          <select name="direction" defaultValue="incoming" className={input}>
            {Object.entries(labels.directions).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          {labels.phone} *
          <input name="phone" required className={input} />
        </label>
        <label className={label}>
          {labels.durationSec}
          <input name="duration_sec" type="number" min={0} defaultValue={0} className={input} />
        </label>
        <label className={label}>
          {labels.client}
          <select name="client_id" defaultValue="" className={input}>
            <option value="">—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          {labels.request}
          <select name="request_id" defaultValue="" className={input}>
            <option value="">—</option>
            {requests.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          {labels.result}
          <input name="result" className={input} />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
        >
          {labels.save}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent"
        >
          ✕
        </button>
      </div>
    </form>
  );
}

export function CallRowActions({ id, deleteLabel }: { id: string; deleteLabel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!confirm(`${deleteLabel}?`)) return;
    setBusy(true);
    await fetch(`/api/support/calls/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }
  return (
    <button
      disabled={busy}
      onClick={remove}
      className="rounded border border-red-200 bg-card px-2 py-1 text-xs text-red-700 transition hover:border-red-400 disabled:opacity-60"
    >
      {deleteLabel}
    </button>
  );
}
