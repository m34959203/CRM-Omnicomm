"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Переключатель языка RU/KK: PATCH /api/profile — кука-сессия пересоздаётся с новым locale. */
export function LocaleSwitcher({ locale }: { locale: "ru" | "kk" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function switchTo(next: "ru" | "kk") {
    if (next === locale || busy) return;
    setBusy(true);
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: next }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  const btn = (code: "ru" | "kk", label: string) => (
    <button
      onClick={() => switchTo(code)}
      disabled={busy}
      className={
        code === locale
          ? "rounded bg-chrome-raised px-2 py-1 font-mono text-[11px] font-semibold text-white"
          : "rounded px-2 py-1 font-mono text-[11px] text-chrome-dim transition hover:text-white disabled:opacity-60"
      }
    >
      {label}
    </button>
  );

  return (
    <div className="mt-2 flex items-center gap-1">
      {btn("ru", "RU")}
      {btn("kk", "KK")}
    </div>
  );
}
