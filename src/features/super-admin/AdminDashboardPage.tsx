/**
 * HOUSE-ZEN — Super Admin dashboard (migration 059): platform KPIs over
 * tenants AND users, plan distribution, feature flags, latest activity.
 * Read-only — mutations live in the dedicated management pages.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ShieldCheck, TrendingUp, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch-ui';
import { PageHeader, StatCard, StatusBadge } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi, isDemoMode } from '@/lib/api';
import { formatMoney } from '@/lib/utils/money-dates';
import type { AdminStats, AdminTenantOverview, AdminUser } from '@/lib/api/types';
import type { TenantPlanCode } from '@/types/domain';

const PLAN_CODES: TenantPlanCode[] = ['FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];

export default function AdminDashboardPage() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => getDataApi().adminStats(),
  });
  const { data: tenants } = useQuery({
    queryKey: ['admin', 'tenants-overview'],
    queryFn: () => getDataApi().adminTenantsOverview(),
  });
  const { data: users } = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => getDataApi().adminListUsers(),
  });
  const { data: flags } = useQuery({
    queryKey: ['admin', 'flags'],
    queryFn: () => getDataApi().adminListFeatureFlags(),
  });

  const toggleFlag = useMutation({
    mutationFn: (id: string) => getDataApi().adminToggleFeatureFlag(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin'] }),
  });

  const s = stats as AdminStats | undefined;
  const latestTenants = (tenants as AdminTenantOverview[] | undefined)?.slice(-5).reverse() ?? [];
  const latestUsers = (users as AdminUser[] | undefined)?.slice(0, 5) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('admin.title')}
        description={`${t('admin.subtitle')} · ${isDemoMode() ? t('common.demoTitle') : 'PROD'}`}
        actions={<ShieldCheck size={20} className="text-primary" />}
      />

      {s ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={t('admin.kpi.tenants')}
            value={String(s.tenantCount)}
            hint={`${s.activeTenants} ${t('admin.kpi.active')} · ${s.suspendedTenants} ${t('admin.kpi.suspended')}`}
            icon={<Building2 size={16} />}
          />
          <StatCard
            label={t('admin.kpi.users')}
            value={String(s.userCount)}
            hint={`${t('admin.kpi.newUsers30')} : ${s.newUsers30d}`}
            icon={<Users size={16} />}
          />
          <StatCard
            label="MRR"
            value={formatMoney(s.totalRevenueMrr, 'XAF', locale)}
            hint={t('admin.kpi.mrrHint')}
            tone="success"
            icon={<TrendingUp size={16} />}
          />
          <StatCard
            label={t('admin.kpi.superAdmins')}
            value={String(s.superAdminCount)}
            hint={t('admin.kpi.superAdminsHint')}
            icon={<ShieldCheck size={16} />}
          />
        </div>
      ) : null}

      {s ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('admin.kpi.planDistribution')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {PLAN_CODES.map((code) => (
              <div key={code} className="rounded-md border px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t(`plan.${code}`)}
                </p>
                <p className="mt-0.5 text-xl font-semibold">{s.subscriptionCount[code] ?? 0}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('admin.kpi.latestTenants')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('nav.adminPlans')}</TableHead>
                  <TableHead>{t('admin.users')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestTenants.map((tn) => (
                  <TableRow key={tn.id}>
                    <TableCell className="font-medium">{tn.name}</TableCell>
                    <TableCell>{tn.plan ? t(`plan.${tn.plan}`) : '—'}</TableCell>
                    <TableCell>{tn.user_count}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={tn.status}
                        map={{
                          ACTIVE: { label: 'ACTIVE', variant: 'success' },
                          SUSPENDED: { label: 'SUSPENDED', variant: 'warning' },
                          CANCELLED: { label: 'CANCELLED', variant: 'destructive' },
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('admin.kpi.latestUsers')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('common.email')}</TableHead>
                  <TableHead>{t('admin.tenants')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestUsers.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.full_name || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{u.email}</TableCell>
                    <TableCell>
                      {u.memberships.length === 0
                        ? '—'
                        : u.memberships.map((m) => m.tenant_name).join(', ')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('admin.flags')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(flags ?? []).map((f) => (
              <li key={f.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                <span className="font-mono text-sm">{f.key}</span>
                <Switch checked={f.enabled} onCheckedChange={() => toggleFlag.mutate(f.id)} />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
