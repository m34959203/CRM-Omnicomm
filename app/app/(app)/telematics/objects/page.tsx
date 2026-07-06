import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { TelematicsTabs } from "../tabs";
import { LinkRowActions } from "./row-actions";

type Row = {
  id: string;
  object_name: string;
  client_name: string;
  server_name: string;
  external_name: string | null;
  external_uuid: string;
  sync_status: "synced" | "pending" | "error" | "pending_delete" | "deleted";
  data_reception_enabled: boolean;
  equipment_id: string | null;
  last_synced_at: string | null;
};

const STATUS_BADGE: Record<Row["sync_status"], string> = {
  synced: "bg-accent-soft text-accent-ink",
  pending: "bg-paper text-ink-dim",
  error: "bg-red-100 text-red-700",
  pending_delete: "bg-amber-100 text-amber-800",
  deleted: "bg-paper text-ink-dim line-through",
};

export default async function TelematicsObjectsPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const canConserve = ["admin", "manager", "head"].includes(user.role);
  const canDelete = ["admin", "head"].includes(user.role);

  const rows = await query<Row>(
    `SELECT l.id, o.name AS object_name, c.name AS client_name, s.name AS server_name,
            l.external_name, l.external_uuid, l.sync_status,
            l.data_reception_enabled, l.equipment_id, l.last_synced_at
     FROM telematics_object_links l
     JOIN monitoring_objects o ON o.id = l.object_id
     JOIN clients c ON c.id = o.client_id
     JOIN telematics_servers s ON s.id = l.server_id
     ORDER BY o.name
     LIMIT 1000`
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold">{d.telematics.title}</h1>
      <TelematicsTabs d={d} active="objects" />

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{d.telematics.crmObject}</th>
              <th className="px-4 py-3 font-medium">{d.telematics.externalName}</th>
              <th className="px-4 py-3 font-medium">{d.telematics.externalUuid}</th>
              <th className="px-4 py-3 font-medium">{d.telematics.syncStatus}</th>
              <th className="px-4 py-3 font-medium">{d.telematics.dataReception}</th>
              <th className="px-4 py-3 font-medium">{d.telematics.lastSyncedAt}</th>
              {canConserve && (
                <th className="px-4 py-3 font-medium">{d.common.actions}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-line last:border-0 transition hover:bg-accent-soft/40"
              >
                <td className="px-4 py-2.5">
                  <div className="font-medium">{r.object_name}</div>
                  <div className="text-[11px] text-ink-dim">
                    {r.client_name} · {r.server_name}
                  </div>
                </td>
                <td className="px-4 py-2.5">{r.external_name ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-ink-dim">
                  {r.external_uuid}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${STATUS_BADGE[r.sync_status]}`}
                  >
                    {r.sync_status}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      r.data_reception_enabled
                        ? "rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink"
                        : "rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800"
                    }
                  >
                    {r.data_reception_enabled ? "вкл" : d.telematics.conserve.toLowerCase()}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[13px] text-ink-dim">
                  {r.last_synced_at
                    ? new Date(r.last_synced_at).toLocaleString("ru-RU", {
                        timeZone: "Asia/Almaty",
                      })
                    : "—"}
                </td>
                {canConserve && (
                  <td className="px-4 py-2.5">
                    <LinkRowActions
                      id={r.id}
                      syncStatus={r.sync_status}
                      receptionEnabled={r.data_reception_enabled}
                      canDelete={canDelete}
                      labels={{
                        conserve: d.telematics.conserve,
                        resume: d.telematics.resume,
                        markDelete: d.telematics.markDelete,
                        finalDelete: d.telematics.finalDelete,
                      }}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-dim">{rows.length} записей (max 1000)</p>
    </div>
  );
}
