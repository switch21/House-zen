/**
 * HOUSE-ZEN — Super Admin back-office shell (spec §31, migration 059).
 * Secondary navigation inside the authenticated app shell:
 * Dashboard (KPI) · Tenants · Users · Plans. Full CRUD lives in each page;
 * the SQL layer re-checks profiles.is_super_admin on every mutation.
 */

import { NavLink, Outlet } from 'react-router-dom';
import { Building2, LayoutDashboard, ShieldCheck, Users, Wallet } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { cn } from '@/lib/utils';

const LINKS = [
  { to: '/admin/dashboard', labelKey: 'admin.dashboard', icon: LayoutDashboard },
  { to: '/admin/tenants', labelKey: 'nav.adminTenants', icon: Building2 },
  { to: '/admin/users', labelKey: 'admin.users', icon: Users },
  { to: '/admin/plans', labelKey: 'nav.adminPlans', icon: Wallet },
] as const;

export default function AdminLayout() {
  const { t } = useI18n();
  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <nav aria-label={t('nav.admin')} className="lg:sticky lg:top-20 lg:self-start">
        <div className="mb-2 flex items-center gap-2 px-2.5">
          <ShieldCheck size={15} className="text-primary" />
          <p className="text-[10px] font-semibold uppercase tracking-wider opacity-50">
            {t('nav.admin')}
          </p>
        </div>
        <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {LINKS.map(({ to, labelKey, icon: Icon }) => (
            <li key={to} className="shrink-0">
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <Icon size={15} />
                {t(labelKey)}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <Outlet />
      </div>
    </div>
  );
}
