// Omnicomm — конфигурация разделов системы (раздел 5 ТЗ).
import {
  LayoutDashboard, ClipboardList, Users, MapPin, HardHat, CalendarDays,
  Wallet, FileText, BarChart3, Phone, MessageSquare, Settings,
} from 'lucide-react';

export type NavItem = { href: string; label: string; icon: typeof Users; roles?: string[] };

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Рабочий стол', icon: LayoutDashboard },
  { href: '/requests', label: 'Заявки', icon: ClipboardList },
  { href: '/clients', label: 'Клиенты', icon: Users },
  { href: '/objects', label: 'Объекты', icon: MapPin },
  { href: '/installers', label: 'Монтажники', icon: HardHat },
  { href: '/calendar', label: 'Календарь выездов', icon: CalendarDays },
  { href: '/calls', label: 'Звонки', icon: Phone },
  { href: '/messages', label: 'Сообщения', icon: MessageSquare },
  { href: '/subscriptions', label: 'Счета и абонплата', icon: Wallet, roles: ['admin', 'accounting', 'manager'] },
  { href: '/documents', label: 'Документы', icon: FileText },
  { href: '/analytics', label: 'Отчёты и аналитика', icon: BarChart3 },
  { href: '/settings', label: 'Настройки', icon: Settings, roles: ['admin'] },
];
