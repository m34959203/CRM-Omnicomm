'use client';
// Omnicomm — страница абонентской платы (раздел 16 ТЗ).
// Сводка + список счетов со статусами + кнопка ручного начисления (cron).
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';

type Totals = {
  accrued: string; issued: string; paid: string; overdue: string;
  clients_active: number; clients_overdue: number;
};
type Invoice = {
  id: string; client_name: string; period_start: string; period_end: string;
  amount: string; paid_amount: string; status: string;
};

const STATUS_STYLE: Record<string, string> = {
  to_accrue: 'bg-blue-100 text-blue-800',
  prepared: 'bg-indigo-100 text-indigo-800',
  issued: 'bg-amber-100 text-amber-800',
  paid: 'bg-green-100 text-green-700',
  partial: 'bg-amber-100 text-amber-800',
  overdue: 'bg-red-100 text-red-700',
};
const STATUS_LABEL: Record<string, string> = {
  to_accrue: 'К начислению', prepared: 'Счёт подготовлен', issued: 'Счёт выставлен',
  paid: 'Оплачено', partial: 'Частично оплачено', overdue: 'Просрочено',
};
const money = (v: string | number) => Number(v).toLocaleString('ru-RU') + ' ₸';

export default function SubscriptionsPage() {
  const [totals, setTotals] = useState<Totals | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [accruing, setAccruing] = useState(false);

  const load = useCallback(async () => {
    const [t, inv] = await Promise.all([
      fetch('/api/reports/subscriptions').then((r) => r.json()),
      fetch('/api/subscriptions/invoices').then((r) => r.json()),
    ]);
    setTotals(t.data);
    setInvoices(inv.data ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function accrue() {
    setAccruing(true);
    await fetch('/api/subscriptions/cron', { method: 'POST' });
    await load();
    setAccruing(false);
  }

  const cards = totals
    ? [
        { l: 'Начислено', v: money(totals.accrued) },
        { l: 'Выставлено', v: money(totals.issued) },
        { l: 'Оплачено', v: money(totals.paid), c: 'text-green-700' },
        { l: 'Просрочено', v: money(totals.overdue), c: 'text-red-700' },
        { l: 'Клиентов с абонплатой', v: String(totals.clients_active) },
        { l: 'С просрочкой', v: String(totals.clients_overdue), c: 'text-red-700' },
      ]
    : [];

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-[#1f3864]">Абонентская плата</h1>
        <button
          onClick={accrue}
          disabled={accruing}
          className="inline-flex items-center gap-2 rounded-lg bg-[#2e75b6] px-4 py-2 text-sm font-medium text-white hover:bg-[#1f3864] disabled:opacity-60"
        >
          {accruing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Начислить за период
        </button>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <div key={c.l} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className={`text-2xl font-bold ${c.c ?? 'text-[#1f3864]'}`}>{c.v}</div>
            <div className="mt-1 text-xs text-gray-500">{c.l}</div>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Клиент</th>
              <th className="px-4 py-3">Период</th>
              <th className="px-4 py-3">Сумма</th>
              <th className="px-4 py-3">Оплачено</th>
              <th className="px-4 py-3">Статус</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium">{i.client_name}</td>
                <td className="px-4 py-3 text-gray-600">{i.period_start} — {i.period_end}</td>
                <td className="px-4 py-3">{money(i.amount)}</td>
                <td className="px-4 py-3">{money(i.paid_amount)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[i.status] ?? 'bg-gray-100'}`}>
                    {STATUS_LABEL[i.status] ?? i.status}
                  </span>
                </td>
              </tr>
            ))}
            {invoices.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Счетов пока нет — нажмите «Начислить за период»</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
