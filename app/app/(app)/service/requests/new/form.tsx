"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Dict } from "@/lib/dict/ru";

type Option = { id: string; name: string };
type UserOption = { id: string; full_name: string; role_code: string };

const TYPES = [
  "connect", "dismantle", "replace", "diagnostics", "gps_fault",
  "fuel_sensor_fault", "cctv_fault", "monitoring_setup", "consultation",
  "training", "integration", "bi_reporting", "commercial",
  "payment_question", "docs_question", "other",
];

export function NewRequestForm({
  d,
  clients,
  users,
}: {
  d: Dict;
  clients: Option[];
  users: UserOption[];
}) {
  const s = d.service;
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [objects, setObjects] = useState<Option[]>([]);

  async function onClientChange(clientId: string) {
    setObjects([]);
    if (!clientId) return;
    const res = await fetch(`/api/objects?client_id=${clientId}`);
    if (res.ok) setObjects(await res.json());
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries([...fd.entries()].filter(([, v]) => v !== ""));
    const res = await fetch("/api/service/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { id } = await res.json();
      router.push(`/service/requests/${id}`);
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "error");
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
  const label = "block text-sm font-medium";
  const installers = users.filter((u) => u.role_code === "installer");
  const managers = users.filter((u) => ["manager", "head", "admin"].includes(u.role_code));
  const supports = users.filter((u) => u.role_code === "support");

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">{s.newRequest}</h1>
      <form onSubmit={submit} className="mt-6 space-y-6">
        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            {s.requestsTitle}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              {s.client} *
              <select
                name="client_id"
                required
                className={input}
                defaultValue=""
                onChange={(e) => onClientChange(e.target.value)}
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
              <select name="object_id" className={input} defaultValue="">
                <option value="">—</option>
                {objects.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {s.type} *
              <select name="type" required className={input} defaultValue="">
                <option value="" disabled>
                  —
                </option>
                {TYPES.map((tp) => (
                  <option key={tp} value={tp}>
                    {(s.requestTypes as Record<string, string>)[tp]}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {s.priority}
              <select name="priority" className={input} defaultValue="normal">
                {(["low", "normal", "high", "critical"] as const).map((p) => (
                  <option key={p} value={p}>
                    {(s.priorities as Record<string, string>)[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {s.dueAt}
              <input name="due_at" type="datetime-local" className={input} />
            </label>
            <label className={`${label} sm:col-span-2`}>
              {s.subject}
              <input name="subject" className={input} />
            </label>
            <label className={`${label} sm:col-span-2`}>
              {s.description}
              <textarea name="description" rows={3} className={input} />
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            {s.performers}
          </legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className={label}>
              {s.manager}
              <select name="manager_id" className={input} defaultValue="">
                <option value="">—</option>
                {managers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {s.support}
              <select name="support_id" className={input} defaultValue="">
                <option value="">—</option>
                {supports.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              {s.installer}
              <select name="installer_id" className={input} defaultValue="">
                <option value="">—</option>
                {installers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
          >
            {d.common.create}
          </button>
          <Link
            href="/service/requests"
            className="rounded-md border border-line bg-card px-4 py-2 text-sm transition hover:border-accent"
          >
            {d.common.cancel}
          </Link>
        </div>
      </form>
    </div>
  );
}
