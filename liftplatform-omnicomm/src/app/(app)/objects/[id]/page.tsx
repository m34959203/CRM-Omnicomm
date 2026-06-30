'use client';
// Omnicomm — карточка объекта (раздел 14 ТЗ): адрес, координаты, контактное лицо,
// оборудование, история работ, активные/закрытые заявки. Поверх /api/elevators/[id].
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { MapPin, Wrench, ClipboardList } from 'lucide-react';

export default function ObjectCard() {
  const { id } = useParams<{ id: string }>();
  const [obj, setObj] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/elevators/${id}`).then((r) => r.json()).then((j) => setObj(j.data ?? j));
    fetch(`/api/maintenance?elevator_id=${id}`).then((r) => r.json()).then((j) => setHistory(j.data ?? []));
  }, [id]);

  if (!obj) return <div className="p-6 text-gray-400">Загрузка…</div>;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <MapPin className="h-7 w-7 text-[#2e75b6]" />
        <div>
          <h1 className="text-xl font-semibold text-[#1f3864]">{obj.name ?? obj.registration_number}</h1>
          <div className="text-sm text-gray-500">{obj.address ?? '—'}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1f3864]"><Wrench className="h-4 w-4" /> Параметры объекта</h3>
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <dt className="text-gray-500">Координаты</dt><dd>{obj.lat ?? '—'}, {obj.lng ?? '—'}</dd>
            <dt className="text-gray-500">Статус</dt><dd>{obj.status ?? '—'}</dd>
            <dt className="text-gray-500">Тип</dt><dd>{obj.elevator_type ?? obj.type ?? '—'}</dd>
            <dt className="text-gray-500">Контактное лицо</dt><dd>{obj.contact_person ?? '—'}</dd>
          </dl>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[#1f3864]"><ClipboardList className="h-4 w-4" /> История работ</h3>
          {history.length ? (
            <ul className="space-y-1 text-sm">
              {history.slice(0, 8).map((h) => (
                <li key={h.id} className="flex justify-between border-b border-gray-50 py-1">
                  <span>{h.title ?? h.maintenance_type}</span>
                  <span className="text-gray-500">{h.status}</span>
                </li>
              ))}
            </ul>
          ) : <div className="text-sm text-gray-400">Работ пока нет</div>}
        </div>
      </div>
    </div>
  );
}
