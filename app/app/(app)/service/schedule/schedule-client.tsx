"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Dict } from "@/lib/dict/ru";

type Tech = { id: string; full_name: string };
type AssignedOrder = {
  id: string;
  number: string;
  status: string;
  client_name: string | null;
  object_name: string | null;
  user_id: string;
  start_day: string | null;
  end_day: string | null;
};
type UnassignedOrder = {
  id: string;
  number: string;
  status: string;
  client_name: string | null;
  object_name: string | null;
};

const STATUS_CARD: Record<string, string> = {
  planned: "border-sky-300 bg-sky-50",
  in_progress: "border-[var(--accent)] bg-accent-soft",
  done: "border-green-300 bg-green-50",
  rework: "border-amber-300 bg-amber-50",
  draft: "border-line bg-paper",
};

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Диспетчерская: неделя × техники, HTML5 drag-and-drop без библиотек. */
export function ScheduleBoard({
  monday,
  days,
  today,
  techs,
  assigned,
  unassigned,
  canEdit,
  locale,
  s,
}: {
  monday: string;
  days: string[];
  today: string;
  techs: Tech[];
  assigned: AssignedOrder[];
  unassigned: UnassignedOrder[];
  canEdit: boolean;
  locale: "ru" | "kk";
  s: Dict["service"];
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [over, setOver] = useState<string | null>(null); // "techId|day"
  const [busy, setBusy] = useState(false);

  async function drop(techId: string, day: string, data: string) {
    setOver(null);
    if (!canEdit || busy) return;
    let payload: { id: string; fromUser?: string };
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (!payload?.id) return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/service/orders/${payload.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: techId,
        date: day,
        replace_user_id: payload.fromUser && payload.fromUser !== techId ? payload.fromUser : undefined,
      }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
    router.refresh();
  }

  function card(o: { id: string; number: string; status: string; client_name: string | null; object_name: string | null }, fromUser?: string) {
    return (
      <div
        key={`${o.id}-${fromUser ?? "u"}`}
        draggable={canEdit}
        onDragStart={(e) => {
          e.dataTransfer.setData("text/plain", JSON.stringify({ id: o.id, fromUser }));
          e.dataTransfer.effectAllowed = "move";
        }}
        className={`rounded border px-1.5 py-1 text-[11px] leading-tight shadow-sm ${
          STATUS_CARD[o.status] ?? "border-line bg-card"
        } ${canEdit ? "cursor-grab active:cursor-grabbing" : ""}`}
        title={`${o.number} · ${o.client_name ?? ""} · ${(s.orderStatuses as Record<string, string>)[o.status] ?? o.status}`}
      >
        <Link
          href={`/service/orders/${o.id}`}
          className="font-mono font-semibold text-accent-ink hover:underline"
          draggable={false}
        >
          {o.number}
        </Link>
        <div className="truncate text-ink-dim">{o.object_name ?? o.client_name ?? ""}</div>
      </div>
    );
  }

  const dayLabel = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString(locale === "kk" ? "kk-KZ" : "ru-RU", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      timeZone: "UTC",
    });

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2">
        <Link
          href={`/service/schedule?week=${addDays(monday, -7)}`}
          className="rounded border border-line bg-card px-2.5 py-1.5 text-sm transition hover:border-accent"
        >
          {s.prevWeek}
        </Link>
        <Link
          href="/service/schedule"
          className="rounded border border-line bg-card px-2.5 py-1.5 text-sm transition hover:border-accent"
        >
          {s.today}
        </Link>
        <Link
          href={`/service/schedule?week=${addDays(monday, 7)}`}
          className="rounded border border-line bg-card px-2.5 py-1.5 text-sm transition hover:border-accent"
        >
          {s.nextWeek}
        </Link>
        <span className="ml-2 text-sm text-ink-dim">
          {dayLabel(days[0])} — {dayLabel(days[6])}
        </span>
        {canEdit && <span className="ml-auto text-xs text-ink-dim">{s.dropHint}</span>}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <div className="mt-3 flex gap-4">
        {/* нераспределённые */}
        <div className="w-56 shrink-0">
          <div className="rounded-t-lg border border-line bg-chrome px-3 py-2 text-xs font-semibold uppercase tracking-wider text-chrome-text">
            {s.unassigned} ({unassigned.length})
          </div>
          <div className="min-h-40 space-y-1.5 rounded-b-lg border border-t-0 border-line bg-card p-2">
            {unassigned.length === 0 && <div className="py-6 text-center text-xs text-ink-dim">—</div>}
            {unassigned.map((o) => card(o))}
          </div>
        </div>

        {/* сетка дни × техники */}
        <div className="min-w-0 flex-1 overflow-x-auto">
          {techs.length === 0 ? (
            <div className="rounded-lg border border-line bg-card p-10 text-center text-sm text-ink-dim">
              {s.noInstallers}
            </div>
          ) : (
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 w-40 rounded-tl-lg border border-line bg-chrome px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-chrome-text">
                    {s.technician}
                  </th>
                  {days.map((day) => (
                    <th
                      key={day}
                      className={`min-w-32 border border-l-0 border-line px-2 py-2 text-center text-xs font-semibold uppercase tracking-wider ${
                        day === today ? "bg-accent text-white" : "bg-chrome text-chrome-text"
                      }`}
                    >
                      {dayLabel(day)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {techs.map((tech) => (
                  <tr key={tech.id}>
                    <td className="sticky left-0 z-10 border border-t-0 border-line bg-card px-3 py-2 font-medium">
                      {tech.full_name}
                    </td>
                    {days.map((day) => {
                      const key = `${tech.id}|${day}`;
                      const cell = assigned.filter(
                        (o) =>
                          o.user_id === tech.id &&
                          (o.start_day ?? "") <= day &&
                          (o.end_day ?? o.start_day ?? "") >= day
                      );
                      return (
                        <td
                          key={key}
                          onDragOver={(e) => {
                            if (!canEdit) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            setOver(key);
                          }}
                          onDragLeave={() => setOver((v) => (v === key ? null : v))}
                          onDrop={(e) => {
                            e.preventDefault();
                            drop(tech.id, day, e.dataTransfer.getData("text/plain"));
                          }}
                          className={`h-16 border border-l-0 border-t-0 border-line p-1 align-top transition ${
                            over === key ? "bg-accent-soft" : day === today ? "bg-accent-soft/30" : "bg-card"
                          }`}
                        >
                          <div className="space-y-1">{cell.map((o) => card(o, tech.id))}</div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
