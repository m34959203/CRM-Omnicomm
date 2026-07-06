"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

export function SimImportButton({
  operators,
  warehouses,
  labels,
}: {
  operators: Option[];
  warehouses: Option[];
  labels: { button: string; hint: string; save: string; cancel: string };
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    const res = await fetch("/api/sim/import", {
      method: "POST",
      body: new FormData(e.currentTarget),
    });
    const data = (await res.json().catch(() => ({}))) as {
      created?: number; skipped?: number; errors?: string[]; error?: string;
    };
    setBusy(false);
    if (!res.ok && data.error) {
      setResult(`Ошибка: ${data.error}`);
      return;
    }
    setResult(
      `Импортировано: ${data.created ?? 0}, пропущено (дубли): ${data.skipped ?? 0}` +
        (data.errors?.length ? `, ошибок: ${data.errors.length}\n${data.errors.slice(0, 5).join("\n")}` : "")
    );
    router.refresh();
  }

  const input =
    "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent";

  return (
    <>
      <button
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
      >
        {labels.button}
      </button>
      <dialog
        ref={dialogRef}
        className="m-auto w-full max-w-md rounded-lg border border-line bg-card p-6 backdrop:bg-black/40"
      >
        <h2 className="text-lg font-semibold">{labels.button}</h2>
        <p className="mt-1 text-xs text-ink-dim">{labels.hint}</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block text-sm font-medium">
            Файл (.xlsx)
            <input name="file" type="file" required accept=".xlsx" className={input} />
          </label>
          <label className="block text-sm font-medium">
            Оператор
            <select name="operator_id" required className={input}>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Склад
            <select name="warehouse_id" required className={input}>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </label>
          {result && (
            <pre className="whitespace-pre-wrap rounded bg-paper p-2 text-xs">{result}</pre>
          )}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
            >
              {busy ? "…" : labels.save}
            </button>
            <button
              type="button"
              onClick={() => { setResult(null); dialogRef.current?.close(); }}
              className="rounded-md border border-line px-4 py-2 text-sm transition hover:border-accent"
            >
              {labels.cancel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
