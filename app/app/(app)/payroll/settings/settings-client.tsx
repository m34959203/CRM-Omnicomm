"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; name: string };

const input =
  "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
const label = "block text-sm font-medium";
const btnPrimary =
  "rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60";
const btnGhost =
  "rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink";

function useSubmit(url: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(body: Record<string, unknown>, onOk: () => void) {
    setBusy(true);
    setError("");
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      onOk();
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
  }
  return { busy, error, submit };
}

function fdBody(e: React.FormEvent<HTMLFormElement>): Record<string, unknown> {
  const fd = new FormData(e.currentTarget);
  return Object.fromEntries([...fd.entries()].filter(([, v]) => v !== "")) as Record<
    string,
    unknown
  >;
}

/** Универсальные действия строки: вкл/выкл (PATCH is_active) и удаление (DELETE). */
export function RowActions({
  endpoint,
  id,
  isActive,
  deleteLabel,
}: {
  endpoint: string;
  id: string;
  isActive?: boolean;
  deleteLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function call(method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const res = await fetch(`${endpoint}/${id}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
    router.refresh();
  }

  const btn =
    "rounded border border-line bg-card px-2 py-1 text-xs transition hover:border-accent hover:text-accent-ink disabled:opacity-60";
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      {isActive !== undefined && (
        <button disabled={busy} onClick={() => call("PATCH", { is_active: !isActive })} className={btn}>
          {isActive ? "выкл" : "вкл"}
        </button>
      )}
      <button
        disabled={busy}
        onClick={() => confirm(`${deleteLabel}?`) && call("DELETE")}
        className={`${btn} border-red-200 text-red-700 hover:border-red-400`}
      >
        {deleteLabel}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export function CategoryForm({
  labels,
}: {
  labels: { add: string; name: string; note: string; save: string };
}) {
  const [open, setOpen] = useState(false);
  const { busy, error, submit } = useSubmit("/api/payroll/categories");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`mt-3 ${btnGhost}`}>
        {labels.add}
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(fdBody(e), () => setOpen(false));
      }}
      className="mt-3 rounded-lg border border-line bg-card p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          {labels.name} *
          <input name="name" required className={input} />
        </label>
        <label className={label}>
          {labels.note}
          <input name="note" className={input} />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {labels.save}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
          ✕
        </button>
      </div>
    </form>
  );
}

export function AssignForm({
  users,
  categories,
  labels,
}: {
  users: Option[];
  categories: Option[];
  labels: { add: string; performer: string; category: string; validFrom: string; save: string };
}) {
  const [open, setOpen] = useState(false);
  const { busy, error, submit } = useSubmit("/api/payroll/assignments");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`mt-3 ${btnGhost}`}>
        {labels.add}
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(fdBody(e), () => setOpen(false));
      }}
      className="mt-3 rounded-lg border border-line bg-card p-4"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          {labels.performer} *
          <select name="user_id" required defaultValue="" className={input}>
            <option value="" disabled>—</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          {labels.category} *
          <select name="category_id" required defaultValue="" className={input}>
            <option value="" disabled>—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          {labels.validFrom}
          <input name="valid_from" type="date" className={input} />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {labels.save}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
          ✕
        </button>
      </div>
    </form>
  );
}

/** Форма расценки/правила с выбором области default/category/performer. */
function ScopedForm({
  url,
  users,
  categories,
  scopeLabels,
  children,
  addLabel,
  saveLabel,
}: {
  url: string;
  users: Option[];
  categories: Option[];
  scopeLabels: { scope: string; def: string; category: string; performer: string };
  children: React.ReactNode;
  addLabel: string;
  saveLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("default");
  const { busy, error, submit } = useSubmit(url);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`mt-3 ${btnGhost}`}>
        {addLabel}
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const body = fdBody(e);
        if (body.piece_over_norm !== undefined) body.piece_over_norm = true;
        submit(body, () => {
          setOpen(false);
          setScope("default");
        });
      }}
      className="mt-3 rounded-lg border border-line bg-card p-4"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className={label}>
          {scopeLabels.scope}
          <select
            name="scope"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className={input}
          >
            <option value="default">{scopeLabels.def}</option>
            <option value="category">{scopeLabels.category}</option>
            <option value="performer">{scopeLabels.performer}</option>
          </select>
        </label>
        {scope === "category" && (
          <label className={label}>
            {scopeLabels.category} *
            <select name="category_id" required defaultValue="" className={input}>
              <option value="" disabled>—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        {scope === "performer" && (
          <label className={label}>
            {scopeLabels.performer} *
            <select name="user_id" required defaultValue="" className={input}>
              <option value="" disabled>—</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </label>
        )}
        {children}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={busy} className={btnPrimary}>
          {saveLabel}
        </button>
        <button type="button" onClick={() => setOpen(false)} className={btnGhost}>
          ✕
        </button>
      </div>
    </form>
  );
}

export function RateForm({
  users,
  categories,
  workTypes,
  labels,
}: {
  users: Option[];
  categories: Option[];
  workTypes: Option[];
  labels: {
    add: string;
    scope: string;
    scopeDefault: string;
    scopeCategory: string;
    scopePerformer: string;
    workType: string;
    rate: string;
    validFrom: string;
    save: string;
  };
}) {
  return (
    <ScopedForm
      url="/api/payroll/rates"
      users={users}
      categories={categories}
      addLabel={labels.add}
      saveLabel={labels.save}
      scopeLabels={{
        scope: labels.scope,
        def: labels.scopeDefault,
        category: labels.scopeCategory,
        performer: labels.scopePerformer,
      }}
    >
      <label className={label}>
        {labels.workType} *
        <select name="work_type_id" required defaultValue="" className={input}>
          <option value="" disabled>—</option>
          {workTypes.map((w) => (
            <option key={w.id} value={w.id}>{w.name}</option>
          ))}
        </select>
      </label>
      <label className={label}>
        {labels.rate} *
        <input name="rate" type="number" min={0} step="0.01" required className={input} />
      </label>
      <label className={label}>
        {labels.validFrom}
        <input name="valid_from" type="date" className={input} />
      </label>
    </ScopedForm>
  );
}

export function RuleForm({
  users,
  categories,
  labels,
}: {
  users: Option[];
  categories: Option[];
  labels: {
    add: string;
    name: string;
    scope: string;
    scopeDefault: string;
    scopeCategory: string;
    scopePerformer: string;
    salary: string;
    normCount: string;
    pieceOverNorm: string;
    save: string;
  };
}) {
  return (
    <ScopedForm
      url="/api/payroll/rules"
      users={users}
      categories={categories}
      addLabel={labels.add}
      saveLabel={labels.save}
      scopeLabels={{
        scope: labels.scope,
        def: labels.scopeDefault,
        category: labels.scopeCategory,
        performer: labels.scopePerformer,
      }}
    >
      <label className={`${label} sm:col-span-2`}>
        {labels.name} *
        <input name="name" required className={input} />
      </label>
      <label className={label}>
        {labels.salary}
        <input name="salary" type="number" min={0} step="0.01" defaultValue={0} className={input} />
      </label>
      <label className={label}>
        {labels.normCount}
        <input name="norm_count" type="number" min={0} defaultValue={0} className={input} />
      </label>
      <label className={`${label} flex items-end gap-2 pb-2`}>
        <input name="piece_over_norm" type="checkbox" className="h-4 w-4" />
        {labels.pieceOverNorm}
      </label>
    </ScopedForm>
  );
}
