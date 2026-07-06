import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { LogoutButton } from "./logout-button";
import { LocaleSwitcher } from "./locale-switcher";
import { REPORT_READ_ROLES } from "@/lib/reports/common";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);

  const nav: [string, string][] = [
    ["/dashboard", d.nav.dashboard],
    ["/clients", d.nav.clients],
    ["/objects", d.nav.objects],
    ["/equipment", d.nav.equipment],
    ["/sim", d.nav.sim],
    ["/warehouses", d.nav.warehouses],
    ["/telematics", d.nav.telematics],
    ["/service/requests", d.nav.service],
    ["/billing", d.nav.billing],
  ];
  if (["admin", "manager", "support", "head", "boss"].includes(user.role)) {
    nav.push(["/support/tickets", d.nav.support]);
  }
  if (["admin", "accounting", "head", "boss"].includes(user.role)) {
    nav.push(["/payroll/sheets", d.nav.payroll]);
  }
  if (REPORT_READ_ROLES.includes(user.role)) {
    nav.push(["/reports/equipment", d.nav.reports]);
  }

  return (
    <div className="flex flex-1 min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col bg-chrome text-chrome-text">
        <div className="px-5 py-5 border-b border-chrome-line">
          <div className="font-mono text-[11px] tracking-[0.25em] text-chrome-dim">
            OMNICOMM
          </div>
          <div className="mt-0.5 font-semibold text-white">CRM</div>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-0.5">
          {nav.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="block rounded px-3 py-2 text-sm transition hover:bg-chrome-raised hover:text-white"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-chrome-line px-5 py-4">
          <div className="text-sm text-white truncate">{user.fullName}</div>
          <div className="mt-0.5 font-mono text-[11px] text-chrome-dim">
            {user.role}
          </div>
          <LocaleSwitcher locale={user.locale} />
          <LogoutButton label={d.nav.logout} />
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-8">{children}</main>
    </div>
  );
}
