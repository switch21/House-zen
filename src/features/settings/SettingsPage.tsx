/**
 * HOUSE-ZEN — Settings: tenant general config + branding + taxes +
 * cancellation policies + security (MFA).
 *
 * General tab (migration 057): establishment identity (address, contacts,
 * tax ids), logo (bucket `branding` — rendered on printable documents) and
 * the operational defaults (currency / timezone / locale / check-in times).
 * Every write is surfaced: success badge AND explicit error line — the
 * previous silent-failure save made the currency look "impossible to set".
 */

import { useEffect, useRef, useState } from 'react';
import { Building2, ImageIcon, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/shared';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MfaSettings } from './MfaSettings';
import { TaxesTab } from './TaxesTab';
import { PoliciesTab } from './PoliciesTab';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/lib/auth/context';
import { useEntityList, useEntityMutations } from '@/hooks/useEntity';
import { getDataApi, isDemoMode } from '@/lib/api';
import type { UUID } from '@/types/domain';

export const CURRENCIES = [
  'XAF', 'XOF', 'EUR', 'USD', 'GBP', 'CHF', 'CAD', 'NGN',
  'GHS', 'MAD', 'TND', 'DZD', 'CDF', 'RWF', 'KES', 'ZAR', 'AED', 'CNY',
];

const TIMEZONES = [
  'Africa/Douala', 'Africa/Lagos', 'Africa/Abidjan', 'Africa/Algiers', 'Africa/Cairo',
  'Africa/Nairobi', 'Africa/Johannesburg', 'Africa/Casablanca', 'Africa/Tunis',
  'Europe/Paris', 'Europe/London', 'Europe/Brussels', 'Europe/Zurich', 'Europe/Madrid',
  'America/New_York', 'America/Toronto', 'Asia/Dubai', 'Asia/Shanghai', 'UTC',
];

const LOCALES = ['fr', 'en', 'es', 'de', 'ar', 'it', 'sw'];

type TenantRow = Record<string, unknown> & { id: string };

export default function SettingsPage() {
  const { t } = useTranslation();
  const { session } = useAuth();

  const { data: tenants } = useEntityList<TenantRow>('tenants', { pageSize: 1 });
  const { update } = useEntityMutations('tenants');

  const tenant = tenants?.items[0];

  const [form, setForm] = useState({
    name: '', currency: 'XAF', timezone: 'Africa/Douala', locale: 'fr',
    address_line: '', city: '', country: '', phone: '', contact_email: '',
    website: '', tax_id: '', registration_no: '',
    default_check_in_time: '14:00', default_check_out_time: '12:00',
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tenant) return;
    setForm({
      name: String(tenant.name ?? ''),
      currency: String(tenant.currency ?? 'XAF'),
      timezone: String(tenant.timezone ?? 'Africa/Douala'),
      locale: String(tenant.locale ?? 'fr'),
      address_line: String(tenant.address_line ?? ''),
      city: String(tenant.city ?? ''),
      country: String(tenant.country ?? ''),
      phone: String(tenant.phone ?? ''),
      contact_email: String(tenant.contact_email ?? ''),
      website: String(tenant.website ?? ''),
      tax_id: String(tenant.tax_id ?? ''),
      registration_no: String(tenant.registration_no ?? ''),
      default_check_in_time: String(tenant.default_check_in_time ?? '14:00').slice(0, 5),
      default_check_out_time: String(tenant.default_check_out_time ?? '12:00').slice(0, 5),
    });
  }, [tenant]);

  const writeAllowed = session?.role === 'owner' || session?.role === 'manager';

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function saveGeneral() {
    if (!tenant) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: String(tenant.id),
        data: {
          name: form.name.trim(),
          currency: form.currency,
          timezone: form.timezone,
          locale: form.locale,
          address_line: form.address_line.trim() || null,
          city: form.city.trim() || null,
          country: form.country.trim() || null,
          phone: form.phone.trim() || null,
          contact_email: form.contact_email.trim() || null,
          website: form.website.trim() || null,
          tax_id: form.tax_id.trim() || null,
          registration_no: form.registration_no.trim() || null,
          default_check_in_time: form.default_check_in_time,
          default_check_out_time: form.default_check_out_time,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function onLogoPicked(file: File | undefined) {
    if (!file || !tenant) return;
    setError(null);
    setUploading(true);
    try {
      const url = await getDataApi().uploadLogo(file);
      await update.mutateAsync({ id: String(tenant.id), data: { logo_url: url } });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeLogo() {
    if (!tenant) return;
    setError(null);
    try {
      await update.mutateAsync({ id: String(tenant.id), data: { logo_url: null } });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, opts?: { type?: string; placeholder?: string }) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={opts?.type ?? 'text'}
        placeholder={opts?.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!writeAllowed}
      />
    </div>
  );

  const select = (label: string, value: string, items: string[], onChange: (v: string) => void, render?: (v: string) => string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <UiSelect value={value} onValueChange={onChange} disabled={!writeAllowed}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {items.map((it) => (
            <SelectItem key={it} value={it}>{render ? render(it) : it}</SelectItem>
          ))}
        </SelectContent>
      </UiSelect>
    </div>
  );

  const logoUrl = typeof tenant?.logo_url === 'string' ? tenant.logo_url : null;

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

        {/* ============================== GENERAL ============================== */}
        <TabsContent value="general">
          <div className="grid gap-4 lg:grid-cols-3">
            {/* Identity */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Building2 size={15} /> {t('settings.establishment')}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  {field('tname', t('settings.tenantName'), form.name, set('name'))}
                  {field('tphone', t('settings.phone'), form.phone, set('phone'), { placeholder: '+237 6XX XX XX XX' })}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {field('taddr', t('settings.address'), form.address_line, set('address_line'))}
                  {field('tcity', t('settings.city'), form.city, set('city'))}
                  {field('tcountry', t('settings.country'), form.country, set('country'))}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {field('temail', t('settings.contactEmail'), form.contact_email, set('contact_email'), { type: 'email' })}
                  {field('tweb', t('settings.website'), form.website, set('website'), { placeholder: 'https://…' })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {field('ttaxid', t('settings.taxId'), form.tax_id, set('tax_id'), { placeholder: 'NIU / N° TVA' })}
                  {field('trccm', t('settings.registrationNo'), form.registration_no, set('registration_no'), { placeholder: 'RCCM' })}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {field('tcheckin', t('settings.defaultCheckin'), form.default_check_in_time, set('default_check_in_time'), { type: 'time' })}
                  {field('tcheckout', t('settings.defaultCheckout'), form.default_check_out_time, set('default_check_out_time'), { type: 'time' })}
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {select(t('settings.currency'), form.currency, CURRENCIES, set('currency'))}
                  {select(t('settings.timezone'), form.timezone, TIMEZONES, set('timezone'))}
                  {select(t('settings.locale'), form.locale, LOCALES, set('locale'), (v) => v.toUpperCase())}
                </div>

                {writeAllowed ? (
                  <div className="flex items-center gap-3 pt-1">
                    <Button onClick={() => void saveGeneral()} disabled={update.isPending}>
                      {t('common.save')}
                    </Button>
                    {saved ? <span className="text-xs font-medium text-success">✓ {t('common.saved')}</span> : null}
                    {error ? (
                      <span role="alert" className="rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                        {error}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">{t('settings.readOnlyRole')}</p>
                )}
              </CardContent>
            </Card>

            {/* Logo */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ImageIcon size={15} /> {t('settings.logo')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">{t('settings.logoHint')}</p>
                <div className="flex h-36 items-center justify-center rounded-md border border-dashed bg-muted/30 p-3">
                  {logoUrl ? (
                    <img src={logoUrl} alt="logo" className="max-h-28 max-w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">{t('settings.logoEmpty')}</span>
                  )}
                </div>
                {writeAllowed ? (
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={(e) => void onLogoPicked(e.target.files?.[0])}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      onClick={() => fileRef.current?.click()}
                    >
                      {uploading ? t('common.loading') : logoUrl ? t('settings.logoReplace') : t('settings.logoUpload')}
                    </Button>
                    {logoUrl ? (
                      <Button variant="ghost" size="sm" onClick={() => void removeLogo()}>
                        <Trash2 size={13} /> {t('common.delete')}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  {isDemoMode() ? t('settings.logoDemoHint') : 'PNG / JPEG / WebP / SVG · ≤ 2 Mo'}
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="security">
          <MfaSettings />
        </TabsContent>

        <TabsContent value="taxes">
          <TaxesTab writeAllowed={writeAllowed} />
        </TabsContent>

        <TabsContent value="policies">
          <PoliciesTab writeAllowed={writeAllowed} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Shared tiny helper for the two CRUD tabs — resolves the tenant row id. */
export function useTenantId(): UUID | null {
  const { data: tenants } = useEntityList<TenantRow>('tenants', { pageSize: 1 });
  const tenant = tenants?.items[0];
  return tenant ? String(tenant.id) : null;
}
