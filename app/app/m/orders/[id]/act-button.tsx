"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** «Создать акт» из наряда: POST (идемпотентен для техника) → переход к акту. */
export function CreateActButton({ orderId, label }: { orderId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          const res = await fetch(`/api/service/orders/${orderId}/acts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
          if (!res.ok) {
            setBusy(false);
            setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
            return;
          }
          const { id } = (await res.json()) as { id: string };
          router.push(`/m/acts/${id}`);
        }}
        className="flex min-h-13 w-full items-center justify-center gap-2 rounded-xl border border-accent/50 bg-accent/10 px-4 text-sm font-semibold text-accent transition active:scale-[0.98] disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
          <path d="M12 5v14M5 12h14" strokeLinecap="round" />
        </svg>
        {busy ? "…" : label}
      </button>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
