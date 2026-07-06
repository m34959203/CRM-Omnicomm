"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Rec = {
  date: string;
  number: string;
  bin: string;
  amount: number;
  purpose: string;
  payer_name?: string;
  client_name: string | null;
  document_number: string | null;
  problem: string | null;
};
type Report = {
  total: number;
  matched: number;
  unmatchedClient: number;
  duplicates: number;
  records: Rec[];
  created?: number;
  skipped?: number;
};

export function ImportClient({ labels }: { labels: { preview: string; commit: string } }) {
  const router = useRouter();
  const [report, setReport] = useState<Report | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function run(dry: boolean) {
    if (!file) return;
    setBusy(true);
    setError("");
    setDone("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/billing/payments-import${dry ? "?dry=1" : ""}`, {
      method: "POST",
      body: fd,
    });
    const data = (await res.json().catch(() => ({}))) as Report & { error?: string };
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Ошибка импорта");
      return;
    }
    setReport(data);
    if (!dry) {
      setDone(`Проведено: ${data.created}, пропущено: ${data.skipped}`);
      router.refresh();
    }
  }

  const money = (n: number) =>
    n.toLocaleString("ru-RU", { minimumFractionDigits: 2 });

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept=".xlsx,.txt,.kl"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setReport(null); setDone(""); }}
          className="rounded-md border border-line bg-card px-3 py-2 text-sm"
        />
        <button
          onClick={() => run(true)}
          disabled={!file || busy}
          className="rounded-md border border-line bg-card px-4 py-2 text-sm transition hover:border-accent hover:text-accent-ink disabled:opacity-50"
        >
          {busy ? "…" : labels.preview}
        </button>
        <button
          onClick={() => run(false)}
          disabled={!file || busy || !report || report.matched === 0}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-50"
        >
          {labels.commit}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {done && <p className="mt-3 text-sm font-semibold text-ok">{done}</p>}

      {report && (
        <>
          <div className="mt-4 flex gap-4 text-sm">
            <span>Всего: <b>{report.total}</b></span>
            <span className="text-ok">К проведению: <b>{report.matched}</b></span>
            <span className="text-warn">Без клиента: <b>{report.unmatchedClient}</b></span>
            <span className="text-ink-dim">Дубли: <b>{report.duplicates}</b></span>
          </div>
          <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                  <th className="px-3 py-2.5 font-medium">Дата</th>
                  <th className="px-3 py-2.5 font-medium">№ п/п</th>
                  <th className="px-3 py-2.5 font-medium">Плательщик</th>
                  <th className="px-3 py-2.5 font-medium">Клиент CRM</th>
                  <th className="px-3 py-2.5 font-medium">Сумма</th>
                  <th className="px-3 py-2.5 font-medium">Документ</th>
                  <th className="px-3 py-2.5 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {report.records.map((r, i) => (
                  <tr key={i} className="border-b border-line last:border-0">
                    <td className="px-3 py-2 font-mono text-[13px]">{r.date}</td>
                    <td className="px-3 py-2 font-mono text-[13px]">{r.number}</td>
                    <td className="px-3 py-2">{r.payer_name ?? r.bin}</td>
                    <td className="px-3 py-2">{r.client_name ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[13px]">{money(r.amount)}</td>
                    <td className="px-3 py-2 font-mono text-[13px]">{r.document_number ?? "—"}</td>
                    <td className="px-3 py-2">
                      {r.problem ? (
                        <span className="rounded bg-paper px-1.5 py-0.5 text-[11px] text-warn">{r.problem}</span>
                      ) : (
                        <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink">к проведению</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
