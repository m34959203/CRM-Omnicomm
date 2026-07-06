"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const LEGAL_FORMS = ["TOO", "IP", "AO", "GU", "KGP", "NAO", "FL", "other"];

export default function NewClientPage() {
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
    body.is_vat_payer = fd.get("is_vat_payer") === "on";
    body.is_government = fd.get("is_government") === "on";
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push("/clients");
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
      <h1 className="text-2xl font-semibold">Новый клиент</h1>

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
              Телефон
              <input name="phone" className={input} />
            </label>
            <label className={label}>
              E-mail
              <input name="email" type="email" className={input} />
            </label>
            <label className={label}>
              Схема расчётов
              <select name="billing_scheme" className={input} defaultValue="credit">
                <option value="credit">Кредитная (всё в конце месяца)</option>
                <option value="advance">Авансовая (счёт в начале)</option>
              </select>
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            Реквизиты (контрагент)
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              БИН/ИИН
              <input name="bin_iin" className={`${input} font-mono`} maxLength={12} />
            </label>
            <label className={label}>
              Юр. форма
              <select name="legal_form" className={input} defaultValue="">
                <option value="">—</option>
                {LEGAL_FORMS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </label>
            <label className={label}>
              Кбе
              <input name="kbe" className={`${input} font-mono`} maxLength={2} />
            </label>
            <label className={`${label} sm:col-span-2`}>
              Юридический адрес
              <input name="legal_address" className={input} />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_vat_payer" className="accent-[var(--accent)]" />
              Плательщик НДС
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_government" className="accent-[var(--accent)]" />
              Бюджетник (ГУ/КГП)
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
            href="/clients"
            className="rounded-md border border-line bg-card px-4 py-2 text-sm transition hover:border-accent"
          >
            Отмена
          </Link>
        </div>
      </form>
    </div>
  );
}
