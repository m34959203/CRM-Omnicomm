"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Labels = {
  conserve: string;
  resume: string;
  markDelete: string;
  finalDelete: string;
};

export function LinkRowActions({
  id,
  syncStatus,
  receptionEnabled,
  canDelete,
  labels,
}: {
  id: string;
  syncStatus: string;
  receptionEnabled: boolean;
  canDelete: boolean;
  labels: Labels;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(path: string, body?: unknown) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/telematics/objects/${id}/${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
    router.refresh();
  }

  if (syncStatus === "deleted") return null;

  const btn =
    "rounded border border-line bg-card px-2 py-1 text-xs transition hover:border-accent hover:text-accent-ink disabled:opacity-60 whitespace-nowrap";

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-1.5">
        {syncStatus !== "pending_delete" && (
          <button
            disabled={busy}
            onClick={() => call("conservation", { enabled: !receptionEnabled })}
            className={btn}
          >
            {receptionEnabled ? labels.conserve : labels.resume}
          </button>
        )}
        {syncStatus !== "pending_delete" && canDelete && (
          <button
            disabled={busy}
            onClick={() => call("mark-delete")}
            className={`${btn} text-amber-700`}
          >
            {labels.markDelete}
          </button>
        )}
        {syncStatus === "pending_delete" && canDelete && (
          <button
            disabled={busy}
            onClick={() => {
              if (confirm(`${labels.finalDelete}?`)) call("delete");
            }}
            className={`${btn} border-red-200 text-red-700 hover:border-red-400`}
          >
            {labels.finalDelete}
          </button>
        )}
      </div>
      {error && <span className="max-w-60 text-[11px] text-red-700">{error}</span>}
    </div>
  );
}
