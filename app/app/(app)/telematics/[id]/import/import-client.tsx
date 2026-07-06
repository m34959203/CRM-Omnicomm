"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Sample = {
  uuid: string;
  name: string;
  receive_data: boolean;
  exists: boolean;
  brand: string | null;
  model: string | null;
  regNumber: string | null;
};

type Preview = {
  total: number;
  to_create: number;
  to_update: number;
  sample: Sample[];
};

type Labels = {
  preview: string;
  run: string;
  toCreate: string;
  toUpdate: string;
  total: string;
  externalName: string;
  regNumber: string;
  brandModel: string;
  client: string;
};

export function ImportClient({
  serverId,
  clients,
  labels,
}: {
  serverId: string;
  clients: { id: string; name: string }[];
  labels: Labels;
}) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState("");
  const [done, setDone] = useState<{ created: number; updated: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/telematics/servers/${serverId}/import/preview`);
      const data = await res.json().catch(() => null);
      if (cancelled) return;
      if (res.ok) setPreview(data);
      else setError(data?.error ?? `HTTP ${res.status}`);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [serverId]);

  async function runImport() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/telematics/servers/${serverId}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clientId ? { client_id: clientId } : {}),
    });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setDone(data);
      router.refresh();
    } else {
      setError(data?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
  }

  if (loading) return <p className="mt-6 text-sm text-ink-dim">{labels.preview}…</p>;

  return (
    <div className="mt-6 space-y-5">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {preview && (
        <>
          <div className="flex flex-wrap items-center gap-6 rounded-lg border border-line bg-card px-5 py-4 text-sm">
            <div>
              <span className="text-ink-dim">{labels.total}:</span>{" "}
              <b>{preview.total}</b>
            </div>
            <div>
              <span className="text-ink-dim">{labels.toCreate}:</span>{" "}
              <b className="text-accent-ink">{preview.to_create}</b>
            </div>
            <div>
              <span className="text-ink-dim">{labels.toUpdate}:</span>{" "}
              <b>{preview.to_update}</b>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-ink-dim">{labels.client}:</span>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none focus:border-accent"
              >
                <option value="">— Не распределено (импорт Omnicomm) —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={runImport}
              disabled={busy || done !== null}
              className="ml-auto rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
            >
              {busy ? "…" : labels.run}
            </button>
          </div>

          {done && (
            <p className="rounded-md border border-line bg-accent-soft/60 px-3 py-2 text-sm text-accent-ink">
              {labels.toCreate}: {done.created} · {labels.toUpdate}: {done.updated}
            </p>
          )}

          <div className="overflow-x-auto rounded-lg border border-line bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                  <th className="px-4 py-3 font-medium">{labels.externalName}</th>
                  <th className="px-4 py-3 font-medium">{labels.brandModel}</th>
                  <th className="px-4 py-3 font-medium">{labels.regNumber}</th>
                  <th className="px-4 py-3 font-medium">UUID</th>
                  <th className="px-4 py-3 font-medium">Статус</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((v) => (
                  <tr key={v.uuid} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-medium">{v.name}</td>
                    <td className="px-4 py-2.5">
                      {v.brand ? `${v.brand}${v.model ? ` ${v.model}` : ""}` : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[13px]">
                      {v.regNumber ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[12px] text-ink-dim">
                      {v.uuid}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={
                          v.exists
                            ? "rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim"
                            : "rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink"
                        }
                      >
                        {v.exists ? "есть" : "новый"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.total > preview.sample.length && (
            <p className="text-xs text-ink-dim">
              Показаны первые {preview.sample.length} из {preview.total}
            </p>
          )}
        </>
      )}
    </div>
  );
}
