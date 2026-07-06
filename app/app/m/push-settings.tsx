"use client";

import { useEffect, useState } from "react";
import type { Dict } from "@/lib/dict/ru";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type St = "idle" | "unsupported" | "denied" | "enabled" | "error" | "busy";

/** Кнопка «Включить уведомления»: Notification.requestPermission + pushManager.subscribe (VAPID). */
export function PushSettings({ labels }: { labels: Dict["mobile"]["push"] }) {
  const [state, setState] = useState<St>("idle");

  useEffect(() => {
    // детект асинхронно: setState в теле эффекта запрещён react-hooks/set-state-in-effect
    (async () => {
      await Promise.resolve();
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) setState("enabled");
      } catch {
        // остаёмся в idle
      }
    })();
  }, []);

  async function enable() {
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState("denied");
        return;
      }
      const keyRes = await fetch("/api/push/public-key");
      const { key } = (await keyRes.json()) as { key: string | null };
      if (!key) throw new Error("no key");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(key).buffer as ArrayBuffer,
        }));
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error("subscribe failed");
      setState("enabled");
    } catch {
      setState("error");
    }
  }

  if (state === "unsupported") {
    return <p className="text-xs text-chrome-dim">{labels.unsupported}</p>;
  }
  if (state === "enabled") {
    return (
      <p className="flex items-center gap-2 text-sm text-chrome-text">
        <span className="inline-block h-2 w-2 rounded-full bg-ok" aria-hidden />
        {labels.enabled}
      </p>
    );
  }
  return (
    <div>
      <button
        onClick={enable}
        disabled={state === "busy"}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-chrome-line bg-chrome-raised px-4 text-sm font-medium text-chrome-text transition active:scale-[0.98] disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 text-accent">
          <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6zM10.5 19a1.8 1.8 0 0 0 3 0" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {state === "busy" ? "…" : labels.enable}
      </button>
      {state === "denied" && <p className="mt-2 text-xs text-warn">{labels.denied}</p>}
      {state === "error" && <p className="mt-2 text-xs text-danger">{labels.error}</p>}
    </div>
  );
}
