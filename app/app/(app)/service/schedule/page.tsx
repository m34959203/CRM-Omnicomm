import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { ServiceTabs } from "../tabs";
import { ScheduleBoard } from "./schedule-client";

/** Понедельник недели, содержащей дату date (строки YYYY-MM-DD, календарь Asia/Almaty). */
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // 0 = понедельник
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const s = d.service;
  const sp = await searchParams;

  const todayAlmaty = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(
    new Date()
  );
  const week = /^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? sp.week! : todayAlmaty;
  const monday = mondayOf(week);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const weekEnd = days[6];

  const [techs, assigned, unassigned] = await Promise.all([
    query<{ id: string; full_name: string }>(
      `SELECT u.id, u.full_name FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.is_active AND r.code = 'installer' ORDER BY u.full_name`
    ),
    query<{
      id: string; number: string; status: string; client_name: string | null;
      object_name: string | null; user_id: string; start_day: string | null; end_day: string | null;
    }>(
      `SELECT w.id, w.number, w.status, c.name AS client_name, o.name AS object_name,
              p.user_id,
              to_char(w.scheduled_start AT TIME ZONE 'Asia/Almaty', 'YYYY-MM-DD') AS start_day,
              to_char(COALESCE(w.scheduled_end, w.scheduled_start) AT TIME ZONE 'Asia/Almaty', 'YYYY-MM-DD') AS end_day
       FROM work_orders w
       JOIN work_order_performers p ON p.work_order_id = w.id
       LEFT JOIN clients c ON c.id = w.client_id
       LEFT JOIN monitoring_objects o ON o.id = w.object_id
       WHERE w.status NOT IN ('cancelled')
         AND w.scheduled_start IS NOT NULL
         AND to_char(w.scheduled_start AT TIME ZONE 'Asia/Almaty', 'YYYY-MM-DD') <= $2
         AND to_char(COALESCE(w.scheduled_end, w.scheduled_start) AT TIME ZONE 'Asia/Almaty', 'YYYY-MM-DD') >= $1`,
      [monday, weekEnd]
    ),
    query<{ id: string; number: string; status: string; client_name: string | null; object_name: string | null }>(
      `SELECT w.id, w.number, w.status, c.name AS client_name, o.name AS object_name
       FROM work_orders w
       LEFT JOIN clients c ON c.id = w.client_id
       LEFT JOIN monitoring_objects o ON o.id = w.object_id
       WHERE w.status = 'planned'
         AND NOT EXISTS (SELECT 1 FROM work_order_performers p WHERE p.work_order_id = w.id)
       ORDER BY w.created_at DESC
       LIMIT 100`
    ),
  ]);

  const canEdit = ["admin", "manager", "support", "head"].includes(user.role);

  return (
    <div>
      <h1 className="text-2xl font-semibold">{s.scheduleTitle}</h1>
      <ServiceTabs d={d} active="schedule" />
      <ScheduleBoard
        monday={monday}
        days={days}
        today={todayAlmaty}
        techs={techs}
        assigned={assigned}
        unassigned={unassigned}
        canEdit={canEdit}
        locale={user.locale}
        s={s}
      />
    </div>
  );
}
