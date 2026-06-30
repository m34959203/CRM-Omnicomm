'use client';
// Omnicomm — календарь выездов (раздел 15 ТЗ): выезды по датам с монтажником,
// клиентом, объектом, типом и статусом. Поверх /api/maintenance.
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';

export default function CalendarPage() {
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/maintenance').then((r) => r.json()).then((j) => setItems(j.data ?? []));
  }, []);

  const byDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const m of items) {
      const d = (m.scheduled_date ?? m.due_date ?? 'Без даты').slice(0, 10);
      (map[d] ??= []).push(m);
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  return (
    <div className="p-6">
      <h1 className="mb-5 flex items-center gap-2 text-xl font-semibold text-[#1f3864]">
        <CalendarDays className="h-6 w-6" /> Календарь выездов
      </h1>
      <div className="space-y-4">
        {byDay.map(([day, list]) => (
          <div key={day} className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-semibold text-[#1f3864]">{day}</div>
            <table className="w-full text-sm">
              <tbody>
                {list.map((m) => (
                  <tr key={m.id} className="border-t border-gray-50">
                    <td className="px-4 py-2 font-medium text-[#2e75b6]">{m.title ?? m.maintenance_type}</td>
                    <td className="px-4 py-2 text-gray-600">{m.assigned_to_name ?? m.assigned_to ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-600">{m.elevator_name ?? m.elevator_id ?? ''}</td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{m.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        {byDay.length === 0 && <div className="text-gray-400">Запланированных выездов нет</div>}
      </div>
    </div>
  );
}
