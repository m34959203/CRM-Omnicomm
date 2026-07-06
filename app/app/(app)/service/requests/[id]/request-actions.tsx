"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type UserOption = { id: string; full_name: string; role_code: string };

/** Смена статуса (result_comment обязателен для closed/completed) + назначение исполнителей. */
export function RequestActions({
  id,
  status,
  managerId,
  supportId,
  installerId,
  users,
  s,
}: {
  id: string;
  status: string;
  managerId: string | null;
  supportId: string | null;
  installerId: string | null;
  users: UserOption[];
  s: {
    changeStatus: string;
    resultComment: string;
    statuses: Record<string, string>;
    manager: string;
    support: string;
    installer: string;
    save: string;
    createOrder: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newStatus, setNewStatus] = useState(status);
  const [comment, setComment] = useState("");

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/service/requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
    }
    setBusy(false);
    router.refresh();
  }

  const needComment = ["closed", "completed"].includes(newStatus);
  const input =
    "rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none transition focus:border-accent";
  const managers = users.filter((u) => ["manager", "head", "admin"].includes(u.role_code));
  const supports = users.filter((u) => u.role_code === "support");
  const installers = users.filter((u) => u.role_code === "installer");

  return (
    <div className="rounded-lg border border-line bg-card p-5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm font-medium">
          {s.changeStatus}
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            className={`${input} mt-1 block`}
          >
            {Object.entries(s.statuses).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        {needComment && (
          <label className="block flex-1 text-sm font-medium">
            {s.resultComment} *
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className={`${input} mt-1 block w-full`}
            />
          </label>
        )}
        <button
          disabled={busy || newStatus === status || (needComment && !comment.trim())}
          onClick={() => patch({ status: newStatus, result_comment: comment.trim() || undefined })}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-50"
        >
          {s.save}
        </button>
        <a
          href={`/service/orders/new?request_id=${id}`}
          className="rounded-md border border-line bg-card px-3 py-1.5 text-sm transition hover:border-accent hover:text-accent-ink"
        >
          {s.createOrder}
        </a>
      </div>

      <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
        {(
          [
            ["manager_id", s.manager, managerId, managers],
            ["support_id", s.support, supportId, supports],
            ["installer_id", s.installer, installerId, installers],
          ] as [string, string, string | null, UserOption[]][]
        ).map(([field, label, current, list]) => (
          <label key={field} className="block text-sm font-medium">
            {label}
            <select
              value={current ?? ""}
              disabled={busy}
              onChange={(e) => patch({ [field]: e.target.value || null })}
              className={`${input} mt-1 block w-full`}
            >
              <option value="">—</option>
              {list.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
