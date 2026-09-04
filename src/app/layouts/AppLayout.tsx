import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BedDouble, Building2, CalendarDays, ClipboardList, CreditCard, DoorOpen, DoorClosed,
  Gauge, Globe, Home, Hotel, LayoutDashboard, ListTree, LogOut, Menu,
  Moon, Receipt, Settings, ShieldCheck, Sparkles, Sun, Tags, TrendingDown, TrendingUp,
  Users, Wrench, X, Bell, FileText, Landmark, Package, Wallet, ScrollText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth/context';
import { useI18n, LOCALES, LOCALE_LABELS, type Locale } from '@/lib/i18n/provider';
import { can, type Permission } from '@/lib/permissions/rbac';
import { getDataApi, isDemoMode } from '@/lib/api';
import { useRealtimeSync } from '@/lib/realtime';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface NavItem {
  to: string;
  labelKey: string;
  icon: ReactNode;
  permission?: Permission;
}

interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

function buildNav(): NavGroup[] {
  return [
    {
      labelKey: 'nav.dashboard',
      items: [
        { to: '/app/dashboard', labelKey: 'nav.dashboard', icon: <LayoutDashboard size={16} /> },
        { to: '/app/calendar', labelKey: 'nav.calendar', icon: <CalendarDays size={16} />, permission: 'reservations.read' },
        { to: '/app/reports', labelKey: 'nav.reports', icon: <Gauge size={16} />, permission: 'reports.read' },
        { to: '/app/audit', labelKey: 'nav.audit', icon: <ScrollText size={16} />, permission: 'audit.read' },
      ],
    },
    {
      labelKey: 'nav.reservations',
      items: [
        { to: '/app/reservations', labelKey: 'nav.reservations', icon: <BedDouble size={16} />, permission: 'reservations.read' },
        { to: '/app/checkins', labelKey: 'nav.checkins', icon: <DoorOpen size={16} />, permission: 'reservations.checkin' },
        { to: '/app/checkouts', labelKey: 'nav.checkouts', icon: <DoorClosed size={16} />, permission: 'reservations.checkout' },
        { to: '/app/customers', labelKey: 'nav.customers', icon: <Users size={16} />, permission: 'customers.read' },
      ],
    },
    {
      labelKey: 'nav.operations',
      items: [
        { to: '/app/housekeeping', labelKey: 'nav.housekeeping', icon: <Sparkles size={16} />, permission: 'housekeeping.read' },
        { to: '/app/maintenance', labelKey: 'nav.maintenance', icon: <Wrench size={16} />, permission: 'maintenance.read' },
        { to: '/app/services', labelKey: 'nav.services', icon: <ClipboardList size={16} />, permission: 'services.read' },
        { to: '/app/rooms', labelKey: 'nav.rooms', icon: <Hotel size={16} />, permission: 'rooms.read' },
      ],
    },
    {
      labelKey: 'nav.structure',
      items: [
        { to: '/app/properties', labelKey: 'nav.properties', icon: <Building2 size={16} />, permission: 'properties.read' },
        { to: '/app/buildings', labelKey: 'nav.buildings', icon: <Home size={16} />, permission: 'buildings.read' },
        { to: '/app/room-types', labelKey: 'nav.roomTypes', icon: <ListTree size={16} />, permission: 'room_types.read' },
        { to: '/app/amenities', labelKey: 'nav.amenities', icon: <Tags size={16} />, permission: 'amenities.read' },
        { to: '/app/rates', labelKey: 'nav.rates', icon: <TrendingUp size={16} />, permission: 'rates.read' },
      ],
    },
    {
      labelKey: 'nav.finance',
      items: [
        { to: '/app/invoices', labelKey: 'nav.invoices', icon: <Receipt size={16} />, permission: 'invoices.read' },
        { to: '/app/payments', labelKey: 'nav.payments', icon: <Wallet size={16} />, permission: 'payments.read' },
        { to: '/app/expenses', labelKey: 'nav.expenses', icon: <TrendingDown size={16} />, permission: 'expenses.read' },
        { to: '/app/suppliers', labelKey: 'nav.suppliers', icon: <Package size={16} />, permission: 'suppliers.read' },
      ],
    },
    {
      labelKey: 'nav.settings',
      items: [
        { to: '/app/team', labelKey: 'nav.team', icon: <Users size={16} />, permission: 'team.read' },
        { to: '/app/settings', labelKey: 'nav.settings', icon: <Settings size={16} />, permission: 'settings.read' },
        { to: '/app/subscription', labelKey: 'nav.subscription', icon: <CreditCard size={16} />, permission: 'subscription.read' },
      ],
    },
  ];
}

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="theme"
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle('dark', next);
      }}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  );
}

