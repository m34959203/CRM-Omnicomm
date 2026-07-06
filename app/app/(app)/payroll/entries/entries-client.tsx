"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

const input =
  "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
const label = "block text-sm font-medium";

/** Ручное добавление компенсации/удержания. */
export function EntryForm({
  users,
  labels,
}: {
  users: Option[];
  labels: {
    add: string;
    performer: string;
    kind: string;
    compensation: string;
    deduction: string;
    amount: string;
    reason: string;
    date: string;
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
    const res = await fetch("/api/payroll/entries", {
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
      <div className="grid gap-3 sm:grid-cols-5">
        <label className={label}>
          {labels.performer} *
          <select name="user_id" required defaultValue="" className={input}>
            <option value="" disabled>—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          {labels.kind}
          <select name="kind" defaultValue="compensation" className={input}>
            <option value="compensation">{labels.compensation}</option>
            <option value="deduction">{labels.deduction}</option>
          </select>
        </label>
        <label className={label}>
          {labels.amount} *
          <input name="amount" type="number" min="0.01" step="0.01" required className={input} />
        </label>
        <label className={label}>
          {labels.reason}
          <input name="reason" className={input} />
        </label>
        <label className={label}>
          {labels.date}
          <input name="entry_date" type="date" className={input} />
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
