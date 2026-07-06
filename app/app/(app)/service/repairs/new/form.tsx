"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Dict } from "@/lib/dict/ru";

type Option = { id: string; name: string };
type EqOption = { id: string; label: string };

const DOC_TYPES = [
  "receive_from_client",
  "send_to_supplier",
  "receive_from_supplier",
  "issue_to_client",
] as const;

export function NewRepairForm({
  d,
  clients,
  suppliers,
  warehouses,
  stock,
  atSupplier,
  openReceiveDocs,
}: {
  d: Dict;
  clients: Option[];
  suppliers: Option[];
  warehouses: Option[];
  stock: EqOption[];
  atSupplier: EqOption[];
  openReceiveDocs: { id: string; label: string; client_id: string }[];
}) {
  const s = d.service;
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [docType, setDocType] = useState<(typeof DOC_TYPES)[number]>("receive_from_client");
  const [clientId, setClientId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [clientEquipment, setClientEquipment] = useState<EqOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [isReplacement, setIsReplacement] = useState(false);
  const [defect, setDefect] = useState("");
  const [closeDocId, setCloseDocId] = useState("");
  const [note, setNote] = useState("");

  const needClient = ["receive_from_client", "issue_to_client"].includes(docType);
  const needSupplier = ["send_to_supplier", "receive_from_supplier"].includes(docType);
  const needWarehouse = ["receive_from_client", "receive_from_supplier"].includes(docType);

  // единицы для выбора по типу документа
  const unitOptions: EqOption[] =
    docType === "receive_from_client"
      ? clientEquipment
      : docType === "receive_from_supplier"
        ? atSupplier
        : stock;

  async function onClientChange(id: string) {
    setClientId(id);
    setSelected([]);
    setClientEquipment([]);
    if (!id) return;
    const res = await fetch(`/api/equipment?client_id=${id}&status=installed`);
    if (res.ok) {
      const rows: { id: string; nomenclature_name: string; serial_number: string | null; object_name: string | null }[] =
        await res.json();
      setClientEquipment(
        rows.map((r) => ({
          id: r.id,
          label: `${r.nomenclature_name}${r.serial_number ? ` · SN ${r.serial_number}` : ""}${r.object_name ? ` · ${r.object_name}` : ""}`,
        }))
      );
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/service/repairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc_type: docType,
        client_id: needClient ? clientId : null,
        supplier_id: needSupplier ? supplierId : null,
        warehouse_id: needWarehouse ? warehouseId : null,
        close_receive_doc_id: docType === "issue_to_client" ? closeDocId || null : null,
        note: note || null,
        items: selected.map((id) => ({
          equipment_id: id,
          is_replacement: docType === "issue_to_client" ? isReplacement : false,
          defect_note: docType === "receive_from_client" ? defect || null : null,
        })),
      }),
    });
    if (res.ok) {
      router.push("/service/repairs");
      router.refresh();
    } else {
      setError((await res.json().catch(() => null))?.error ?? "error");
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-md border border-line bg-card px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20";
  const label = "block text-sm font-medium";

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">{s.newRepairDoc}</h1>
      <form onSubmit={submit} className="mt-6 space-y-6">
        <fieldset className="rounded-lg border border-line bg-card p-5">
          <legend className="px-2 text-xs uppercase tracking-wider text-ink-dim">
            {s.repairsTitle}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={`${label} sm:col-span-2`}>
              {s.docType} *
              <select
                value={docType}
                onChange={(e) => {
                  setDocType(e.target.value as (typeof DOC_TYPES)[number]);
                  setSelected([]);
                }}
                className={input}
              >
                {DOC_TYPES.map((tp) => (
                  <option key={tp} value={tp}>
                    {(s.repairDocTypes as Record<string, string>)[tp]}
                  </option>
                ))}
              </select>
            </label>
            {needClient && (
              <label className={label}>
                {s.client} *
                <select
                  required
                  value={clientId}
                  onChange={(e) => onClientChange(e.target.value)}
                  className={input}
                >
                  <option value="" disabled>
                    —
                  </option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {needSupplier && (
              <label className={label}>
                {s.supplier} *
                <select
                  required
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className={input}
                >
                  <option value="" disabled>
                    —
                  </option>
                  {suppliers.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {needWarehouse && (
              <label className={label}>
                {s.warehouse} *
                <select
                  required
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className={input}
                >
                  <option value="" disabled>
                    —
                  </option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={`${label} sm:col-span-2`}>
              {s.selectUnits} *
              <select
                multiple
                required
                size={Math.min(8, Math.max(4, unitOptions.length))}
                value={selected}
                onChange={(e) =>
                  setSelected(Array.from(e.target.selectedOptions).map((o) => o.value))
                }
                className={input}
              >
                {unitOptions.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.label}
                  </option>
                ))}
              </select>
            </label>
            {docType === "receive_from_client" && (
              <label className={`${label} sm:col-span-2`}>
                {s.defect}
                <input value={defect} onChange={(e) => setDefect(e.target.value)} className={input} />
              </label>
            )}
            {docType === "issue_to_client" && (
              <>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={isReplacement}
                    onChange={(e) => setIsReplacement(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  {s.isReplacement}
                </label>
                <label className={label}>
                  {s.closeDoc}
                  <select
                    value={closeDocId}
                    onChange={(e) => setCloseDocId(e.target.value)}
                    className={input}
                  >
                    <option value="">—</option>
                    {openReceiveDocs
                      .filter((doc) => !clientId || doc.client_id === clientId)
                      .map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          {doc.label}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
            <label className={`${label} sm:col-span-2`}>
              {s.note}
              <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
            </label>
          </div>
        </fieldset>

        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy || selected.length === 0}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink disabled:opacity-60"
          >
            {d.common.create}
          </button>
          <Link
            href="/service/repairs"
            className="rounded-md border border-line bg-card px-4 py-2 text-sm transition hover:border-accent"
          >
            {d.common.cancel}
          </Link>
        </div>
      </form>
    </div>
  );
}
