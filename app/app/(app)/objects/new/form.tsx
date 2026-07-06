"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Option = { id: string; name: string };

export function NewObjectForm({ clients }: { clients: Option[] }) {
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
    const res = await fetch("/api/objects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push("/objects");
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
      <h1 className="text-2xl font-semibold">Новый объект мониторинга</h1>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            Основное
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={`${label} sm:col-span-2`}>
              Клиент *
              <select name="client_id" required className={input} defaultValue="">
                <option value="" disabled>
                  — выберите клиента —
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={`${label} sm:col-span-2`}>
              Наименование * (марка + госномер)
              <input name="name" required className={input} />
            </label>
            <label className={label}>
              Вид объекта
              <select name="kind" className={input} defaultValue="vehicle">
                <option value="vehicle">Транспортное средство</option>
                <option value="stationary">Стационарный</option>
                <option value="other">Прочее</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            Транспортное средство
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Марка
              <input name="brand" className={input} placeholder="КАМАЗ" />
            </label>
            <label className={label}>
              Модель
              <input name="model" className={input} placeholder="65115" />
            </label>
            <label className={label}>
              Госномер
              <input name="reg_number" className={`${input} font-mono`} />
            </label>
            <label className={label}>
              VIN
              <input name="vin" className={`${input} font-mono`} maxLength={17} />
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
            href="/objects"
            className="rounded-md border border-line bg-card px-4 py-2 text-sm transition hover:border-accent"
          >
            Отмена
          </Link>
        </div>
      </form>
    </div>
  );
}
