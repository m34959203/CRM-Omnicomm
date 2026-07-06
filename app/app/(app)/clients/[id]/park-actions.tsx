"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type Option = { id: string; name: string };

type Labels = {
  setState: string;
  stateActive: string;
  stateConservation: string;
  stateDisabled: string;
  transferClient: string;
  moveObject: string;
  targetClient: string;
  targetObject: string;
  apply: string;
  confirmTransfer: string;
  confirmMove: string;
  cancel: string;
};

/**
 * Операции над установленной единицей из карточки клиента:
 * установка состояния (ESH-переход + best-effort СМ), перенос на другой
 * объект клиента, перевод другому клиенту (перепродажа техники).
 */
export function ParkActions({
  equipmentId,
  currentState,
  objectId,
  objects,
  clients,
  labels,
}: {
  equipmentId: string;
  currentState: string | null;
  objectId: string | null;
  objects: Option[];
  clients: Option[];
  labels: Labels;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"" | "state" | "move" | "transfer">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState(currentState ?? "active");
  const [moveObject, setMoveObject] = useState("");
  const [transferClient, setTransferClient] = useState("");
  const [transferObjects, setTransferObjects] = useState<Option[]>([]);
  const [transferObject, setTransferObject] = useState("");

  async function post(path: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError("");
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      return false;
    }
    setMode("");
    router.refresh();
    return true;
  }

  async function loadObjects(clientId: string) {
    setTransferClient(clientId);
    setTransferObject("");
    setTransferObjects([]);
    if (!clientId) return;
    const res = await fetch(`/api/objects?client_id=${clientId}`);
    if (res.ok) {
      const rows = (await res.json()) as Option[];
      setTransferObjects(rows.map((o) => ({ id: o.id, name: o.name })));
    }
  }

  const btn =
    "rounded border border-line bg-card px-2 py-1 text-xs transition hover:border-accent hover:text-accent-ink disabled:opacity-60 whitespace-nowrap";
  const sel =
    "rounded border border-line bg-card px-2 py-1 text-xs outline-none transition focus:border-accent";
  const stateOptions: [string, string][] = [
    ["active", labels.stateActive],
    ["conservation", labels.stateConservation],
    ["disabled", labels.stateDisabled],
  ];

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          disabled={busy}
          className={`${btn} ${mode === "state" ? "border-accent text-accent-ink" : ""}`}
          onClick={() => setMode(mode === "state" ? "" : "state")}
        >
          {labels.setState}
        </button>
        <button
          disabled={busy}
          className={`${btn} ${mode === "move" ? "border-accent text-accent-ink" : ""}`}
          onClick={() => setMode(mode === "move" ? "" : "move")}
        >
          {labels.moveObject}
        </button>
        <button
          disabled={busy}
          className={`${btn} ${mode === "transfer" ? "border-accent text-accent-ink" : ""}`}
          onClick={() => setMode(mode === "transfer" ? "" : "transfer")}
        >
          {labels.transferClient}
        </button>
      </div>

      {mode === "state" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <select value={state} onChange={(e) => setState(e.target.value)} className={sel}>
            {stateOptions.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button
            disabled={busy || state === (currentState ?? "")}
            className={btn}
            onClick={() => post(`/api/equipment/${equipmentId}/state`, { state })}
          >
            {labels.apply}
          </button>
        </div>
      )}

      {mode === "move" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={moveObject}
            onChange={(e) => setMoveObject(e.target.value)}
            className={sel}
          >
            <option value="">{labels.targetObject}…</option>
            {objects
              .filter((o) => o.id !== objectId)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
          </select>
          <button
            disabled={busy || !moveObject}
            className={btn}
            onClick={() => {
              if (confirm(labels.confirmMove)) {
                post(`/api/equipment/${equipmentId}/transfer`, { to_object_id: moveObject });
              }
            }}
          >
            {labels.apply}
          </button>
        </div>
      )}

      {mode === "transfer" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={transferClient}
            onChange={(e) => loadObjects(e.target.value)}
            className={sel}
          >
            <option value="">{labels.targetClient}…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={transferObject}
            onChange={(e) => setTransferObject(e.target.value)}
            className={sel}
            disabled={!transferClient}
          >
            <option value="">{labels.targetObject}…</option>
            {transferObjects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <button
            disabled={busy || !transferClient || !transferObject}
            className={btn}
            onClick={() => {
              if (confirm(labels.confirmTransfer)) {
                post(`/api/equipment/${equipmentId}/transfer`, {
                  to_client_id: transferClient,
                  to_object_id: transferObject,
                });
              }
            }}
          >
            {labels.apply}
          </button>
        </div>
      )}

      {error && <span className="max-w-72 text-[11px] text-red-700">{error}</span>}
    </div>
  );
}
