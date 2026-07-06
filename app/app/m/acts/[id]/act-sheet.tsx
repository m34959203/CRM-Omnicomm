"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/lib/dict/ru";
import { SignaturePad } from "./signature-pad";

/**
 * Акт ТО техника — один прокручиваемый лист со сворачиваемыми разделами
 * (референс: Аскан, скрин ascan_T2). Мутации — через существующие API акта;
 * акт остаётся in_preparation: закрывает офис («Отправить в офис» — норма процесса).
 */

type Opt = { id: string; label: string };
type Line = {
  id: string;
  action: string;
  basis: string | null;
  installed_label: string | null;
  removed_label: string | null;
};
type Work = { id: string; work_name: string; quantity: string };
type Material = { id: string; name: string; unit: string; quantity: string; by_norm: boolean };
type SimOp = { id: string; icc: string; msisdn: string | null; op: string; eq_label: string | null };
type Photo = { id: string; filename: string | null };

const ACTIONS = ["install", "replace", "dismantle", "diagnostics", "service"];
const BASES = ["sales_order", "shipped_earlier", "write_off", "warranty", "testing", "safekeeping"];

/** Сворачиваемый раздел листа (module scope — иначе ремаунт при каждом рендере). */
function Section({
  title,
  count,
  open,
  children,
}: {
  title: string;
  count?: number;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={open}
      className="group rounded-xl border border-chrome-line bg-chrome-raised open:pb-4"
    >
      <summary className="flex min-h-13 cursor-pointer select-none items-center justify-between gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold uppercase tracking-wider text-chrome-text">
          {title}
          {typeof count === "number" && count > 0 && (
            <span className="ml-2 rounded bg-accent/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold normal-case text-accent">
              {count}
            </span>
          )}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4 w-4 text-chrome-dim transition group-open:rotate-180"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="px-4">{children}</div>
    </details>
  );
}

