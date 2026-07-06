"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

const input =
  "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
const label = "block text-sm font-medium";
const btnPrimary =
  "rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60";

export function RuleForm({
  clients,
  categories,
  labels,
}: {
  clients: Option[];
  categories: Option[];
  labels: {
    addRule: string;
    scope: string;
    scopeDefault: string;
    scopeCategory: string;
    scopeClient: string;
    advance: string;
    credit: string;
    allowedDebt: string;
    warnDays: string;
    save: string;
    name: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("default");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(
      [...fd.entries()].filter(([, v]) => v !== "")
    ) as Record<string, unknown>;
    const res = await fetch("/api/telematics/blocking/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "Ошибка сохранения");
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
      >
        {labels.addRule}
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="mt-3 rounded-lg border border-line bg-card p-5"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={`${label} sm:col-span-2`}>
          {labels.name} *
          <input name="name" required className={input} />
        </label>
        <label className={label}>
          {labels.scope}
          <select
            name="scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className={input}
          >
            <option value="default">{labels.scopeDefault}</option>
            <option value="category">{labels.scopeCategory}</option>
            <option value="client">{labels.scopeClient}</option>
          </select>
        </label>
        {scope === "category" && (
          <label className={`${label} sm:col-span-3`}>
            {labels.scopeCategory} *
            <select name="category_id" required className={input} defaultValue="">
              <option value="" disabled>
                —
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {scope === "client" && (
          <label className={`${label} sm:col-span-3`}>
            {labels.scopeClient} *
            <select name="client_id" required className={input} defaultValue="">
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
        )}
        <label className={label}>
          {labels.advance}
          <input name="advance_grace_days" type="number" min={0} defaultValue={0} className={input} />
        </label>
        <label className={label}>
          {labels.credit}
          <input name="credit_grace_days" type="number" min={0} defaultValue={0} className={input} />
        </label>
        <label className={label}>
          {labels.allowedDebt}
          <input name="allowed_debt" type="number" min={0} step="0.01" defaultValue={0} className={input} />
        </label>
        <label className="block text-sm font-medium">
          Отключать ТС через, дн. после блокировки
          <input name="disable_objects_after_days" type="number" min={0} placeholder="не отключать" className={input} />
        </label>
        <label className={label}>
          {labels.warnDays}
          <input name="warn_days_before" type="number" min={0} defaultValue={3} className={input} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex gap-3">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {labels.save}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-line bg-card px-4 py-2 text-sm transition hover:border-accent"
        >
          ✕
        </button>
      </div>
    </form>
  );
}

export function RuleRowActions({
  id,
  isActive,
  deleteLabel,
}: {
  id: string;
  isActive: boolean;
  deleteLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    await fetch(`/api/telematics/blocking/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !isActive }),
    });
    setBusy(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`${deleteLabel}?`)) return;
    setBusy(true);
    await fetch(`/api/telematics/blocking/rules/${id}`, { method: "DELETE" });
    setBusy(false);
    router.refresh();
  }

  const btn =
    "rounded border border-line bg-card px-2 py-1 text-xs transition hover:border-accent hover:text-accent-ink disabled:opacity-60";

  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <button disabled={busy} onClick={toggle} className={btn}>
        {isActive ? "выкл" : "вкл"}
      </button>
      <button
        disabled={busy}
        onClick={remove}
        className={`${btn} border-red-200 text-red-700 hover:border-red-400`}
      >
        {deleteLabel}
      </button>
    </div>
  );
}

export function AutoBlockButton({
  labels,
}: {
  labels: { run: string; done: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/jobs/auto-block", { method: "POST" });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      const ev = (data?.events ?? []) as { action: string }[];
      const cnt = (a: string) => ev.filter((e) => e.action === a).length;
      setMsg(
        `${labels.done}: warning ${cnt("warning")}, block ${cnt("block")}, unblock ${cnt("unblock")}`
      );
      router.refresh();
    } else {
      setMsg(data?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex items-center gap-3">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink disabled:opacity-60"
      >
        {busy ? "…" : labels.run}
      </button>
      {msg && <span className="text-sm text-ink-dim">{msg}</span>}
    </span>
  );
}

export function ManualBlockForm({
  clients,
  labels,
}: {
  clients: Option[];
  labels: {
    title: string;
    client: string;
    block: string;
    unblock: string;
    unblockUntil: string;
    note: string;
  };
}) {
  const router = useRouter();
  const [action, setAction] = useState<"block" | "unblock">("block");
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setOkMsg("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(
      [...fd.entries()].filter(([, v]) => v !== "")
    ) as Record<string, unknown>;
    body.action = action;
    const res = await fetch("/api/telematics/blocking/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setOkMsg(`OK: ${(data?.processed ?? []).join(", ")}`);
      router.refresh();
    } else {
      setError(data?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
  }

  return (
    <form
      onSubmit={submit}
      className="h-fit rounded-lg border border-line bg-card p-5"
    >
      <h2 className="text-lg font-semibold">{labels.title}</h2>
      <div className="mt-4 space-y-4">
        <label className={label}>
          {labels.client} *
          <select name="client_id" required className={input} defaultValue="">
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAction("block")}
            className={
              action === "block"
                ? "flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-semibold text-white"
                : "flex-1 rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent"
            }
          >
            {labels.block}
          </button>
          <button
            type="button"
            onClick={() => setAction("unblock")}
            className={
              action === "unblock"
                ? "flex-1 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white"
                : "flex-1 rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent"
            }
          >
            {labels.unblock}
          </button>
        </div>
        {action === "unblock" && (
          <label className={label}>
            {labels.unblockUntil}
            <input name="unblock_until" type="date" className={input} />
          </label>
        )}
        <label className={label}>
          {labels.note}
          <textarea name="note" rows={2} className={input} />
        </label>
        {error && <p className="text-sm text-danger">{error}</p>}
        {okMsg && <p className="text-sm text-accent-ink">{okMsg}</p>}
        <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? "…" : action === "block" ? labels.block : labels.unblock}
        </button>
      </div>
    </form>
  );
}
