/**
 * HOUSE-ZEN — Settings: tenant general config + taxes + cancellation policies.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { MfaSettings } from './MfaSettings';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/lib/auth/context';
import { useEntityList, useEntityMutations } from '@/hooks/useEntity';
import { getDataApi } from '@/lib/api';
import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('');
  const [timezone, setTimezone] = useState('');
  const [saved, setSaved] = useState(false);

  const { data: tenants } = useEntityList<Record<string, unknown>>('tenants', { pageSize: 1 });
  const { update } = useEntityMutations('tenants');
  const { data: taxRates } = useEntityList<Record<string, unknown>>('tax_rates', { pageSize: 50 });
  const { data: policies } = useEntityList<Record<string, unknown>>('cancellation_policies', { pageSize: 50 });

  useEffect(() => {
    const tenant = tenants?.items[0];
    if (tenant) {
      setName(String(tenant.name));
      setCurrency(String(tenant.currency));
      setTimezone(String(tenant.timezone));
    }
  }, [tenants]);

  const writeAllowed = session?.role === 'owner' || session?.role === 'manager';

  async function saveGeneral() {
    const tenant = tenants?.items[0];
    if (!tenant) return;
    await update.mutateAsync({ id: String(tenant.id), data: { name, currency, timezone } });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('settings.title')} />
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">{t('settings.general')}</TabsTrigger>
          <TabsTrigger value="taxes">{t('settings.taxes')}</TabsTrigger>
          <TabsTrigger value="policies">{t('settings.policies')}</TabsTrigger>
          <TabsTrigger value="security">{t('settings.security')}</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('settings.general')}</CardTitle>
            </CardHeader>
            <CardContent className="grid max-w-lg gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tname">{t('settings.tenantName')}</Label>
                <Input id="tname" value={name} onChange={(e) => setName(e.target.value)} disabled={!writeAllowed} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="tcur">{t('settings.currency')}</Label>
                  <Input id="tcur" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!writeAllowed} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ttz">{t('settings.timezone')}</Label>
                  <Input id="ttz" value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!writeAllowed} />
                </div>
              </div>
              {writeAllowed ? (
                <div className="flex items-center gap-2">
                  <Button onClick={saveGeneral}>{t('common.save')}</Button>
                  {saved ? <span className="text-xs text-success">✓</span> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <MfaSettings />
        </TabsContent>

        <TabsContent value="taxes">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('settings.taxes')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {(taxRates?.items ?? []).map((tx) => (
                  <li key={String(tx.id)} className="flex justify-between rounded-md border px-3 py-2">
                    <span>{String(tx.name)}</span>
                    <span className="font-medium">{String(tx.rate_percent)}%</span>
                  </li>
                ))}
                {(taxRates?.items ?? []).length === 0 ? (
                  <li className="text-sm text-muted-foreground">{t('common.empty')}</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="policies">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t('settings.policies')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {(policies?.items ?? []).map((p) => (
                  <li key={String(p.id)} className="flex justify-between rounded-md border px-3 py-2">
                    <span>{String(p.name)}</span>
                    <span className="text-muted-foreground">
                      {t('settings.freeCancellationHours')} : {String(p.free_cancellation_hours)} ·{' '}
                      {t('settings.penaltyPercent')} : {String(p.penalty_percent)}%
                    </span>
                  </li>
                ))}
                {(policies?.items ?? []).length === 0 ? (
                  <li className="text-sm text-muted-foreground">{t('common.empty')}</li>
                ) : null}
              </ul>
              <p className="mt-3 text-xs text-muted-foreground">
                {getDataApi() ? '' : ''}
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
