'use client';
// Omnicomm — карточка клиента (раздел 13 ТЗ): реквизиты, заявки, история звонков,
// переписка, счета. Переиспользует /api/organizations/[id] + Omnicomm-роуты.
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Phone, Mail, Building2, Wallet, MessageSquare } from 'lucide-react';

type Org = { id: string; name: string; bin_iin?: string; phone?: string; email?: string };
const money = (v: string | number) => Number(v).toLocaleString('ru-RU') + ' ₸';

export default function ClientCard() {
  const { id } = useParams<{ id: string }>();
  const [org, setOrg] = useState<Org | null>(null);
  const [calls, setCalls] = useState<any[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/organizations/${id}`).then((r) => r.json()).then((j) => setOrg(j.data ?? j));
    fetch(`/api/calls?organization_id=${id}`).then((r) => r.json()).then((j) => setCalls(j.data ?? []));
    fetch(`/api/messages?organization_id=${id}`).then((r) => r.json()).then((j) => setMessages(j.data ?? []));
    fetch(`/api/subscriptions/invoices?organization_id=${id}`).then((r) => r.json()).then((j) => setInvoices(j.data ?? []));
  }, [id]);

  const Section = ({ title, icon: Icon, children }: any) => (
    <div className="rounded-xl border border-gray-200 bg-white">
      <h3 className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-[#1f3864]">
        <Icon className="h-4 w-4" /> {title}
      </h3>
      <div className="p-4">{children}</div>
    </div>
  );

  if (!org) return <div className="p-6 text-gray-400">Загрузка…</div>;

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center gap-3">
        <Building2 className="h-7 w-7 text-[#2e75b6]" />
        <div>
          <h1 className="text-xl font-semibold text-[#1f3864]">{org.name}</h1>
          <div className="text-sm text-gray-500">БИН/ИИН: {org.bin_iin ?? '—'}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Section title="Контакты" icon={Phone}>
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400" />{org.phone ?? '—'}</div>
            <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gray-400" />{org.email ?? '—'}</div>
          </div>
        </Section>
        <Section title="Счета и абонплата" icon={Wallet}>
          {invoices.length ? (
            <ul className="space-y-1 text-sm">
              {invoices.slice(0, 4).map((i) => (
                <li key={i.id} className="flex justify-between">
                  <span className="text-gray-600">{i.period_start}</span>
                  <span>{money(i.amount)} · {i.status}</span>
                </li>
              ))}
            </ul>
          ) : <div className="text-sm text-gray-400">Нет начислений</div>}
        </Section>
        <Section title="Звонки" icon={Phone}>
          {calls.length ? (
            <ul className="space-y-1 text-sm">
              {calls.slice(0, 4).map((c) => (
                <li key={c.id} className="flex justify-between">
                  <span className="text-gray-600">{c.direction}</span>
                  <span>{c.duration_sec}s · {c.result ?? ''}</span>
                </li>
              ))}
            </ul>
          ) : <div className="text-sm text-gray-400">Звонков нет</div>}
        </Section>
      </div>

      <Section title="Переписка по каналам" icon={MessageSquare}>
        {messages.length ? (
          <ul className="space-y-2 text-sm">
            {messages.slice(0, 8).map((m) => (
              <li key={m.id} className="flex gap-3">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{m.channel}</span>
                <span className="text-gray-700">{m.content}</span>
              </li>
            ))}
          </ul>
        ) : <div className="text-sm text-gray-400">Сообщений нет</div>}
      </Section>
    </div>
  );
}
