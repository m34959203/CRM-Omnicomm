'use client';
// Omnicomm — панель этапов выезда для кабинета монтажника (разделы 9.3, 22 ТЗ).
// Кнопки этапов с захватом геолокации; работает поверх /api/maintenance/[id]/steps.
import { useCallback, useEffect, useState } from 'react';
import { MapPin, Check, Loader2, AlertTriangle } from 'lucide-react';

type Step = { id: string; step: string; lat: number | null; lng: number | null; created_at: string };

const STEPS: { key: string; label: string }[] = [
  { key: 'accept', label: 'Принял заявку' },
  { key: 'depart', label: 'Выехал' },
  { key: 'arrive', label: 'Прибыл на объект' },
  { key: 'start', label: 'Начал работы' },
  { key: 'finish', label: 'Завершил работы' },
];

export default function VisitStepsPanel({ maintenanceId }: { maintenanceId: string }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/maintenance/${maintenanceId}/steps`);
    const j = await r.json();
    setSteps(j.data ?? []);
  }, [maintenanceId]);

  useEffect(() => { load(); }, [load]);

  const done = new Set(steps.map((s) => s.step));
  const nextIdx = STEPS.findIndex((s) => !done.has(s.key));

  async function getGeo(): Promise<{ lat?: number; lng?: number }> {
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000, enableHighAccuracy: true })
      );
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      return {};
    }
  }

  async function mark(step: string) {
    setBusy(step);
    setError(null);
    const geo = await getGeo();
    const r = await fetch(`/api/maintenance/${maintenanceId}/steps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, ...geo }),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? 'Не удалось сохранить этап');
    } else {
      await load();
    }
    setBusy(null);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-[#1f3864]">Этапы выезда</h3>

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <ol className="space-y-2">
        {STEPS.map((s, i) => {
          const isDone = done.has(s.key);
          const isNext = i === nextIdx;
          const rec = steps.find((x) => x.step === s.key);
          return (
            <li key={s.key} className="flex items-center gap-3">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
                  isDone ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
                }`}
              >
                {isDone ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`flex-1 text-sm ${isDone ? 'text-gray-900' : 'text-gray-500'}`}>
                {s.label}
                {rec?.lat != null && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-gray-400">
                    <MapPin className="h-3 w-3" /> {rec.lat.toFixed(4)}, {rec.lng?.toFixed(4)}
                  </span>
                )}
              </span>
              {!isDone && isNext && (
                <button
                  onClick={() => mark(s.key)}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#2e75b6] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1f3864] disabled:opacity-60"
                >
                  {busy === s.key && <Loader2 className="h-4 w-4 animate-spin" />}
                  Отметить
                </button>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-3 text-xs text-gray-400">
        Завершение монтажной заявки доступно только после загрузки фотоотчёта (правило ТЗ, раздел 20).
      </p>
    </div>
  );
}