export function ActSheet({
  actId,
  editable,
  signerName,
  signedAt,
  lines,
  works,
  materials,
  simOps,
  photos,
  signaturePhotoId,
  options,
  m,
  s,
  del,
}: {
  actId: string;
  editable: boolean;
  signerName: string | null;
  signedAt: string | null; // отформатировано на сервере
  lines: Line[];
  works: Work[];
  materials: Material[];
  simOps: SimOp[];
  photos: Photo[];
  signaturePhotoId: string | null;
  options: {
    myUnits: Opt[]; // мой склад (holder_id = я)
    clientUnits: Opt[]; // установлено у клиента объекта
    workTypes: { id: string; name: string }[];
    materialNoms: { id: string; name: string; unit: string }[];
    mySims: Opt[]; // мои SIM (holder_id = я / склад техника)
    clientSims: Opt[];
  };
  m: Dict["mobile"]["act"];
  s: Dict["service"];
  del: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [signer, setSigner] = useState(signerName ?? "");

  const [line, setLine] = useState({ action: "install", basis: "sales_order", installed: "", removed: "" });
  const [work, setWork] = useState({ work_type_id: "", quantity: "1" });
  const [material, setMaterial] = useState({ nomenclature_id: "", quantity: "1" });
  const [simOp, setSimOp] = useState({ sim_id: "", op: "install", equipment_id: "" });

  async function call(method: string, path: string, body?: unknown): Promise<boolean> {
    setBusy(true);
    setError("");
    const res = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
      return false;
    }
    router.refresh();
    return true;
  }

  async function uploadFiles(files: FileList | File[], kind: "photo" | "signature") {
    setBusy(true);
    setError("");
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("entity_type", "maintenance_act");
      fd.set("entity_id", actId);
      fd.set("kind", kind);
      const res = await fetch("/api/attachments", { method: "POST", body: fd });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
        setBusy(false);
        return false;
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
    return true;
  }

  const needInstalled = ["install", "replace"].includes(line.action);
  const needRemoved = ["dismantle", "replace"].includes(line.action);

  const input =
    "min-h-11 w-full rounded-lg border border-chrome-line bg-chrome px-3 py-2 text-sm text-white outline-none transition focus:border-accent";
  const addBtn =
    "flex min-h-11 w-full items-center justify-center rounded-lg border border-accent/50 bg-accent/10 text-sm font-semibold text-accent transition active:scale-[0.98] disabled:opacity-40";
  const row = "flex items-start justify-between gap-3 border-b border-chrome-line py-2.5 last:border-0";
  const delBtn = "shrink-0 px-2 text-lg leading-none text-chrome-dim active:text-danger";

  return (
    <div className="mt-4 space-y-3">
      {/* Подписант от клиента — в «Основном» (шапку рендерит серверная страница выше) */}
      <Section title={m.main} open>
        <label className="block text-xs uppercase tracking-wider text-chrome-dim">
          {m.signerName}
          <span className="mt-1.5 flex gap-2">
            <input
              value={signer}
              onChange={(e) => setSigner(e.target.value)}
              placeholder={m.signerPlaceholder}
              disabled={!editable || busy}
              className={input}
            />
            {editable && (
              <button
                disabled={busy || signer.trim() === (signerName ?? "")}
                onClick={() => call("PATCH", `/api/service/acts/${actId}`, { client_signer_name: signer })}
                className="min-h-11 shrink-0 rounded-lg border border-chrome-line px-3 text-sm font-medium text-chrome-text transition active:scale-95 disabled:opacity-40"
              >
                {m.saveSigner}
              </button>
            )}
          </span>
        </label>
        {signedAt && (
          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-emerald-300">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
            {m.signedAt}: {signedAt}
          </p>
        )}
      </Section>

      {/* Оборудование */}
      <Section title={s.lines} count={lines.length} open={editable}>
        {lines.map((l) => (
          <div key={l.id} className={row}>
            <div className="min-w-0 text-sm">
              <span className="font-medium text-white">
                {(s.lineActions as Record<string, string>)[l.action] ?? l.action}
              </span>
              {l.basis && (
                <span className="text-chrome-dim"> · {(s.bases as Record<string, string>)[l.basis]}</span>
              )}
              {l.installed_label && (
                <span className="mt-0.5 block font-mono text-[13px] text-chrome-text">
                  + {l.installed_label}
                </span>
              )}
              {l.removed_label && (
                <span className="mt-0.5 block font-mono text-[13px] text-chrome-dim">
                  – {l.removed_label}
                </span>
              )}
            </div>
            {editable && (
              <button
                disabled={busy}
                title={del}
                onClick={() => call("DELETE", `/api/service/acts/${actId}/lines`, { line_id: l.id })}
                className={delBtn}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {editable && (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={line.action}
                onChange={(e) => setLine({ ...line, action: e.target.value })}
                className={input}
              >
                {ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {(s.lineActions as Record<string, string>)[a]}
                  </option>
                ))}
              </select>
              <select
                value={line.basis}
                onChange={(e) => setLine({ ...line, basis: e.target.value })}
                className={input}
              >
                {BASES.map((b) => (
                  <option key={b} value={b}>
                    {(s.bases as Record<string, string>)[b]}
                  </option>
                ))}
              </select>
            </div>
            {needInstalled && (
              <select
                value={line.installed}
                onChange={(e) => setLine({ ...line, installed: e.target.value })}
                className={input}
              >
                <option value="">{m.myUnit}…</option>
                {options.myUnits.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            {needRemoved && (
              <select
                value={line.removed}
                onChange={(e) => setLine({ ...line, removed: e.target.value })}
                className={input}
              >
                <option value="">{m.removedUnit}…</option>
                {options.clientUnits.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            <button
              disabled={busy || (needInstalled && !line.installed) || (needRemoved && !line.removed)}
              onClick={async () => {
                const ok = await call("POST", `/api/service/acts/${actId}/lines`, {
                  action: line.action,
                  basis: line.basis || null,
                  installed_equipment_id: needInstalled ? line.installed : null,
                  removed_equipment_id: needRemoved ? line.removed : null,
                });
                if (ok) setLine({ ...line, installed: "", removed: "" });
              }}
              className={addBtn}
            >
              + {s.addLine}
            </button>
          </div>
        )}
      </Section>

      {/* Работы (исполнитель = я) */}
      <Section title={s.works} count={works.length}>
        {works.map((w) => (
          <div key={w.id} className={row}>
            <span className="text-sm text-white">
              {w.work_name}
              <span className="ml-2 font-mono text-[13px] text-chrome-dim">× {Number(w.quantity)}</span>
            </span>
            {editable && (
              <button
                disabled={busy}
                title={del}
                onClick={() => call("DELETE", `/api/service/acts/${actId}/works`, { work_id: w.id })}
                className={delBtn}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {editable && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <select
                value={work.work_type_id}
                onChange={(e) => setWork({ ...work, work_type_id: e.target.value })}
                className={input}
              >
                <option value="">{s.workType}…</option>
                {options.workTypes.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="decimal"
                min="0.5"
                step="0.5"
                value={work.quantity}
                onChange={(e) => setWork({ ...work, quantity: e.target.value })}
                className={`${input} w-20 shrink-0`}
              />
            </div>
            <button
              disabled={busy || !work.work_type_id}
              onClick={async () => {
                const ok = await call("POST", `/api/service/acts/${actId}/works`, work);
                if (ok) setWork({ work_type_id: "", quantity: "1" });
              }}
              className={addBtn}
            >
              + {s.addWork}
            </button>
          </div>
        )}
      </Section>

      {/* Материалы */}
      <Section title={s.materials} count={materials.length}>
        {materials.map((mt) => (
          <div key={mt.id} className={row}>
            <span className="text-sm text-white">
              {mt.name}
              <span className="ml-2 font-mono text-[13px] text-chrome-dim">
                {Number(mt.quantity)} {mt.unit}
              </span>
              {mt.by_norm && (
                <span className="ml-2 rounded bg-chrome px-1.5 py-0.5 text-[11px] text-chrome-dim">
                  {s.byNorm}
                </span>
              )}
            </span>
            {editable && (
              <button
                disabled={busy}
                title={del}
                onClick={() =>
                  call("DELETE", `/api/service/acts/${actId}/materials`, { material_id: mt.id })
                }
                className={delBtn}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {editable && (
          <div className="mt-3 space-y-2">
            <button
              disabled={busy}
              onClick={() => call("POST", `/api/service/acts/${actId}/materials`, { fill_norms: true })}
              className="flex min-h-11 w-full items-center justify-center rounded-lg border border-chrome-line text-sm font-medium text-chrome-text transition active:scale-[0.98] disabled:opacity-40"
            >
              {s.fillByNorms}
            </button>
            <div className="flex gap-2">
              <select
                value={material.nomenclature_id}
                onChange={(e) => setMaterial({ ...material, nomenclature_id: e.target.value })}
                className={input}
              >
                <option value="">{s.materials}…</option>
                {options.materialNoms.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.unit})
                  </option>
                ))}
              </select>
              <input
                type="number"
                inputMode="decimal"
                min="0.001"
                step="0.001"
                value={material.quantity}
                onChange={(e) => setMaterial({ ...material, quantity: e.target.value })}
                className={`${input} w-24 shrink-0`}
              />
            </div>
            <button
              disabled={busy || !material.nomenclature_id}
              onClick={async () => {
                const ok = await call("POST", `/api/service/acts/${actId}/materials`, material);
                if (ok) setMaterial({ nomenclature_id: "", quantity: "1" });
              }}
              className={addBtn}
            >
              + {s.addMaterial}
            </button>
          </div>
        )}
      </Section>

      {/* SIM */}
      <Section title={s.simOps} count={simOps.length}>
        {simOps.map((so) => (
          <div key={so.id} className={row}>
            <span className="min-w-0 text-sm text-white">
              {so.op === "install" ? s.simInstall : s.simRemove}
              <span className="mt-0.5 block font-mono text-[13px] text-chrome-text">
                {so.icc}
                {so.msisdn ? ` · ${so.msisdn}` : ""}
              </span>
              {so.eq_label && (
                <span className="block font-mono text-[13px] text-chrome-dim">→ {so.eq_label}</span>
              )}
            </span>
            {editable && (
              <button
                disabled={busy}
                title={del}
                onClick={() => call("DELETE", `/api/service/acts/${actId}/sim-ops`, { op_id: so.id })}
                className={delBtn}
              >
                ×
              </button>
            )}
          </div>
        ))}
        {editable && (
          <div className="mt-3 space-y-2">
            <select
              value={simOp.op}
              onChange={(e) => setSimOp({ op: e.target.value, sim_id: "", equipment_id: "" })}
              className={input}
            >
              <option value="install">{s.simInstall}</option>
              <option value="remove">{s.simRemove}</option>
            </select>
            <select
              value={simOp.sim_id}
              onChange={(e) => setSimOp({ ...simOp, sim_id: e.target.value })}
              className={input}
            >
              <option value="">SIM…</option>
              {(simOp.op === "install" ? options.mySims : options.clientSims).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {simOp.op === "install" && (
              <select
                value={simOp.equipment_id}
                onChange={(e) => setSimOp({ ...simOp, equipment_id: e.target.value })}
                className={input}
              >
                <option value="">{m.forEquipment}…</option>
                {[...options.myUnits, ...options.clientUnits].map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            <button
              disabled={busy || !simOp.sim_id || (simOp.op === "install" && !simOp.equipment_id)}
              onClick={async () => {
                const ok = await call("POST", `/api/service/acts/${actId}/sim-ops`, {
                  sim_id: simOp.sim_id,
                  op: simOp.op,
                  equipment_id: simOp.op === "install" ? simOp.equipment_id : null,
                });
                if (ok) setSimOp({ ...simOp, sim_id: "", equipment_id: "" });
              }}
              className={addBtn}
            >
              + {s.addSimOp}
            </button>
          </div>
        )}
      </Section>

      {/* Фотофиксация */}
      <Section title={m.photos} count={photos.length} open={editable}>
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <a
              key={p.id}
              href={`/api/files/${p.id}`}
              target="_blank"
              rel="noreferrer"
              className="block aspect-square overflow-hidden rounded-lg border border-chrome-line bg-chrome"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/files/${p.id}`}
                alt={p.filename ?? ""}
                className="h-full w-full object-cover"
              />
            </a>
          ))}
          {editable && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-chrome-line text-chrome-dim transition active:scale-95">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                <path d="M4 8a2 2 0 0 1 2-2h1.5l1.5-2h6l1.5 2H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" strokeLinejoin="round" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              <span className="px-1 text-center text-[10px] leading-tight">{m.addPhoto}</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                disabled={busy}
                className="hidden"
                onChange={(e) => e.target.files && uploadFiles(e.target.files, "photo")}
              />
            </label>
          )}
        </div>
      </Section>

      {/* Подпись клиента */}
      <Section title={m.signature} count={signaturePhotoId ? 1 : 0} open={editable && !signaturePhotoId}>
        {signaturePhotoId ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/${signaturePhotoId}`}
              alt={m.signature}
              className="h-32 w-full rounded-lg border border-chrome-line bg-white object-contain"
            />
            {signedAt && (
              <p className="mt-2 text-xs text-chrome-dim">
                {m.signedAt}: {signedAt}
                {signerName ? ` · ${signerName}` : ""}
              </p>
            )}
          </div>
        ) : editable ? (
          <SignaturePad
            labels={{ hint: m.drawHint, clear: m.clear, save: m.saveSignature }}
            busy={busy}
            onSave={async (blob) => {
              const file = new File([blob], "signature.png", { type: "image/png" });
              const ok = await uploadFiles([file], "signature");
              if (ok) {
                await call("PATCH", `/api/service/acts/${actId}`, {
                  signed: true,
                  ...(signer.trim() ? { client_signer_name: signer.trim() } : {}),
                });
              }
            }}
          />
        ) : (
          <p className="text-sm text-chrome-dim">—</p>
        )}
      </Section>

      {error && <p className="text-sm text-danger">{error}</p>}

      {/* Отправить в офис */}
      {editable &&
        (sent ? (
          <p className="rounded-xl border border-ok/40 bg-ok/10 px-4 py-3.5 text-sm text-emerald-300">
            {m.sentInfo}
          </p>
        ) : (
          <button
            disabled={busy}
            onClick={async () => {
              const ok = await call("PATCH", `/api/service/acts/${actId}`, { submitted: true });
              if (ok) setSent(true);
            }}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-semibold text-white transition active:scale-[0.98] disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {m.sendToOffice}
          </button>
        ))}
      {!editable && (
        <p className="rounded-xl border border-chrome-line bg-chrome-raised px-4 py-3.5 text-sm text-chrome-dim">
          {m.notEditable}
        </p>
      )}
    </div>
  );
}
