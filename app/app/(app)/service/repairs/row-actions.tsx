"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RepairRowActions({ id, label }: { id: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function close() {
    if (!confirm(`${label}?`)) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/service/repairs/${id}/close`, { method: "POST" });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        disabled={busy}
        onClick={close}
        className="rounded border border-line bg-card px-2 py-1 text-xs transition hover:border-accent hover:text-accent-ink disabled:opacity-60 whitespace-nowrap"
      >
        {label}
      </button>
      {error && <span className="max-w-60 text-[11px] text-red-700">{error}</span>}
    </div>
  );
}
