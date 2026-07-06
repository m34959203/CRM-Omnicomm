"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Option = { id: string; name: string };

const TYPES: [string, string][] = [
  ["physical", "Обычный (физический)"],
  ["technician", "Исполнителя: техник"],
  ["contractor", "Исполнителя: подрядчик"],
  ["testing", "Виртуальный: тестирование"],
  ["supplier", "Виртуальный: поставщик"],
  ["virtual", "Виртуальный: прочий"],
];

export function NewWarehouseForm({
  users,
  suppliers,
}: {
  users: Option[];
  suppliers: Option[];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState("physical");

  const needsHolder = type === "technician" || type === "contractor";
  const needsSupplier = type === "supplier";

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(
      [...fd.entries()].filter(([, v]) => v !== "")
    ) as Record<string, unknown>;
    const res = await fetch("/api/warehouses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push("/warehouses");
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
      <h1 className="text-2xl font-semibold">Новый склад</h1>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            Основное
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={`${label} sm:col-span-2`}>
              Наименование *
              <input name="name" required className={input} />
            </label>
            <label className={label}>
              Тип склада
              <select
                name="type"
                className={input}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {needsHolder && (
              <label className={label}>
                Держатель (исполнитель) *
                <select name="holder_id" required className={input} defaultValue="">
                  <option value="" disabled>
                    — выберите сотрудника —
                  </option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {needsSupplier && (
              <label className={label}>
                Поставщик *
                <select name="supplier_id" required className={input} defaultValue="">
                  <option value="" disabled>
                    — выберите поставщика —
                  </option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
            href="/warehouses"
            className="rounded-md border border-line bg-card px-4 py-2 text-sm transition hover:border-accent"
          >
            Отмена
          </Link>
        </div>
      </form>
    </div>
  );
}
