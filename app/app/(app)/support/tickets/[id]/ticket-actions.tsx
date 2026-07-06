"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

const input =
  "rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none transition focus:border-accent";
const btnGhost =
  "rounded-md border border-line bg-card px-3 py-1.5 text-sm transition hover:border-accent hover:text-accent-ink disabled:opacity-60";

/** Назначение + рабочий статус + исходы тикета (решено удалённо / на обслуживание / отклонить). */
export function TicketActions({
  id,
  status,
  assignedTo,
  users,
  objects,
  requestTypes,
  labels,
}: {
  id: string;
  status: string;
  assignedTo: string | null;
  users: Option[];
  objects: Option[];
  requestTypes: [string, string][];
  labels: {
    assigned: string;
    statuses: Record<string, string>;
    resolveRemote: string;
    remoteConfirm: string;
    toService: string;
    reject: string;
    rejectConfirm: string;
    requestType: string;
    selectObjects: string;
    createRequests: string;
    needObjects: string;
    serviceHint: string;
    cancel: string;
    takeInProgress: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [serviceOpen, setServiceOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reqType, setReqType] = useState(requestTypes[0]?.[0] ?? "diagnostics");

  const open = ["new", "in_progress"].includes(status);

  async function call(url: string, method: string, body?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const res = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    } else {
      setServiceOpen(false);
    }
    setBusy(false);
    router.refresh();
  }

  function toggleObject(objId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(objId)) next.delete(objId);
      else next.add(objId);
      return next;
    });
  }

  return (
    <div className="rounded-lg border border-line bg-card p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm font-medium">
          {labels.assigned}
          <select
            value={assignedTo ?? ""}
            disabled={busy || !open}
            onChange={(e) =>
              call(`/api/support/tickets/${id}`, "PATCH", { assigned_to: e.target.value || null })
            }
            className={`${input} mt-1 block`}
          >
            <option value="">—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
        {status === "new" && (
          <button
            disabled={busy}
            onClick={() => call(`/api/support/tickets/${id}`, "PATCH", { status: "in_progress" })}
            className={btnGhost}
          >
            {labels.takeInProgress}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <button
            disabled={busy}
            onClick={() =>
              confirm(labels.remoteConfirm) &&
              call(`/api/support/tickets/${id}/resolve`, "POST", { outcome: "remote" })
            }
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
          >
            {labels.resolveRemote}
          </button>
          <button
            disabled={busy}
            onClick={() => setServiceOpen((v) => !v)}
            className={btnGhost}
          >
            {labels.toService}
          </button>
          <button
            disabled={busy}
            onClick={() =>
              confirm(labels.rejectConfirm) &&
              call(`/api/support/tickets/${id}/resolve`, "POST", { outcome: "rejected" })
            }
            className="rounded-md border border-red-200 bg-card px-3 py-1.5 text-sm text-red-700 transition hover:border-red-400 disabled:opacity-60"
          >
            {labels.reject}
          </button>
        </div>
      )}

      {open && serviceOpen && (
        <div className="mt-4 rounded-lg border border-line bg-paper/50 p-4">
          <p className="text-sm text-ink-dim">{labels.serviceHint}</p>
          <label className="mt-3 block text-sm font-medium">
            {labels.requestType}
            <select
              value={reqType}
              onChange={(e) => setReqType(e.target.value)}
              className={`${input} mt-1 block`}
            >
              {requestTypes.map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <div className="mt-3">
            <div className="text-sm font-medium">{labels.selectObjects}</div>
            {objects.length === 0 && <p className="mt-1 text-sm text-ink-dim">—</p>}
            <div className="mt-1 grid gap-1 sm:grid-cols-2">
              {objects.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(o.id)}
                    onChange={() => toggleObject(o.id)}
                    className="h-4 w-4"
                  />
                  {o.name}
                </label>
              ))}
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              disabled={busy || selected.size === 0}
              onClick={() =>
                call(`/api/support/tickets/${id}/resolve`, "POST", {
                  outcome: "service",
                  type: reqType,
                  object_ids: [...selected],
                })
              }
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
            >
              {labels.createRequests}
              {selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
            <button onClick={() => setServiceOpen(false)} className={btnGhost}>
              {labels.cancel}
            </button>
          </div>
          {selected.size === 0 && (
            <p className="mt-2 text-xs text-ink-dim">{labels.needObjects}</p>
          )}
        </div>
      )}
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
