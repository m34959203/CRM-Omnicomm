import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { mOrderBadge } from "../badges";
import { fmtTime } from "../fmt";

/** Расписание работ исполнителя: мои наряды на 7 дней вперёд, сгруппированные по дням. */

type Row = {
  id: string;
  number: string;
  status: string;
  address: string | null;
  scheduled_start: string | null;
  client_name: string | null;
  object_name: string | null;
  day: string; // YYYY-MM-DD Almaty
};

export default async function MobileSchedulePage() {
  const user = await getSession();
  if (!user) redirect("/login?next=/m");
  const d = t(user.locale);
  const m = d.mobile;

  const rows = await query<Row>(
    `SELECT w.id, w.number, w.status, w.address, w.scheduled_start,
            c.name AS client_name, o.name AS object_name,
            to_char((w.scheduled_start AT TIME ZONE 'Asia/Almaty')::date, 'YYYY-MM-DD') AS day
     FROM work_orders w
     JOIN work_order_performers p ON p.work_order_id = w.id AND p.user_id = $1::uuid
     LEFT JOIN clients c ON c.id = w.client_id
     LEFT JOIN monitoring_objects o ON o.id = w.object_id
     WHERE w.status NOT IN ('done','cancelled')
       AND (w.scheduled_start AT TIME ZONE 'Asia/Almaty')::date
           BETWEEN (now() AT TIME ZONE 'Asia/Almaty')::date
               AND (now() AT TIME ZONE 'Asia/Almaty')::date + 6
     ORDER BY w.scheduled_start`,
    [user.userId]
  );

  // 7 дней вперёд от «сегодня» Алматы
  const now = new Date();
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(now.getTime() + i * 86400000);
    days.push(
      dt.toLocaleDateString("sv-SE", { timeZone: "Asia/Almaty" }) // YYYY-MM-DD
    );
  }
  const locale = user.locale === "kk" ? "kk-KZ" : "ru-RU";

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">{m.schedule}</h1>
      <div className="mt-4 space-y-5">
        {days.map((day, i) => {
          const list = rows.filter((r) => r.day === day);
          const label = new Date(`${day}T12:00:00`).toLocaleDateString(locale, {
            weekday: "short",
            day: "numeric",
            month: "short",
          });
          return (
            <section key={day}>
              <div className="flex items-center gap-3">
                <span
                  className={`font-mono text-[11px] uppercase tracking-[0.2em] ${
                    i === 0 ? "text-accent" : "text-chrome-dim"
                  }`}
                >
                  {label}
                </span>
                <span className="h-px flex-1 bg-chrome-line" aria-hidden />
              </div>
              {list.length === 0 ? (
                <p className="mt-1.5 px-1 text-xs text-chrome-dim/60">—</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {list.map((r) => (
                    <Link
                      key={r.id}
                      href={`/m/orders/${r.id}`}
                      className="flex items-center gap-3 rounded-xl border border-chrome-line bg-chrome-raised px-3.5 py-3 transition active:scale-[0.98]"
                    >
                      <span className="font-mono text-sm font-semibold text-accent">
                        {r.scheduled_start ? fmtTime(r.scheduled_start) : "—"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-white">
                          <span className="font-mono">{r.number}</span>
                          {r.client_name ? ` · ${r.client_name}` : ""}
                        </span>
                        <span className="block truncate text-xs text-chrome-dim">
                          {r.object_name ?? ""}
                          {r.address ? ` · ${r.address}` : ""}
                        </span>
                      </span>
                      {mOrderBadge(r.status, d.service)}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
