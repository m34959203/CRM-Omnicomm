"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

const input =
  "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
const label = "block text-sm font-medium";

/** Ручная заметка в журнал сообщений. */
export function MessageForm({
  clients,
  channels,
  labels,
}: {
  clients: Option[];
  channels: [string, string][];
  labels: {
    add: string;
    channel: string;
    direction: string;
    directionIn: string;
    directionOut: string;
    contact: string;
    client: string;
    text: string;
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
    const res = await fetch("/api/support/messages", {
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
      <div className="grid gap-3 sm:grid-cols-4">
        <label className={label}>
          {labels.channel}
          <select name="channel" defaultValue={channels[0]?.[0]} className={input}>
            {channels.map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          {labels.direction}
          <select name="direction" defaultValue="in" className={input}>
            <option value="in">{labels.directionIn}</option>
            <option value="out">{labels.directionOut}</option>
          </select>
        </label>
        <label className={label}>
          {labels.contact}
          <input name="contact" className={input} />
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
        <label className={`${label} sm:col-span-4`}>
          {labels.text} *
          <textarea name="text" rows={3} required className={input} />
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
