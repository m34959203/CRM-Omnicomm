"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/lib/dict/ru";

export type StepRow = {
  id: string;
  step: string;
  note: string | null;
  created_at: string;
  time: string; // отформатировано на сервере (Almaty)
  has_geo: boolean;
};

const FLOW = ["depart", "arrive", "start", "finish"] as const;

function getPosition(): Promise<{ lat: number | null; lng: number | null }> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ lat: null, lng: null });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ lat: null, lng: null }), // отказ/таймаут — шаг без координат
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

/**
 * Статусные шаги выезда: Выехал → Прибыл → Начал → Завершил (+ «Не могу выполнить»).
 * Каждый шаг POST /visit-steps с geolocation; lat/lng nullable при отказе.
 */
export function VisitActions({
  orderId,
  steps,
  labels,
}: {
  orderId: string;
  steps: StepRow[];
  labels: Dict["mobile"]["steps"];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [geoWarn, setGeoWarn] = useState(false);

  const doneSteps = new Set(steps.map((s) => s.step));
  const cancelled = doneSteps.has("cant_do");
  const finished = doneSteps.has("finish");
  const nextStep = FLOW.find((s) => !doneSteps.has(s));

  async function send(step: string, note?: string) {
    setBusy(true);
    setError("");
    setGeoWarn(false);
    const { lat, lng } = await getPosition();
    if (lat === null) setGeoWarn(true);
    const res = await fetch(`/api/service/orders/${orderId}/visit-steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, lat, lng, note }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      return;
    }
    router.refresh();
  }

  const stepLabel: Record<string, string> = {
    depart: labels.depart,
    arrive: labels.arrive,
    start: labels.start,
    finish: labels.finish,
  };

  return (
    <div>
      {/* таймлайн выполненных шагов */}
      {steps.length > 0 && (
        <ol className="space-y-2.5 border-l-2 border-chrome-line pl-4">
          {steps.map((s) => (
            <li key={s.id} className="relative">
              <span
                className={`absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-chrome ${
                  s.step === "cant_do" ? "bg-danger" : "bg-accent"
                }`}
                aria-hidden
              />
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-white">
                  {(labels.names as Record<string, string>)[s.step] ?? s.step}
                </span>
                <span className="font-mono text-xs text-chrome-dim">
                  {s.time}
                  {s.has_geo && " · GPS"}
                </span>
              </div>
              {s.note && <p className="mt-0.5 text-xs text-chrome-dim">{s.note}</p>}
            </li>
          ))}
        </ol>
      )}

      {/* следующий шаг — один крупный тач-таргет */}
      {!cancelled && !finished && nextStep && (
        <button
          disabled={busy}
          onClick={() => send(nextStep)}
          className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? "…" : stepLabel[nextStep]}
        </button>
      )}
      {!cancelled && !finished && (
        <button
          disabled={busy}
          onClick={() => {
            const note = prompt(labels.cantDoNote);
            if (note?.trim()) send("cant_do", note.trim());
          }}
          className="mt-2.5 flex min-h-12 w-full items-center justify-center rounded-xl border border-danger/40 px-4 text-sm font-medium text-red-300 transition active:scale-[0.98] disabled:opacity-50"
        >
          {labels.cantDo}
        </button>
      )}

      {geoWarn && <p className="mt-2 text-xs text-warn">{labels.geoWarn}</p>}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
