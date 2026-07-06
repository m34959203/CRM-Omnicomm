"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/lib/dict/ru";

type Performer = { user_id: string; full_name: string; is_lead: boolean };
type Trip = { id: string; date_from: string; date_to: string };
type Option = { id: string; full_name: string };

/** Действия наряда: статус, исполнители, командировки, передача оборудования, создание акта. */
export function OrderActions({
  id,
  status,
  performers,
  trips,
  installers,
  stock,
  s,
  common,
}: {
  id: string;
  status: string;
  performers: Performer[];
  trips: Trip[];
  installers: Option[];
  stock: { id: string; label: string }[];
  s: Dict["service"];
  common: { save: string; delete: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addUser, setAddUser] = useState("");
  const [techId, setTechId] = useState("");
  const [selectedEq, setSelectedEq] = useState<string[]>([]);
  const [trip, setTrip] = useState({ date_from: "", date_to: "", transport: "", cost: "" });

  async function call(method: string, path: string, body?: unknown) {
    setBusy(true);
    setError("");
    const res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      return null;
    }
    router.refresh();
    return res.json().catch(() => ({}));
  }

  const done = ["done", "cancelled"].includes(status);
  const input =
    "rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none transition focus:border-accent";
  const btn =
    "rounded border border-line bg-card px-2.5 py-1.5 text-sm transition hover:border-accent hover:text-accent-ink disabled:opacity-50";

  return (
    <div className="space-y-5 rounded-lg border border-line bg-card p-5">
      {/* статус + акт */}
      <div className="flex flex-wrap items-center gap-2">
        {!done && status !== "in_progress" && (
          <button
            disabled={busy}
            onClick={() => call("PATCH", `/api/service/orders/${id}`, { status: "in_progress" })}
            className={btn}
          >
            {(s.orderStatuses as Record<string, string>).in_progress} →
          </button>
        )}
        {!done && (
          <>
            <button
              disabled={busy}
              onClick={async () => {
                const res = await call("POST", `/api/service/orders/${id}/acts`, {});
                if (res?.id) router.push(`/service/acts/${res.id}`);
              }}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-50"
            >
              {s.createAct}
            </button>
            <button
              disabled={busy}
              onClick={() => call("PATCH", `/api/service/orders/${id}`, { status: "cancelled" })}
              className={`${btn} text-danger`}
            >
              {(s.orderStatuses as Record<string, string>).cancelled}
            </button>
          </>
        )}
      </div>

      {/* исполнители */}
      {!done && (
        <div className="border-t border-line pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
            {s.performers}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {performers.map((p) => (
              <span
                key={p.user_id}
                className="flex items-center gap-1 rounded border border-line bg-paper px-2 py-1 text-sm"
              >
                {p.full_name}
                <button
                  disabled={busy}
                  onClick={() =>
                    call("DELETE", `/api/service/orders/${id}/performers`, { user_id: p.user_id })
                  }
                  className="text-ink-dim hover:text-danger"
                  title={common.delete}
                >
                  ×
                </button>
              </span>
            ))}
            <select value={addUser} onChange={(e) => setAddUser(e.target.value)} className={input}>
              <option value="">{s.addPerformer}…</option>
              {installers
                .filter((u) => !performers.some((p) => p.user_id === u.id))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
            </select>
            <button
              disabled={busy || !addUser}
              onClick={async () => {
                await call("POST", `/api/service/orders/${id}/performers`, {
                  user_id: addUser,
                  is_lead: performers.length === 0,
                });
                setAddUser("");
              }}
              className={btn}
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* командировки */}
      {!done && (
        <div className="border-t border-line pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
            {s.addTrip}
          </h3>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={trip.date_from}
              onChange={(e) => setTrip({ ...trip, date_from: e.target.value })}
              className={input}
            />
            <input
              type="date"
              value={trip.date_to}
              onChange={(e) => setTrip({ ...trip, date_to: e.target.value })}
              className={input}
            />
            <input
              placeholder={s.transport}
              value={trip.transport}
              onChange={(e) => setTrip({ ...trip, transport: e.target.value })}
              className={`${input} w-32`}
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder={s.cost}
              value={trip.cost}
              onChange={(e) => setTrip({ ...trip, cost: e.target.value })}
              className={`${input} w-28`}
            />
            <button
              disabled={busy || !trip.date_from || !trip.date_to}
              onClick={async () => {
                await call("POST", `/api/service/orders/${id}/trips`, {
                  ...trip,
                  cost: Number(trip.cost) || 0,
                });
                setTrip({ date_from: "", date_to: "", transport: "", cost: "" });
              }}
              className={btn}
            >
              +
            </button>
            {trips.map((tr) => (
              <button
                key={tr.id}
                disabled={busy}
                onClick={() => call("DELETE", `/api/service/orders/${id}/trips`, { trip_id: tr.id })}
                className="text-xs text-ink-dim hover:text-danger"
                title={common.delete}
              >
                {tr.date_from.slice(0, 10)} ×
              </button>
            ))}
          </div>
        </div>
      )}

      {/* передача оборудования технику */}
      {!done && (
        <div className="border-t border-line pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-dim">
            {s.transferEquipment}
          </h3>
          <div className="mt-2 flex flex-wrap items-start gap-2">
            <select value={techId} onChange={(e) => setTechId(e.target.value)} className={input}>
              <option value="">{s.technician}…</option>
              {(performers.length > 0
                ? performers.map((p) => ({ id: p.user_id, full_name: p.full_name }))
                : installers
              ).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
            <select
              multiple
              size={Math.min(6, Math.max(3, stock.length))}
              value={selectedEq}
              onChange={(e) =>
                setSelectedEq(Array.from(e.target.selectedOptions).map((o) => o.value))
              }
              className={`${input} min-w-72`}
              title={s.selectUnits}
            >
              {stock.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.label}
                </option>
              ))}
            </select>
            <button
              disabled={busy || !techId || selectedEq.length === 0}
              onClick={async () => {
                await call("POST", `/api/service/orders/${id}/transfer-equipment`, {
                  technician_id: techId,
                  equipment_ids: selectedEq,
                });
                setSelectedEq([]);
              }}
              className={btn}
            >
              {s.transfer}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
