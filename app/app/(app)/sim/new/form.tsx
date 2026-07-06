"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Option = { id: string; name: string };
type PlanOption = Option & { operator_id: string };

export function NewSimForm({
  operators,
  plans,
  warehouses,
}: {
  operators: Option[];
  plans: PlanOption[];
  warehouses: Option[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [operatorId, setOperatorId] = useState("");

  const operatorPlans = plans.filter((p) => p.operator_id === operatorId);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(
      [...fd.entries()].filter(([, v]) => v !== "")
    ) as Record<string, unknown>;
    const res = await fetch("/api/sim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push("/sim");
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "Ошибка сохранения");
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
  const label = "block text-sm font-medium";

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">Новая SIM-карта</h1>
      <p className="mt-1 text-sm text-ink-dim">
        SIM-карта приходуется на склад. Выдача и установка в оборудование — документами.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            Карта
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              ICCID (серийный №) *
              <input name="icc" required className={`${input} font-mono`} maxLength={22} />
            </label>
            <label className={label}>
              Номер (MSISDN)
              <input name="msisdn" className={`${input} font-mono`} placeholder="7701XXXXXXX" />
            </label>
            <label className={label}>
              Оператор
              <select
                name="operator_id"
                className={input}
                value={operatorId}
                onChange={(e) => setOperatorId(e.target.value)}
              >
                <option value="">—</option>
                {operators.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Тарифный план
              <select name="plan_id" className={input} defaultValue="" disabled={!operatorId}>
                <option value="">—</option>
                {operatorPlans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            Оприходование
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={`${label} sm:col-span-2`}>
              Склад *
              <select name="warehouse_id" required className={input} defaultValue="">
                <option value="" disabled>
                  — выберите склад —
                </option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </fieldset>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
          >
            Сохранить
          </button>
          <Link
            href="/sim"
            className="rounded-md border border-line bg-card px-4 py-2 text-sm transition hover:border-accent"
          >
            Отмена
          </Link>
        </div>
      </form>
    </div>
  );
}
