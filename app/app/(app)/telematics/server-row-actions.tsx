"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function ServerRowActions({
  id,
  checkLabel,
  importLabel,
}: {
  id: string;
  checkLabel: string;
  importLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  async function checkHealth() {
    setBusy(true);
    setResult("");
    const res = await fetch(`/api/telematics/servers/${id}/health`, {
      method: "POST",
    });
    const data = await res.json().catch(() => null);
    setResult(
      res.ok
        ? `${data.health_status} · ${data.ms} ms`
        : (data?.error ?? `HTTP ${res.status}`)
    );
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <button
        onClick={checkHealth}
        disabled={busy}
        className="rounded border border-line bg-card px-2 py-1 text-xs transition hover:border-accent hover:text-accent-ink disabled:opacity-60"
      >
        {busy ? "…" : checkLabel}
      </button>
      <Link
        href={`/telematics/${id}/import`}
        className="rounded border border-line bg-card px-2 py-1 text-xs transition hover:border-accent hover:text-accent-ink"
      >
        {importLabel}
      </Link>
      {result && <span className="text-[11px] text-ink-dim">{result}</span>}
    </div>
  );
}
