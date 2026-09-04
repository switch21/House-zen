/**
 * HOUSE-ZEN — Super Admin (spec §31): separate authorization space, audited actions,
 * read-only by default, impersonation explicitly flagged (not silently granted).
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, PlayCircle, ShieldCheck, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch-ui';
import { PageHeader, StatCard, StatusBadge } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi, isDemoMode } from '@/lib/api';
import { formatMoney } from '@/lib/utils/money-dates';
import type { AdminStats } from '@/lib/api/types';
import type { Tenant } from '@/types/domain';

export default function SuperAdminPage() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();
  const [tab, setTab] = useState('tenants');

  const { data: stats } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: () => getDataApi().adminStats(),
  });
  const { data: tenants } = useQuery({
    queryKey: ['admin', 'tenants'],
    queryFn: () => getDataApi().adminListTenants(),
  });
  const { data: flags } = useQuery({
    queryKey: ['admin', 'flags'],
    queryFn: () => getDataApi().adminListFeatureFlags(),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'SUSPENDED' }) =>
      getDataApi().adminSetTenantStatus(id, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
    },
  });

  const toggleFlag = useMutation({
    mutationFn: (id: string) => getDataApi().adminToggleFeatureFlag(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin'] }),
  });

  const s = stats as AdminStats | undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('admin.title')}
        description={`${t('admin.subtitle')} · ${isDemoMode() ? t('common.demoTitle') : 'PROD'}`}
        actions={<ShieldCheck size={20} className="text-primary" />}
      />

      {s ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label={t('nav.adminTenants')} value={String(s.tenantCount)} hint={`${s.activeTenants} actifs`} />
          <StatCard label="MRR" value={formatMoney(s.totalRevenueMrr, 'XAF', locale)} tone="success" />
          <StatCard label={t('plan.PRO')} value={String(s.subscriptionCount.PRO)} />
          <StatCard label={t('plan.ENTERPRISE')} value={String(s.subscriptionCount.ENTERPRISE)} />
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="tenants">{t('nav.adminTenants')}</TabsTrigger>
          <TabsTrigger value="flags">{t('nav.adminFeatureFlags')}</TabsTrigger>
          <TabsTrigger value="audit">{t('nav.adminAudit')}</TabsTrigger>
        </TabsList>

        <TabsContent value="tenants">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('nav.adminTenants')}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.name')}</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="text-end">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(tenants ?? []).map((tn: Tenant) => (
                    <TableRow key={tn.id}>
                      <TableCell className="font-medium">{tn.name}</TableCell>
                      <TableCell className="font-mono text-xs">{tn.slug}</TableCell>
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
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          {tn.status === 'ACTIVE' ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setStatus.mutate({ id: tn.id, status: 'SUSPENDED' })}
                            >
                              <Ban size={13} /> {t('admin.suspend')}
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setStatus.mutate({ id: tn.id, status: 'ACTIVE' })}
                            >
                              <PlayCircle size={13} /> {t('admin.reactivate')}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled
                            title={t('admin.impersonateHint')}
                            onClick={() => {
                              /* Impersonation is audited & gated server-side; not enabled in demo. */
                            }}
                          >
                            <UserCheck size={13} /> {t('admin.impersonate')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="flags">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('admin.flags')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {(flags ?? []).map((f) => (
                  <li key={f.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="font-mono text-sm">{f.key}</span>
                    <Switch checked={f.enabled} onCheckedChange={() => toggleFlag.mutate(f.id)} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('audit.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t('admin.impersonateHint')}</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