function LanguagePicker() {
  const { locale, setLocale } = useI18n();
  return (
    <select
      aria-label="language"
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_LABELS[l]}
        </option>
      ))}
    </select>
  );
}

function DemoBanner() {
  const { t } = useI18n();
  if (!isDemoMode()) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-xs font-medium text-warning-foreground">
      <Globe size={14} />
      {t('common.demoBanner')}
    </div>
  );
}

/**
 * Notification bell with live unread count. The cache is invalidated by the
 * realtime bus (useRealtimeSync below), so the badge updates without refresh
 * when a notification row lands for this tenant.
 */
function NotificationBell({ label }: { label: string }) {
  const { data } = useQuery({
    queryKey: ['hz', 'notifications'],
    queryFn: () => getDataApi().listMyNotifications(),
    staleTime: 10_000,
  });
  const unread = (data ?? []).filter((n) => n.read_at === null).length;
  return (
    <NavLink
      to="/app/notifications"
      className="relative rounded-md p-2 hover:bg-accent"
      aria-label={label}
    >
      <Bell size={16} />
      {unread > 0 ? (
        <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-white">
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </NavLink>
  );
}

export function AppLayout({ children }: { children?: ReactNode }) {
  const { session, signOut } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const tenantId = session?.tenant?.id ?? null;
  // One tenant-scoped channel per tab: server changes invalidate query caches live.
  useRealtimeSync(tenantId);
  const nav = buildNav();

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Hotel size={16} />
        </div>
        <div>
          <p className="text-sm font-bold tracking-wide">{t('app.name')}</p>
          <p className="text-[10px] opacity-70">{t('app.tagline')}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4 scrollbar-thin" aria-label="main">
        {nav.map((group) => {
          const items = group.items.filter((i) => !i.permission || (session && can(session.role, i.permission)));
          if (items.length === 0) return null;
          return (
            <div key={group.labelKey}>
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider opacity-50">
                {group.labelKey === group.items[0]?.labelKey ? t(group.labelKey) : t(group.labelKey)}
              </p>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                          isActive ? 'bg-primary/20 text-white' : 'opacity-75 hover:bg-white/5 hover:opacity-100',
                        )
                      }
                    >
                      {item.icon}
                      {t(item.labelKey)}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {session?.isSuperAdmin ? (
          <div>
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider opacity-50">
              {t('nav.admin')}
            </p>
            <NavLink
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium',
                  isActive ? 'bg-primary/20 text-white' : 'opacity-75 hover:bg-white/5',
                )
              }
            >
              <ShieldCheck size={16} />
              {t('nav.admin')}
            </NavLink>
          </div>
        ) : null}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2 px-2 pb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/25 text-xs font-bold">
            {session?.fullName?.slice(0, 2).toUpperCase() ?? '?'}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">{session?.fullName}</p>
            <p className="truncate text-[10px] opacity-70">{session?.tenant?.name ?? '—'}</p>
          </div>
        </div>
        <div className="flex items-center justify-between px-1">
          <Badge variant="secondary" className="bg-white/10 text-white">
            {session?.role}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            aria-label="logout"
            className="text-white/80 hover:text-white"
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
          >
            <LogOut size={15} />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <DemoBanner />
      <div className="flex flex-1">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="fixed inset-y-0 w-60">{sidebar}</div>
        </aside>
        {mobileOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <div className="absolute inset-y-0 start-0 w-64">{sidebar}</div>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 items-center justify-between gap-2 border-b bg-background/95 px-4 backdrop-blur">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="menu">
                {mobileOpen ? <X size={18} /> : <Menu size={18} />}
              </Button>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {session?.tenant?.name} · {session?.tenant?.currency} · {session?.tenant?.timezone}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell label={t('notifications.title')} />
              <LanguagePicker />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 p-4 md:p-6">{children}</main>
          <footer className="border-t px-6 py-3 text-center text-xs text-muted-foreground">
            {t('app.name')} — {new Date().getFullYear()}
          </footer>
        </div>
      </div>
    </div>
  );
}

export { FileText, Landmark };
