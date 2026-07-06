"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type AttachmentItem = {
  id: string;
  kind: string;
  place: string | null;
  filename: string | null;
};

/** Галерея вложений + загрузка (фото акта/заявки). Файлы — через /api/files/[id]. */
export function AttachmentsGallery({
  entityType,
  entityId,
  items,
  labels,
  canUpload,
}: {
  entityType: string;
  entityId: string;
  items: AttachmentItem[];
  labels: { title: string; upload: string };
  canUpload: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("entity_type", entityType);
      fd.set("entity_id", entityId);
      fd.set("kind", "photo");
      const res = await fetch("/api/attachments", { method: "POST", body: fd });
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`);
        break;
      }
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    router.refresh();
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
          {labels.title}
        </h2>
        {canUpload && (
          <label className="cursor-pointer rounded border border-line bg-card px-2 py-1 text-xs transition hover:border-accent hover:text-accent-ink">
            {busy ? "…" : labels.upload}
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              multiple
              className="hidden"
              disabled={busy}
              onChange={(e) => upload(e.target.files)}
            />
          </label>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {items.length === 0 && <span className="text-sm text-ink-dim">—</span>}
        {items.map((a) => (
          <a
            key={a.id}
            href={`/api/files/${a.id}`}
            target="_blank"
            rel="noreferrer"
            className="group relative block h-24 w-24 overflow-hidden rounded border border-line bg-paper"
            title={a.filename ?? a.id}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/files/${a.id}`}
              alt={a.filename ?? ""}
              className="h-full w-full object-cover transition group-hover:scale-105"
            />
            {a.place && (
              <span className="absolute bottom-0 left-0 right-0 bg-chrome/70 px-1 py-0.5 text-[10px] text-white">
                {a.place}
              </span>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
