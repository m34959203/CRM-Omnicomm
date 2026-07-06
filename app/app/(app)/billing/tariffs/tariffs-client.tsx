"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/lib/dict/ru";

type Option = { id: string; name: string };
type ObjectOption = { id: string; name: string; client_name: string };

const input =
  "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
const label = "block text-sm font-medium";
const btnPrimary =
  "rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60";
const btnGhost =
  "rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink";

function useSubmit(url: string, onDone: () => void) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      onDone();
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
  }
  return { post, error, busy };
}

export function RowActions({
  endpoint,
  isActive,
  deleteLabel,
}: {
  endpoint: string;
  isActive: boolean;
  deleteLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    await fetch(endpoint, {
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
    const res = await fetch(endpoint, { method: "DELETE" });
    if (!res.ok) {
      alert((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
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

export function TariffForm({
  d,
  clients,
  categories,
  objects,
}: {
  d: Dict;
  clients: Option[];
  categories: Option[];
  objects: ObjectOption[];
}) {
  const b = d.billing;
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState("client");
  const [noCharge, setNoCharge] = useState(false);
  const { post, error, busy } = useSubmit("/api/billing/tariffs", () => setOpen(false));

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`mt-3 ${btnGhost}`}>
        {b.addTariff}
      </button>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(
      [...fd.entries()].filter(([, v]) => v !== "")
    ) as Record<string, unknown>;
    body.do_not_charge = fd.get("do_not_charge") === "on";
    await post(body);
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-line bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>
          {b.level}
          <select
            name="level"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className={input}
          >
            <option value="default">{b.levelDefault}</option>
            <option value="category">{b.levelCategory}</option>
            <option value="client">{b.levelClient}</option>
            <option value="object">{b.levelObject}</option>
          </select>
        </label>
        {level === "category" && (
          <label className={`${label} sm:col-span-2`}>
            {b.levelCategory} *
            <select name="category_id" required className={input} defaultValue="">
              <option value="" disabled>—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        {level === "client" && (
          <label className={`${label} sm:col-span-2`}>
            {b.levelClient} *
            <select name="client_id" required className={input} defaultValue="">
              <option value="" disabled>—</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        {level === "object" && (
          <label className={`${label} sm:col-span-2`}>
            {b.levelObject} *
            <select name="object_id" required className={input} defaultValue="">
              <option value="" disabled>—</option>
              {objects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.client_name} — {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className={label}>
          {b.method}
          <select name="method" className={input} defaultValue="activity">
            <option value="activity">{b.methodActivity}</option>
            <option value="subscription">{b.methodSubscription}</option>
            <option value="one_time">{b.methodOneTime}</option>
          </select>
        </label>
        <label className={label}>
          {b.amount}, ₸ {noCharge ? "" : "*"}
          <input
            name="amount"
            type="number"
            min={0}
            step="0.01"
            required={!noCharge}
            disabled={noCharge}
            className={input}
          />
        </label>
        <label className={`${label} flex items-end gap-2 pb-2`}>
          <input
            name="do_not_charge"
            type="checkbox"
            checked={noCharge}
            onChange={(e) => setNoCharge(e.target.checked)}
          />
          {b.doNotCharge}
        </label>
        <label className={label}>
          {b.validFrom}
          <input name="valid_from" type="date" className={input} />
        </label>
        <label className={label}>
          {b.validTo}
          <input name="valid_to" type="date" className={input} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex gap-3">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {d.common.save}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
          ✕
        </button>
      </div>
    </form>
  );
}

type PlanItem = { method: string; name: string; amount: string };

export function PlanForm({ d }: { d: Dict }) {
  const b = d.billing;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [items, setItems] = useState<PlanItem[]>([
    { method: "activity", name: "", amount: "" },
  ]);
  const { post, error, busy } = useSubmit("/api/billing/plans", () => {
    setOpen(false);
    setName("");
    setItems([{ method: "activity", name: "", amount: "" }]);
  });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`mt-3 ${btnGhost}`}>
        {b.addPlan}
      </button>
    );
  }

  function setItem(i: number, patch: Partial<PlanItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await post({
      name,
      items: items
        .filter((i) => i.amount !== "")
        .map((i) => ({ method: i.method, name: i.name || undefined, amount: Number(i.amount) })),
    });
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-line bg-card p-5">
      <label className={label}>
        {b.planName} *
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${input} max-w-md`}
        />
      </label>
      <div className="mt-4 space-y-2">
        <div className="text-sm font-medium">{b.planItems}</div>
        {items.map((it, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <select
              value={it.method}
              onChange={(e) => setItem(i, { method: e.target.value })}
              className="rounded-md border border-line bg-card px-2 py-1.5 text-sm"
            >
              <option value="activity">{b.methodActivity}</option>
              <option value="subscription">{b.methodSubscription}</option>
              <option value="one_time">{b.methodOneTime}</option>
            </select>
            <input
              placeholder={b.itemName}
              value={it.name}
              onChange={(e) => setItem(i, { name: e.target.value })}
              className="w-56 rounded-md border border-line bg-card px-2 py-1.5 text-sm"
            />
            <input
              placeholder={`${b.amount}, ₸`}
              type="number"
              min={0}
              step="0.01"
              required
              value={it.amount}
              onChange={(e) => setItem(i, { amount: e.target.value })}
              className="w-36 rounded-md border border-line bg-card px-2 py-1.5 text-sm"
            />
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-sm text-red-700"
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, { method: "activity", name: "", amount: "" }])}
          className="text-sm text-accent-ink"
        >
          + {b.addItem}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex gap-3">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {d.common.save}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
          ✕
        </button>
      </div>
    </form>
  );
}

export function DiscountForm({ d, clients }: { d: Dict; clients: Option[] }) {
  const b = d.billing;
  const [open, setOpen] = useState(false);
  const { post, error, busy } = useSubmit("/api/billing/discounts", () => setOpen(false));

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`mt-3 ${btnGhost}`}>
        {b.addDiscount}
      </button>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await post(
      Object.fromEntries([...fd.entries()].filter(([, v]) => v !== "")) as Record<string, unknown>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-line bg-card p-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>
          {b.client} *
          <select name="client_id" required className={input} defaultValue="">
            <option value="" disabled>—</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          {d.clients.name}
          <input name="name" className={input} />
        </label>
        <label className={label}>
          {b.discountTotal}, ₸ *
          <input name="total_amount" type="number" min={0.01} step="0.01" required className={input} />
        </label>
        <label className={label}>
          {b.validFrom}
          <input name="valid_from" type="date" className={input} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex gap-3">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {d.common.save}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
          ✕
        </button>
      </div>
    </form>
  );
}
