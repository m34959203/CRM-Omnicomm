"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function NewServerForm() {
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
    const res = await fetch("/api/telematics/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      router.push("/telematics");
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
      <h1 className="text-2xl font-semibold">Новый сервер телематики</h1>

      <form onSubmit={submit} className="mt-6 space-y-6">
        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            Сервер
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Наименование *
              <input name="name" required className={input} placeholder="Omnicomm Online" />
            </label>
            <label className={label}>
              Тип
              <select name="server_type" className={input} defaultValue="omnicomm">
                <option value="omnicomm">Omnicomm</option>
                <option value="wialon">Wialon</option>
              </select>
            </label>
            <label className={`${label} sm:col-span-2`}>
              Адрес API *
              <input
                name="base_url"
                required
                className={`${input} font-mono`}
                placeholder="https://online.omnicomm.ru"
              />
            </label>
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            Учётные данные
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={label}>
              Логин
              <input name="auth_login" className={`${input} font-mono`} autoComplete="off" />
            </label>
            <label className={label}>
              Пароль / секрет
              <input
                name="auth_secret"
                type="password"
                className={`${input} font-mono`}
                autoComplete="new-password"
              />
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
            href="/telematics"
            className="rounded-md border border-line bg-card px-4 py-2 text-sm transition hover:border-accent"
          >
            Отмена
          </Link>
        </div>
      </form>
    </div>
  );
}
