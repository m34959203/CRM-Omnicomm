import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { PushSettings } from "./push-settings";
import { LogoutLink } from "./logout-link";

/** АРМ-лаунчер техника (референс: Аскан, скрин ascan_T0): Документы + Отчёты. */

const card =
  "flex min-h-16 items-center gap-3.5 rounded-xl border border-chrome-line bg-chrome-raised px-4 py-3.5 transition active:scale-[0.98]";
const cardIcon = "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-chrome text-accent";
const sectionLabel = "font-mono text-[11px] uppercase tracking-[0.25em] text-accent";

export default async function MobileHome() {
  const user = await getSession();
  if (!user) redirect("/login?next=/m");
  const d = t(user.locale);
  const m = d.mobile;

  const [counts] = await query<{ today: string; week: string }>(
    `SELECT
       count(*) FILTER (
         WHERE (w.scheduled_start AT TIME ZONE 'Asia/Almaty')::date
             = (now() AT TIME ZONE 'Asia/Almaty')::date
       ) AS today,
       count(*) FILTER (
         WHERE (w.scheduled_start AT TIME ZONE 'Asia/Almaty')::date
           BETWEEN (now() AT TIME ZONE 'Asia/Almaty')::date
               AND (now() AT TIME ZONE 'Asia/Almaty')::date + 6
       ) AS week
     FROM work_orders w
     JOIN work_order_performers p ON p.work_order_id = w.id AND p.user_id = $1::uuid
     WHERE w.status NOT IN ('done','cancelled')`,
    [user.userId]
  );

  const today = new Date().toLocaleDateString(user.locale === "kk" ? "kk-KZ" : "ru-RU", {
    timeZone: "Asia/Almaty",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div>
      <h1 className="text-xl font-semibold text-white">{m.title}</h1>
      <p className="mt-0.5 text-sm text-chrome-dim first-letter:uppercase">{today}</p>

      {/* Документы */}
      <div className="mt-6 flex items-center gap-3">
        <span className={sectionLabel}>{m.documents}</span>
        <span className="h-px flex-1 bg-chrome-line" aria-hidden />
      </div>
      <Link href="/m/orders" className={`${card} mt-3`}>
        <span className={cardIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5.5 w-5.5">
            <rect x="5" y="4" width="14" height="17" rx="2" />
            <path d="M9 4V2.5M15 4V2.5M8.5 9.5h7M8.5 13h7M8.5 16.5h4.5" strokeLinecap="round" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-white">{m.myOrders}</span>
          <span className="block text-xs text-chrome-dim">
            {m.todayShort}{" "}
            <b className="font-mono text-sm font-semibold text-accent">{counts?.today ?? 0}</b>
            {" · "}
            {m.weekShort}{" "}
            <b className="font-mono text-sm font-semibold text-accent">{counts?.week ?? 0}</b>
          </span>
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 text-chrome-dim">
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </Link>

      {/* Отчёты */}
      <div className="mt-7 flex items-center gap-3">
        <span className={sectionLabel}>{m.reports}</span>
        <span className="h-px flex-1 bg-chrome-line" aria-hidden />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Link href="/m/schedule" className={`${card} flex-col items-start gap-2`}>
          <span className={cardIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5.5 w-5.5">
              <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
              <path d="M3.5 9.5h17M8 5V3M16 5V3M7.5 13.5h3M13.5 13.5h3M7.5 17h3" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-sm font-medium leading-tight text-white">{m.schedule}</span>
        </Link>
        <Link href="/m/stock" className={`${card} flex-col items-start gap-2`}>
          <span className={cardIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5.5 w-5.5">
              <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" strokeLinejoin="round" />
              <path d="M4 7.5l8 4.5 8-4.5M12 12v9" strokeLinejoin="round" />
            </svg>
          </span>
          <span className="text-sm font-medium leading-tight text-white">{m.myStock}</span>
        </Link>
        <Link href="/m/stock?tab=sim" className={`${card} flex-col items-start gap-2`}>
          <span className={cardIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5.5 w-5.5">
              <path d="M6 4a2 2 0 0 1 2-2h6l4 4v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4z" strokeLinejoin="round" />
              <rect x="9" y="11" width="6" height="6" rx="1" />
            </svg>
          </span>
          <span className="text-sm font-medium leading-tight text-white">{m.simCards}</span>
        </Link>
        <Link href="/m/payroll" className={`${card} flex-col items-start gap-2`}>
          <span className={cardIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5.5 w-5.5">
              <circle cx="12" cy="12" r="8.5" />
              <path d="M8.5 8.5h7M8.5 11.5h7M12 8.5V17" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-sm font-medium leading-tight text-white">{m.myEarnings}</span>
        </Link>
      </div>

      {/* настройки */}
      <div className="mt-8 space-y-3">
        <PushSettings labels={m.push} />
        <div className="flex items-center justify-between text-xs text-chrome-dim">
          <Link href="/dashboard" className="underline-offset-2 hover:text-chrome-text hover:underline">
            {m.officeVersion}
          </Link>
          <LogoutLink label={m.logout} />
        </div>
      </div>
    </div>
  );
}
