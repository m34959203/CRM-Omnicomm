import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { TelematicsTabs } from "./tabs";
import { ServerRowActions } from "./server-row-actions";

type Row = {
  id: string;
  name: string;
  server_type: string;
  base_url: string;
  auth_login: string | null;
  is_active: boolean;
  health_status: "ok" | "degraded" | "down" | "unknown";
  health_checked_at: string | null;
};

const HEALTH_BADGE: Record<Row["health_status"], string> = {
  ok: "bg-accent-soft text-accent-ink",
  degraded: "bg-amber-100 text-amber-800",
  down: "bg-red-100 text-red-700",
  unknown: "bg-paper text-ink-dim",
};

export default async function TelematicsServersPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const canManage = user.role === "admin" || user.role === "head";

  const rows = await query<Row>(
    `SELECT id, name, server_type, base_url, auth_login, is_active,
            health_status, health_checked_at
     FROM telematics_servers ORDER BY name`
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{d.telematics.title}</h1>
        {canManage && (
          <Link
            href="/telematics/new"
            className="rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent-ink"
          >
            {d.telematics.addServer}
          </Link>
        )}
      </div>
      <TelematicsTabs d={d} active="servers" />

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{d.telematics.serverName}</th>
              <th className="px-4 py-3 font-medium">{d.telematics.serverType}</th>
              <th className="px-4 py-3 font-medium">{d.telematics.baseUrl}</th>
              <th className="px-4 py-3 font-medium">{d.telematics.authLogin}</th>
              <th className="px-4 py-3 font-medium">{d.telematics.health}</th>
              {canManage && (
                <th className="px-4 py-3 font-medium">{d.common.actions}</th>
              )}
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
              <tr
                key={r.id}
                className="border-b border-line last:border-0 transition hover:bg-accent-soft/40"
              >
                <td className="px-4 py-2.5 font-medium">
                  {r.name}
                  {!r.is_active && (
                    <span className="ml-2 rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-dim">
                      архив
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">{r.server_type}</td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{r.base_url}</td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{r.auth_login ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${HEALTH_BADGE[r.health_status]}`}
                  >
                    {r.health_status}
                  </span>
                  {r.health_checked_at && (
                    <span className="ml-2 text-[11px] text-ink-dim">
                      {d.telematics.healthCheckedAt}:{" "}
                      {new Date(r.health_checked_at).toLocaleString("ru-RU", {
                        timeZone: "Asia/Almaty",
                      })}
                    </span>
                  )}
                </td>
                {canManage && (
                  <td className="px-4 py-2.5">
                    <ServerRowActions
                      id={r.id}
                      checkLabel={d.telematics.checkHealth}
                      importLabel={d.telematics.importAction}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
