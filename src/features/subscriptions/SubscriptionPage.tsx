/**
 * HOUSE-ZEN — Subscription (PHASE 12): plan, usage vs quotas, change plan.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader, StatCard } from '@/components/layout/shared';
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/lib/auth/context';
import { getDataApi } from '@/lib/api';
import { useState } from 'react';
import type { TenantPlanCode } from '@/types/domain';

const PLANS: TenantPlanCode[] = ['FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];

export default function SubscriptionPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['hz', 'subscription', session?.tenant?.id ?? 'none'],
    queryFn: () => getDataApi().getSubscription(),
    enabled: Boolean(session?.tenant),
  });

  const changePlan = useMutation({
    mutationFn: async (code: TenantPlanCode) => {
      await getDataApi().changePlan(code);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['hz', 'subscription'] }),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('subscription.title')} />
        <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
      </div>
    );
  }

  const usageKeys = Object.keys(data.usage);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('subscription.title')}
        actions={
          <Badge className="text-sm">{t(`plan.${data.planCode}`)}</Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {usageKeys.map((k) => {
          const used = data.usage[k] ?? 0;
          const limit = data.limits[k] ?? 0;
          const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
          return (
            <StatCard
              key={k}
              label={t(`subscription.${k}`)}
              value={`${used} / ${limit}`}
              tone={pct >= 90 ? 'warning' : 'default'}
              hint={`${pct}%`}
            />
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('subscription.upgrade')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <UiSelect value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-56"><SelectValue placeholder={t('plan.' + data.planCode)} /></SelectTrigger>
            <SelectContent>
              {PLANS.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(`plan.${p}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </UiSelect>
          <Button
            disabled={!selected || selected === data.planCode}
            onClick={() => void changePlan.mutateAsync(selected as TenantPlanCode)}
          >
            {t('subscription.upgrade')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

