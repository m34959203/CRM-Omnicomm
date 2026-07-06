"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TestingRowActions({
  id,
  labels,
}: {
  id: string;
  labels: { sale: string; refusal: string; saleConfirm: string; refusalConfirm: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function complete(result: "sale" | "refusal") {
    if (!confirm(result === "sale" ? labels.saleConfirm : labels.refusalConfirm)) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/service/testing/${id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
    router.refresh();
  }

  const btn =
    "rounded border border-line bg-card px-2 py-1 text-xs transition hover:border-accent hover:text-accent-ink disabled:opacity-60 whitespace-nowrap";

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex gap-1.5">
        <button disabled={busy} onClick={() => complete("sale")} className={`${btn} text-ok`}>
          {labels.sale}
        </button>
        <button disabled={busy} onClick={() => complete("refusal")} className={`${btn} text-danger`}>
          {labels.refusal}
        </button>
      </div>
      {error && <span className="max-w-60 text-[11px] text-red-700">{error}</span>}
    </div>
  );
}
