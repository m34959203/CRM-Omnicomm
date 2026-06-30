'use client';
// Omnicomm — боковая навигация в фирменной стилистике (разделы 5, 21 ТЗ):
// тёмно-синяя панель, голубой акцент активного пункта.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV } from '@/lib/nav';

export default function Sidebar({ role = 'admin' }: { role?: string }) {
  const pathname = usePathname();
  const items = NAV.filter((i) => !i.roles || i.roles.includes(role));

  return (
    <aside className="flex w-60 shrink-0 flex-col bg-[#1f3864] text-[#cbd6e8]">
      <div className="border-b border-white/10 px-6 py-5 text-xl font-bold tracking-wide text-white">
        OMNI<span className="text-[#5b9bd5]">COMM</span>
      </div>
      <nav className="flex-1 py-3">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 border-l-[3px] px-6 py-2.5 text-sm transition-colors ${
                active
                  ? 'border-[#5b9bd5] bg-[#16294a] text-white'
                  : 'border-transparent hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 px-6 py-3 text-xs text-[#8aa0c4]">
        Omnicomm CRM · на базе LiftPlatform
      </div>
    </aside>
  );
}
