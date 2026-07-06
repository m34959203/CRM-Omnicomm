"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Dict } from "@/lib/dict/ru";

type Option = { id: string; name: string };

export function NewTestingForm({
  d,
  clients,
  stock,
}: {
  d: Dict;
  clients: Option[];
  stock: { id: string; label: string }[];
}) {
  const s = d.service;
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState("");
  const [objects, setObjects] = useState<Option[]>([]);
  const [objectId, setObjectId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");

  async function onClientChange(id: string) {
    setClientId(id);
    setObjectId("");
    setObjects([]);
    if (!id) return;
    const res = await fetch(`/api/objects?client_id=${id}`);
    if (res.ok) setObjects(await res.json());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/service/testing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        object_id: objectId || null,
        equipment_ids: selected,
        note: note || null,
      }),
    });
    if (res.ok) {
      router.push("/service/testing");
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "error");
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
  const label = "block text-sm font-medium";

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">{s.newTesting}</h1>
      <form onSubmit={submit} className="mt-6 space-y-6">
        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            {s.testingTitle}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              {s.client} *
              <select
                required
                value={clientId}
                onChange={(e) => onClientChange(e.target.value)}
                className={input}
              >
                <option value="" disabled>
                  —
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {s.object}
              <select value={objectId} onChange={(e) => setObjectId(e.target.value)} className={input}>
                <option value="">—</option>
                {objects.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${label} sm:col-span-2`}>
              {s.selectUnits} *
              <select
                multiple
                required
                size={Math.min(8, Math.max(4, stock.length))}
                value={selected}
                onChange={(e) =>
                  setSelected(Array.from(e.target.selectedOptions).map((o) => o.value))
                }
                className={input}
              >
                {stock.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${label} sm:col-span-2`}>
              {s.note}
              <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
            </label>
          </div>
        </fieldset>

        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy || !clientId || selected.length === 0}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
          >
            {d.common.create}
          </button>
          <Link
            href="/service/testing"
            className="rounded-md border border-line bg-card px-4 py-2 text-sm transition hover:border-accent"
          >
            {d.common.cancel}
          </Link>
        </div>
      </form>
    </div>
  );
}
