"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  label: string;
  reaction_minutes: number | null;
  execution_hours: number;
  is_active: boolean;
};

export function SlaEditor({
  rows,
  canEdit,
  d,
}: {
  rows: Row[];
  canEdit: boolean;
  d: { type: string; reaction: string; execution: string; active: string; save: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function save(id: string, form: HTMLFormElement) {
    setBusy(id);
    const fd = new FormData(form);
    await fetch("/api/service/sla", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        reaction_minutes: Number(fd.get("reaction")) || null,
        execution_hours: Number(fd.get("execution")),
        is_active: fd.get("active") === "on",
      }),
    });
    setBusy(null);
    router.refresh();
  }

  const input =
    "w-24 rounded-md border border-line bg-card px-2 py-1.5 font-mono text-sm outline-none transition focus:border-accent";

  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
            <th className="px-4 py-3 font-medium">{d.type}</th>
            <th className="px-4 py-3 font-medium">{d.reaction}</th>
            <th className="px-4 py-3 font-medium">{d.execution}</th>
            <th className="px-4 py-3 font-medium">{d.active}</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0">
              <td className="px-4 py-2 font-medium">{r.label}</td>
              {canEdit ? (
                <SlaRowCells r={r} d={d} busy={busy === r.id} onSave={save} inputCls={input} />
              ) : (
                <>
                  <td className="px-4 py-2 font-mono text-[13px]">{r.reaction_minutes ?? "—"}</td>
                  <td className="px-4 py-2 font-mono text-[13px]">{r.execution_hours}</td>
                  <td className="px-4 py-2">{r.is_active ? "✓" : "—"}</td>
                  <td />
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SlaRowCells({
  r,
  d,
  busy,
  onSave,
  inputCls,
}: {
  r: Row;
  d: { save: string };
  busy: boolean;
  onSave: (id: string, form: HTMLFormElement) => void;
  inputCls: string;
}) {
  return (
    <td colSpan={4} className="px-0 py-0">
      <form
        className="flex items-center gap-6 px-4 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(r.id, e.currentTarget);
        }}
      >
        <input name="reaction" type="number" min={0} defaultValue={r.reaction_minutes ?? ""} className={inputCls} />
        <input name="execution" type="number" min={1} required defaultValue={r.execution_hours} className={inputCls} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={r.is_active} className="accent-[var(--accent)]" />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md border border-line px-3 py-1 text-xs transition hover:border-accent hover:text-accent-ink disabled:opacity-50"
        >
          {busy ? "…" : d.save}
        </button>
      </form>
    </td>
  );
}
