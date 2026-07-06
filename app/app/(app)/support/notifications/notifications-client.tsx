"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const input =
  "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
const label = "block text-sm font-medium";
const btnGhost =
  "rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink disabled:opacity-60";

/** Кнопка «Отправить сейчас» — запуск джоба обработки очереди (admin/head). */
export function SendNowButton({
  labels,
}: {
  labels: { send: string; processed: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function run() {
    setBusy(true);
    setMsg("");
    const res = await fetch("/api/jobs/notify", { method: "POST" });
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setMsg(
        `${labels.processed}: sent ${data?.sent ?? 0}, failed ${data?.failed ?? 0}, dry-run ${data?.dryRun ?? 0}`
      );
      router.refresh();
    } else {
      setMsg(data?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex items-center gap-3">
      <button
        onClick={run}
        disabled={busy}
        className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
      >
        {busy ? "…" : labels.send}
      </button>
      {msg && <span className="text-sm text-ink-dim">{msg}</span>}
    </span>
  );
}

/** Отмена элемента очереди (queued/failed → cancelled). */
export function CancelQueueItemButton({ id, labelCancel }: { id: string; labelCancel: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    await fetch(`/api/support/notifications/queue/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    setBusy(false);
    router.refresh();
  }
  return (
    <button
      disabled={busy}
      onClick={cancel}
      className="rounded border border-red-200 bg-card px-2 py-1 text-xs text-red-700 transition hover:border-red-400 disabled:opacity-60"
    >
      {labelCancel}
    </button>
  );
}

export type TemplateRow = {
  id: string;
  code: string;
  channel: string;
  subject_ru: string | null;
  subject_kk: string | null;
  body_ru: string;
  body_kk: string | null;
  is_active: boolean;
};

/** Создание/редактирование шаблона уведомления. */
export function TemplateForm({
  channels,
  initial,
  labels,
  onDone,
}: {
  channels: [string, string][];
  initial?: TemplateRow;
  labels: {
    add: string;
    code: string;
    channel: string;
    subjectRu: string;
    subjectKk: string;
    bodyRu: string;
    bodyKk: string;
    save: string;
  };
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    const res = await fetch(
      initial
        ? `/api/support/notifications/templates/${initial.id}`
        : "/api/support/notifications/templates",
      {
        method: initial ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    if (res.ok) {
      setOpen(false);
      onDone?.();
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={`mt-3 ${btnGhost}`}>
        {labels.add}
      </button>
    );
  }
  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-line bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          {labels.code} *
          <input
            name="code"
            required
            defaultValue={initial?.code}
            disabled={Boolean(initial)}
            className={`${input} disabled:opacity-60`}
          />
        </label>
        <label className={label}>
          {labels.channel}
          <select name="channel" defaultValue={initial?.channel ?? "email"} className={input}>
            {channels.map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className={label}>
          {labels.subjectRu}
          <input name="subject_ru" defaultValue={initial?.subject_ru ?? ""} className={input} />
        </label>
        <label className={label}>
          {labels.subjectKk}
          <input name="subject_kk" defaultValue={initial?.subject_kk ?? ""} className={input} />
        </label>
        <label className={label}>
          {labels.bodyRu} *
          <textarea name="body_ru" rows={4} required defaultValue={initial?.body_ru} className={input} />
        </label>
        <label className={label}>
          {labels.bodyKk}
          <textarea name="body_kk" rows={4} defaultValue={initial?.body_kk ?? ""} className={input} />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
        >
          {labels.save}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onDone?.();
          }}
          className={btnGhost}
        >
          ✕
        </button>
      </div>
    </form>
  );
}

/** Строка шаблона: изменить (инлайн-форма), вкл/выкл, удалить. */
export function TemplateRowActions({
  template,
  channels,
  labels,
}: {
  template: TemplateRow;
  channels: [string, string][];
  labels: {
    edit: string;
    delete: string;
    code: string;
    channel: string;
    subjectRu: string;
    subjectKk: string;
    bodyRu: string;
    bodyKk: string;
    save: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  async function call(method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/support/notifications/templates/${template.id}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    setBusy(false);
    router.refresh();
  }

  const btn =
    "rounded border border-line bg-card px-2 py-1 text-xs transition hover:border-accent hover:text-accent-ink disabled:opacity-60";

  if (editing) {
    return (
      <TemplateForm
        channels={channels}
        initial={template}
        labels={{ add: labels.edit, ...labels }}
        onDone={() => setEditing(false)}
      />
    );
  }
  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <button disabled={busy} onClick={() => setEditing(true)} className={btn}>
        {labels.edit}
      </button>
      <button
        disabled={busy}
        onClick={() => call("PATCH", { is_active: !template.is_active })}
        className={btn}
      >
        {template.is_active ? "выкл" : "вкл"}
      </button>
      <button
        disabled={busy}
        onClick={() => confirm(`${labels.delete}?`) && call("DELETE")}
        className={`${btn} border-red-200 text-red-700 hover:border-red-400`}
      >
        {labels.delete}
      </button>
    </div>
  );
}
