"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Dict } from "@/lib/dict/ru";

type Option = { id: string; name: string };
type Trip = {
  date_from: string;
  date_to: string;
  transport: string;
  cost: string;
  include_in_cost: boolean;
};

export function NewOrderForm({
  d,
  clients,
  installers,
  request,
  initialObjects,
}: {
  d: Dict;
  clients: Option[];
  installers: { id: string; full_name: string }[];
  request: { id: string; number: string; client_id: string; object_id: string | null } | null;
  initialObjects: Option[];
}) {
  const s = d.service;
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState(request?.client_id ?? "");
  const [objects, setObjects] = useState<Option[]>(initialObjects);
  const [objectId, setObjectId] = useState(request?.object_id ?? "");
  const [address, setAddress] = useState("");
  const [performers, setPerformers] = useState<string[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);

  // клиент → объекты клиента + автоподстановка последнего адреса нарядов
  async function onClientChange(id: string) {
    setClientId(id);
    setObjectId("");
    setObjects([]);
    if (!id) return;
    const [objRes, addrRes] = await Promise.all([
      fetch(`/api/objects?client_id=${id}`),
      fetch(`/api/service/orders/last-address?client_id=${id}`),
    ]);
    if (objRes.ok) setObjects(await objRes.json());
    if (addrRes.ok) {
      const j = await addrRes.json();
      if (j.address) setAddress((prev) => prev || j.address);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries(
      [...fd.entries()].filter(([, v]) => v !== "")
    );
    body.request_id = request?.id;
    body.performers = performers;
    body.trips = trips
      .filter((tr) => tr.date_from && tr.date_to)
      .map((tr) => ({ ...tr, cost: Number(tr.cost) || 0 }));
    const res = await fetch("/api/service/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { id } = await res.json();
      router.push(`/service/orders/${id}`);
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
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">{s.newOrder}</h1>
      {request && (
        <p className="mt-1 text-sm text-ink-dim">
          {s.fromRequest}: <span className="font-mono">{request.number}</span>
        </p>
      )}
      <form onSubmit={submit} className="mt-6 space-y-6">
        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            {s.workOrder}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              {s.client} *
              <select
                name="client_id"
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
              <select
                name="object_id"
                value={objectId}
                onChange={(e) => setObjectId(e.target.value)}
                className={input}
              >
                <option value="">—</option>
                {objects.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${label} sm:col-span-2`}>
              {s.address}
              <input
                name="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={input}
              />
            </label>
            <label className={label}>
              {s.scheduledStart}
              <input name="scheduled_start" type="datetime-local" className={input} />
            </label>
            <label className={label}>
              {s.scheduledEnd}
              <input name="scheduled_end" type="datetime-local" className={input} />
            </label>
            <label className={`${label} sm:col-span-2`}>
              {s.note}
              <input name="note" className={input} />
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            {s.performers}
          </legend>
          <div className="flex flex-wrap gap-3">
            {installers.map((u) => (
              <label key={u.id} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={performers.includes(u.id)}
                  onChange={(e) =>
                    setPerformers((prev) =>
                      e.target.checked ? [...prev, u.id] : prev.filter((p) => p !== u.id)
                    )
                  }
                  className="accent-[var(--accent)]"
                />
                {u.full_name}
              </label>
            ))}
            {installers.length === 0 && (
              <span className="text-sm text-ink-dim">{s.noInstallers}</span>
            )}
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            {s.trips}
          </legend>
          <div className="space-y-3">
            {trips.map((tr, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <label className="text-xs text-ink-dim">
                  {s.dateFrom}
                  <input
                    type="date"
                    value={tr.date_from}
                    onChange={(e) =>
                      setTrips((p) => p.map((x, j) => (j === i ? { ...x, date_from: e.target.value } : x)))
                    }
                    className={`${input} mt-0.5`}
                  />
                </label>
                <label className="text-xs text-ink-dim">
                  {s.dateTo}
                  <input
                    type="date"
                    value={tr.date_to}
                    onChange={(e) =>
                      setTrips((p) => p.map((x, j) => (j === i ? { ...x, date_to: e.target.value } : x)))
                    }
                    className={`${input} mt-0.5`}
                  />
                </label>
                <label className="text-xs text-ink-dim">
                  {s.transport}
                  <input
                    value={tr.transport}
                    onChange={(e) =>
                      setTrips((p) => p.map((x, j) => (j === i ? { ...x, transport: e.target.value } : x)))
                    }
                    className={`${input} mt-0.5 w-36`}
                  />
                </label>
                <label className="text-xs text-ink-dim">
                  {s.cost}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={tr.cost}
                    onChange={(e) =>
                      setTrips((p) => p.map((x, j) => (j === i ? { ...x, cost: e.target.value } : x)))
                    }
                    className={`${input} mt-0.5 w-28`}
                  />
                </label>
                <label className="flex items-center gap-1.5 pb-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tr.include_in_cost}
                    onChange={(e) =>
                      setTrips((p) =>
                        p.map((x, j) => (j === i ? { ...x, include_in_cost: e.target.checked } : x))
                      )
                    }
                    className="accent-[var(--accent)]"
                  />
                  {s.includeInCost}
                </label>
                <button
                  type="button"
                  onClick={() => setTrips((p) => p.filter((_, j) => j !== i))}
                  className="pb-2 text-sm text-danger hover:underline"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                setTrips((p) => [
                  ...p,
                  { date_from: "", date_to: "", transport: "", cost: "", include_in_cost: true },
                ])
              }
              className="rounded border border-line bg-card px-2 py-1 text-xs transition hover:border-accent hover:text-accent-ink"
            >
              + {s.addTrip}
            </button>
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
            href="/service/orders"
            className="rounded-md border border-line bg-card px-4 py-2 text-sm transition hover:border-accent"
          >
            {d.common.cancel}
          </Link>
        </div>
      </form>
    </div>
  );
}
