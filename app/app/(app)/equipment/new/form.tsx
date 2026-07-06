"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Option = { id: string; name: string };

export function NewEquipmentForm({
  nomenclature,
  warehouses,
  suppliers,
}: {
  nomenclature: Option[];
  warehouses: Option[];
  suppliers: Option[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(
      [...fd.entries()].filter(([, v]) => v !== "")
    ) as Record<string, unknown>;
    const res = await fetch("/api/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push("/equipment");
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
      <h1 className="text-2xl font-semibold">Оприходование оборудования</h1>
      <p className="mt-1 text-sm text-ink-dim">
        Единица оборудования создаётся на складе (движение «оприходование»).
        Дальнейшие перемещения и установка — документами.
      </p>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            Единица оборудования
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={`${label} sm:col-span-2`}>
              Номенклатура *
              <select name="nomenclature_id" required className={input} defaultValue="">
                <option value="" disabled>
                  — выберите номенклатуру —
                </option>
                {nomenclature.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Серийный №
              <input name="serial_number" className={`${input} font-mono`} />
            </label>
            <label className={label}>
              IMEI
              <input name="imei" className={`${input} font-mono`} maxLength={17} />
            </label>
            <label className={label}>
              Состояние
              <select name="condition" className={input} defaultValue="new">
                <option value="new">Новое</option>
                <option value="used">БУ</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            Оприходование
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
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
            <label className={label}>
              Поставщик
              <select name="supplier_id" className={input} defaultValue="">
                <option value="">—</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Цена закупки, ₸
              <input name="purchase_price" type="number" step="0.01" min="0" className={input} />
            </label>
            <label className={`${label} sm:col-span-2`}>
              Примечание
              <input name="note" className={input} />
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
            href="/equipment"
            className="rounded-md border border-line bg-card px-4 py-2 text-sm transition hover:border-accent"
          >
            Отмена
          </Link>
        </div>
      </form>
    </div>
  );
}
