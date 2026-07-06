import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { TelematicsTabs } from "../tabs";

type Row = {
  id: string;
  created_at: string;
  server_name: string | null;
  operation: string;
  entity_type: string | null;
  status: "ok" | "error";
  error_message: string | null;
  payload: Record<string, unknown> | null;
  duration_ms: number | null;
};

export default async function SyncLogPage({
  searchParams,
}: {
  searchParams: Promise<{ errors?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const { errors } = await searchParams;
  const errorsOnly = errors === "1";

  const rows = await query<Row>(
    `SELECT l.id, l.created_at, s.name AS server_name, l.operation, l.entity_type,
            l.status, l.error_message, l.payload, l.duration_ms
     FROM sync_log l
     LEFT JOIN telematics_servers s ON s.id = l.server_id
     WHERE ($1 = false OR l.status = 'error')
     ORDER BY l.created_at DESC
     LIMIT 300`,
    [errorsOnly]
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{d.telematics.title}</h1>
        <a
          href={`/api/telematics/log/export${errorsOnly ? "?errors=1" : ""}`}
          className="rounded-md border border-line bg-card px-3 py-2 text-sm transition hover:border-accent hover:text-accent-ink"
        >
          {d.common.exportExcel}
        </a>
      </div>
      <TelematicsTabs d={d} active="log" />

      <form className="mt-5">
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="errors"
            value="1"
            defaultChecked={errorsOnly}
            className="h-4 w-4"
          />
          {d.telematics.errorsOnly}
          <button
            type="submit"
            className="rounded border border-line bg-card px-2 py-1 text-xs transition hover:border-accent"
          >
            OK
          </button>
        </label>
      </form>

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">Дата/время</th>
              <th className="px-4 py-3 font-medium">{d.telematics.server}</th>
              <th className="px-4 py-3 font-medium">{d.telematics.operation}</th>
              <th className="px-4 py-3 font-medium">{d.telematics.status}</th>
              <th className="px-4 py-3 font-medium">{d.telematics.errorMessage} / payload</th>
              <th className="px-4 py-3 font-medium">мс</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 text-[13px]">
                  {new Date(r.created_at).toLocaleString("ru-RU", {
                    timeZone: "Asia/Almaty",
                  })}
                </td>
                <td className="px-4 py-2.5">{r.server_name ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{r.operation}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      r.status === "ok"
                        ? "rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-medium text-accent-ink"
                        : "rounded bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700"
                    }
                  >
                    {r.status}
                  </span>
                </td>
                <td className="max-w-xl px-4 py-2.5 text-[12px]">
                  {r.status === "error" ? (
                    <span className="text-red-700">{r.error_message}</span>
                  ) : (
                    <span className="font-mono text-ink-dim">
                      {r.payload ? JSON.stringify(r.payload) : "—"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[13px] text-ink-dim">
                  {r.duration_ms ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-dim">{rows.length} записей (max 300)</p>
    </div>
  );
}
