"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Dict } from "@/lib/dict/ru";

type Opt = { id: string; label: string };
type Line = {
  id: string;
  action: string;
  basis: string | null;
  installed_label: string | null;
  removed_label: string | null;
  note: string | null;
};
type Work = {
  id: string;
  work_name: string;
  performer_name: string;
  quantity: string;
  rate: string;
  amount: string;
};
type Material = { id: string; name: string; unit: string; quantity: string; by_norm: boolean };
type SimOp = { id: string; icc: string; msisdn: string | null; op: string; eq_label: string | null };

const ACTIONS = ["install", "replace", "dismantle", "diagnostics", "service"];
const BASES = ["sales_order", "shipped_earlier", "write_off", "warranty", "testing", "safekeeping"];

/** Редактор акта ТО: строки оборудования, работы, материалы, SIM + закрытие/доработка. */
export function ActEditor({
  actId,
  canEdit,
  canClose,
  lines,
  works,
  materials,
  simOps,
  options,
  s,
  common,
}: {
  actId: string;
  canEdit: boolean;
  canClose: boolean;
  lines: Line[];
  works: Work[];
  materials: Material[];
  simOps: SimOp[];
  options: {
    installCandidates: Opt[];
    removeCandidates: Opt[];
    workTypes: { id: string; name: string }[];
    performers: { id: string; full_name: string }[];
    materialNoms: { id: string; name: string; unit: string }[];
    simsFree: Opt[];
    simsAtClient: Opt[];
  };
  s: Dict["service"];
  common: { delete: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [line, setLine] = useState({ action: "install", basis: "sales_order", installed: "", removed: "" });
  const [work, setWork] = useState({ work_type_id: "", performer_id: "", quantity: "1" });
  const [material, setMaterial] = useState({ nomenclature_id: "", quantity: "1" });
  const [simOp, setSimOp] = useState({ sim_id: "", op: "install", equipment_id: "" });

  async function call(method: string, path: string, body?: unknown) {
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
      return null;
    }
    router.refresh();
    return res.json().catch(() => ({}));
  }

  const needInstalled = ["install", "replace"].includes(line.action);
  const needRemoved = ["dismantle", "replace"].includes(line.action);

  const input =
    "rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none transition focus:border-accent";
  const btnSmall =
    "rounded border border-line bg-card px-2.5 py-1.5 text-sm transition hover:border-accent hover:text-accent-ink disabled:opacity-50";
  const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-ink-dim";
  const td = "px-3 py-2 text-sm";
  const section = "mt-6 rounded-lg border border-line bg-card";
  const sectionHead =
    "flex items-center justify-between border-b border-line px-5 py-3 text-sm font-semibold uppercase tracking-wider text-ink-dim";

  return (
    <div>
      {/* ---- строки оборудования ---- */}
      <div className={section}>
        <div className={sectionHead}>{s.lines}</div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              <th className={th}>{s.action}</th>
              <th className={th}>{s.basis}</th>
              <th className={th}>{s.installedUnit}</th>
              <th className={th}>{s.removedUnit}</th>
              {canEdit && <th className={th} />}
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-sm text-ink-dim">
                  —
                </td>
              </tr>
            )}
            {lines.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className={td}>{(s.lineActions as Record<string, string>)[l.action] ?? l.action}</td>
                <td className={td}>{l.basis ? (s.bases as Record<string, string>)[l.basis] : "—"}</td>
                <td className={`${td} font-mono text-[13px]`}>{l.installed_label ?? "—"}</td>
                <td className={`${td} font-mono text-[13px]`}>{l.removed_label ?? "—"}</td>
                {canEdit && (
                  <td className={td}>
                    <button
                      disabled={busy}
                      onClick={() => call("DELETE", `/api/service/acts/${actId}/lines`, { line_id: l.id })}
                      className="text-ink-dim hover:text-danger"
                      title={common.delete}
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
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
            {needInstalled && (
              <select
                value={line.installed}
                onChange={(e) => setLine({ ...line, installed: e.target.value })}
                className={`${input} max-w-72`}
              >
                <option value="">{s.installedUnit}…</option>
                {options.installCandidates.map((o) => (
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
                className={`${input} max-w-72`}
              >
                <option value="">{s.removedUnit}…</option>
                {options.removeCandidates.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            <button
              disabled={busy || (needInstalled && !line.installed) || (needRemoved && !line.removed)}
              onClick={async () => {
                await call("POST", `/api/service/acts/${actId}/lines`, {
                  action: line.action,
                  basis: line.basis || null,
                  installed_equipment_id: needInstalled ? line.installed : null,
                  removed_equipment_id: needRemoved ? line.removed : null,
                });
                setLine({ ...line, installed: "", removed: "" });
              }}
              className={btnSmall}
            >
              + {s.addLine}
            </button>
          </div>
        )}
      </div>

      {/* ---- работы ---- */}
      <div className={section}>
        <div className={sectionHead}>
          <span>{s.works}</span>
          <span className="font-normal normal-case text-ink-dim">({s.rateOnClose})</span>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              <th className={th}>{s.workType}</th>
              <th className={th}>{s.performedBy}</th>
              <th className={th}>{s.quantity}</th>
              <th className={th}>{s.rate}</th>
              <th className={th}>{s.amount}</th>
              {canEdit && <th className={th} />}
            </tr>
          </thead>
          <tbody>
            {works.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-4 text-center text-sm text-ink-dim">
                  —
                </td>
              </tr>
            )}
            {works.map((w) => (
              <tr key={w.id} className="border-b border-line last:border-0">
                <td className={td}>{w.work_name}</td>
                <td className={td}>{w.performer_name}</td>
                <td className={td}>{Number(w.quantity)}</td>
                <td className={td}>{Number(w.rate).toLocaleString("ru-RU")}</td>
                <td className={td}>{Number(w.amount).toLocaleString("ru-RU")}</td>
                {canEdit && (
                  <td className={td}>
                    <button
                      disabled={busy}
                      onClick={() => call("DELETE", `/api/service/acts/${actId}/works`, { work_id: w.id })}
                      className="text-ink-dim hover:text-danger"
                      title={common.delete}
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            <select
              value={work.work_type_id}
              onChange={(e) => setWork({ ...work, work_type_id: e.target.value })}
              className={`${input} max-w-64`}
            >
              <option value="">{s.workType}…</option>
              {options.workTypes.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <select
              value={work.performer_id}
              onChange={(e) => setWork({ ...work, performer_id: e.target.value })}
              className={input}
            >
              <option value="">{s.performedBy}…</option>
              {options.performers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={work.quantity}
              onChange={(e) => setWork({ ...work, quantity: e.target.value })}
              className={`${input} w-20`}
            />
            <button
              disabled={busy || !work.work_type_id || !work.performer_id}
              onClick={async () => {
                await call("POST", `/api/service/acts/${actId}/works`, work);
                setWork({ ...work, work_type_id: "" });
              }}
              className={btnSmall}
            >
              + {s.addWork}
            </button>
          </div>
        )}
      </div>

      {/* ---- материалы ---- */}
      <div className={section}>
        <div className={sectionHead}>
          <span>{s.materials}</span>
          {canEdit && (
            <button
              disabled={busy}
              onClick={() => call("POST", `/api/service/acts/${actId}/materials`, { fill_norms: true })}
              className={`${btnSmall} normal-case`}
            >
              {s.fillByNorms}
            </button>
          )}
        </div>
        <table className="w-full">
          <tbody>
            {materials.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-center text-sm text-ink-dim">—</td>
              </tr>
            )}
            {materials.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className={td}>
                  {m.name}
                  {m.by_norm && (
                    <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim">
                      {s.byNorm}
                    </span>
                  )}
                </td>
                <td className={td}>
                  {Number(m.quantity)} {m.unit}
                </td>
                {canEdit && (
                  <td className={`${td} w-10`}>
                    <button
                      disabled={busy}
                      onClick={() =>
                        call("DELETE", `/api/service/acts/${actId}/materials`, { material_id: m.id })
                      }
                      className="text-ink-dim hover:text-danger"
                      title={common.delete}
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            <select
              value={material.nomenclature_id}
              onChange={(e) => setMaterial({ ...material, nomenclature_id: e.target.value })}
              className={`${input} max-w-64`}
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
              min="0.001"
              step="0.001"
              value={material.quantity}
              onChange={(e) => setMaterial({ ...material, quantity: e.target.value })}
              className={`${input} w-24`}
            />
            <button
              disabled={busy || !material.nomenclature_id}
              onClick={async () => {
                await call("POST", `/api/service/acts/${actId}/materials`, material);
                setMaterial({ nomenclature_id: "", quantity: "1" });
              }}
              className={btnSmall}
            >
              + {s.addMaterial}
            </button>
          </div>
        )}
      </div>

      {/* ---- SIM ---- */}
      <div className={section}>
        <div className={sectionHead}>{s.simOps}</div>
        <table className="w-full">
          <tbody>
            {simOps.length === 0 && (
              <tr>
                <td className="px-3 py-4 text-center text-sm text-ink-dim">—</td>
              </tr>
            )}
            {simOps.map((so) => (
              <tr key={so.id} className="border-b border-line last:border-0">
                <td className={td}>{so.op === "install" ? s.simInstall : s.simRemove}</td>
                <td className={`${td} font-mono text-[13px]`}>
                  {so.icc}
                  {so.msisdn ? ` · ${so.msisdn}` : ""}
                </td>
                <td className={`${td} font-mono text-[13px]`}>{so.eq_label ?? "—"}</td>
                {canEdit && (
                  <td className={`${td} w-10`}>
                    <button
                      disabled={busy}
                      onClick={() => call("DELETE", `/api/service/acts/${actId}/sim-ops`, { op_id: so.id })}
                      className="text-ink-dim hover:text-danger"
                      title={common.delete}
                    >
                      ×
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
            <select
              value={simOp.op}
              onChange={(e) => setSimOp({ ...simOp, op: e.target.value, sim_id: "" })}
              className={input}
            >
              <option value="install">{s.simInstall}</option>
              <option value="remove">{s.simRemove}</option>
            </select>
            <select
              value={simOp.sim_id}
              onChange={(e) => setSimOp({ ...simOp, sim_id: e.target.value })}
              className={`${input} max-w-64`}
            >
              <option value="">SIM…</option>
              {(simOp.op === "install" ? options.simsFree : options.simsAtClient).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            {simOp.op === "install" && (
              <select
                value={simOp.equipment_id}
                onChange={(e) => setSimOp({ ...simOp, equipment_id: e.target.value })}
                className={`${input} max-w-64`}
              >
                <option value="">{s.equipment}…</option>
                {[...options.installCandidates, ...options.removeCandidates].map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            <button
              disabled={busy || !simOp.sim_id || (simOp.op === "install" && !simOp.equipment_id)}
              onClick={async () => {
                await call("POST", `/api/service/acts/${actId}/sim-ops`, {
                  sim_id: simOp.sim_id,
                  op: simOp.op,
                  equipment_id: simOp.op === "install" ? simOp.equipment_id : null,
                });
                setSimOp({ ...simOp, sim_id: "", equipment_id: "" });
              }}
              className={btnSmall}
            >
              + {s.addSimOp}
            </button>
          </div>
        )}
      </div>

      {/* ---- закрытие / доработка ---- */}
      {(canClose || canEdit) && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {canClose && (
            <button
              disabled={busy}
              onClick={async () => {
                if (!confirm(s.closeActConfirm)) return;
                const res = await call("POST", `/api/service/acts/${actId}/close`, {});
                if (res) router.refresh();
              }}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-50"
            >
              {s.closeAct}
            </button>
          )}
          {canEdit && (
            <button
              disabled={busy}
              onClick={async () => {
                const note = prompt(s.reworkNote) ?? "";
                const res = await call("POST", `/api/service/acts/${actId}/rework`, { note });
                if (res?.newWorkOrderId) router.push(`/service/orders/${res.newWorkOrderId}`);
              }}
              className="rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 transition hover:border-amber-500 disabled:opacity-50"
            >
              {s.needsRework}
            </button>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      )}
      {!canClose && !canEdit && error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
