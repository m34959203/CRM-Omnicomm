"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { role?: string };
      // redirect back (?next=/m) — PWA техника; технику по умолчанию /m
      const next = new URLSearchParams(window.location.search).get("next");
      const target =
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : data.role === "installer"
            ? "/m"
            : "/dashboard";
      router.push(target);
      router.refresh();
    } else {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 min-h-screen">
      {/* Графитовая панель с маршрутным мотивом */}
      <aside className="hidden lg:flex w-[44%] bg-chrome text-chrome-text flex-col justify-between p-12 relative overflow-hidden">
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.35]"
          viewBox="0 0 600 800"
          fill="none"
          aria-hidden
        >
          <polyline
            points="-40,720 120,610 180,640 320,470 300,360 440,300 420,180 620,60"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeDasharray="7 7"
          />
          {[
            [120, 610],
            [320, 470],
            [440, 300],
          ].map(([x, y]) => (
            <circle key={`${x}`} cx={x} cy={y} r="6" fill="var(--accent)" />
          ))}
          <circle cx="620" cy="60" r="10" stroke="var(--accent)" strokeWidth="2.5" />
        </svg>
        <div className="relative">
          <div className="font-mono text-sm tracking-[0.3em] text-chrome-dim">
            OMNICOMM ALLIANCE KZ
          </div>
        </div>
        <div className="relative">
          <h1 className="text-5xl font-bold leading-tight text-white">
            CRM
            <span className="block text-accent">мониторинга транспорта</span>
          </h1>
          <p className="mt-6 max-w-md text-chrome-dim leading-relaxed">
            Клиенты · оборудование · монтажи · абонентская плата ·
            интеграция с Omnicomm Online
          </p>
        </div>
        <div className="relative font-mono text-xs text-chrome-dim">
          v0.1 · этап 0 — фундамент
        </div>
      </aside>

      {/* Форма */}
      <main className="flex flex-1 items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm">
          <div className="lg:hidden mb-10 font-mono text-xs tracking-[0.3em] text-ink-dim">
            OMNICOMM ALLIANCE KZ
          </div>
          <h2 className="text-2xl font-semibold">Вход в систему</h2>
          <p className="mt-1 text-sm text-ink-dim">Жүйеге кіру</p>

          <label className="block mt-8 text-sm font-medium">
            E-mail
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 font-mono text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>

          <label className="block mt-4 text-sm font-medium">
            Пароль · Құпиясөз
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-md border border-line bg-card px-3 py-2.5 font-mono text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
          </label>

          {error && (
            <p className="mt-4 text-sm text-danger">
              Неверный e-mail или пароль · E-mail немесе құпиясөз қате
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-8 w-full rounded-md bg-accent px-4 py-2.5 font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
          >
            {busy ? "…" : "Войти · Кіру"}
          </button>
        </form>
      </main>
    </div>
  );
}
