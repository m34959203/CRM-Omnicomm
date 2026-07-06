import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { SwRegister } from "./sw-register";
import { BottomNav } from "./bottom-nav";

/**
 * PWA «Рабочее место техника» (этап 4) — отдельный «полевой» лэйаут:
 * тёмный графит без офисного сайдбара, крупные тач-таргеты, нижняя навигация.
 * Доступ: любой залогиненный (офис проверяет глазами техника), без сессии → /login.
 */

export const metadata: Metadata = {
  title: "CRM Omnicomm — Техник",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Техник" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#191b20",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default async function MobileLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSession();
  if (!user) redirect("/login?next=/m");
  const d = t(user.locale);
  const m = d.mobile;

  return (
    <div className="flex min-h-dvh w-full flex-col bg-chrome text-chrome-text selection:bg-accent selection:text-white">
      <SwRegister />
      {/* верхняя планка */}
      <header className="sticky top-0 z-30 border-b border-chrome-line bg-chrome/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-13 max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-accent" aria-hidden />
            <span className="font-mono text-[11px] tracking-[0.25em] text-chrome-dim">
              OMNICOMM · {m.brand}
            </span>
          </div>
          <span className="max-w-[45%] truncate text-xs text-chrome-dim">{user.fullName}</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-24 pt-4">{children}</main>

      <BottomNav
        labels={{
          home: m.navHome,
          orders: m.navOrders,
          stock: m.navStock,
          payroll: m.navPayroll,
        }}
      />
    </div>
  );
}
