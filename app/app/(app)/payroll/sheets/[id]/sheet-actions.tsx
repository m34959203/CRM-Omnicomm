"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Действия ведомости: утвердить / выплачена (admin,head), отмена черновика. */
export function SheetActions({
  id,
  status,
  canApprove,
  canCancel,
  labels,
}: {
  id: string;
  status: string;
  canApprove: boolean;
  canCancel: boolean;
  labels: { approve: string; markPaid: string; cancel: string; cancelConfirm: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/payroll/sheets/${id}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      setBusy(false);
      router.refresh();
      return;
    }
    setBusy(false);
    if (method === "DELETE") router.push("/payroll/sheets");
    else router.refresh();
  }

  const btnPrimary =
    "rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60";
  const btnDanger =
    "rounded-md border border-red-200 bg-card px-3 py-2 text-sm text-red-700 transition hover:border-red-400 disabled:opacity-60";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canApprove && status === "draft" && (
        <button disabled={busy} onClick={() => call("PATCH", { action: "approve" })} className={btnPrimary}>
          {labels.approve}
        </button>
      )}
      {canApprove && status === "approved" && (
        <button disabled={busy} onClick={() => call("PATCH", { action: "paid" })} className={btnPrimary}>
          {labels.markPaid}
        </button>
      )}
      {canCancel && status === "draft" && (
        <button
          disabled={busy}
          onClick={() => confirm(labels.cancelConfirm) && call("DELETE")}
          className={btnDanger}
        >
          {labels.cancel}
        </button>
      )}
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
