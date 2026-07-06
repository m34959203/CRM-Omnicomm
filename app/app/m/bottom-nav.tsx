"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: React.ReactNode };

const ic = {
  home: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1v-9z" strokeLinejoin="round" />
    </svg>
  ),
  orders: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2.5M15 4V2.5M8.5 9.5h7M8.5 13h7M8.5 16.5h4.5" strokeLinecap="round" />
    </svg>
  ),
  stock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" strokeLinejoin="round" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" strokeLinejoin="round" />
    </svg>
  ),
  payroll: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 8.5h7M8.5 11.5h7M12 8.5V17" strokeLinecap="round" />
    </svg>
  ),
};

/** Нижняя навигация PWA: 4 крупных тач-таргета (≥56px). */
export function BottomNav({
  labels,
}: {
  labels: { home: string; orders: string; stock: string; payroll: string };
}) {
  const pathname = usePathname();
  const items: Item[] = [
    { href: "/m", label: labels.home, icon: ic.home },
    { href: "/m/orders", label: labels.orders, icon: ic.orders },
    { href: "/m/stock", label: labels.stock, icon: ic.stock },
    { href: "/m/payroll", label: labels.payroll, icon: ic.payroll },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-chrome-line bg-chrome/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-lg grid-cols-4">
        {items.map((it) => {
          const active =
            it.href === "/m" ? pathname === "/m" : pathname.startsWith(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 py-1.5 transition active:scale-95 ${
                active ? "text-accent" : "text-chrome-dim"
              }`}
            >
              {it.icon}
              <span className="text-[10px] font-medium tracking-wide">{it.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
