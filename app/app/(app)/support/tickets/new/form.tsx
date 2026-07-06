"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

const input =
  "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
const label = "block text-sm font-medium";

export function TicketForm({
  clients,
  channels,
  labels,
}: {
  clients: Option[];
  channels: [string, string][];
  labels: {
    client: string;
    noClient: string;
    contact: string;
    channel: string;
    subject: string;
    description: string;
    save: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries([...fd.entries()].filter(([, v]) => v !== ""));
    const res = await fetch("/api/support/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (res.ok && data?.id) {
      router.push(`/support/tickets/${data.id}`);
    } else {
      setError(data?.error ?? `HTTP ${res.status}`);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 max-w-2xl rounded-lg border border-line bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          {labels.client}
          <select name="client_id" defaultValue="" className={input}>
            <option value="">{labels.noClient}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          {labels.channel}
          <select name="channel" defaultValue="phone" className={input}>
            {channels.map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className={`${label} sm:col-span-2`}>
          {labels.contact}
          <input name="contact" className={input} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          {labels.subject}
          <input name="subject" className={input} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          {labels.description}
          <textarea name="description" rows={4} className={input} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
      >
        {labels.save}
      </button>
    </form>
  );
}
