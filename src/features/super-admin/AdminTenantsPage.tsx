/**
 * HOUSE-ZEN — Super Admin · Tenant management (migration 059).
 * Full CRUD: create (starts on FREE plan), edit, change plan, suspend /
 * reactivate, delete (cascades all tenant data — SQL enforced, audited).
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Building2, Pencil, PlayCircle, Plus, Trash2, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, StatusBadge } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi } from '@/lib/api';
import { formatMoney } from '@/lib/utils/money-dates';
import type { AdminTenantOverview } from '@/lib/api/types';
import type { TenantPlanCode, TenantStatus } from '@/types/domain';

const STATUSES: TenantStatus[] = ['ACTIVE', 'SUSPENDED', 'CANCELLED'];
const LOCALES = ['fr', 'en', 'es', 'de', 'it', 'sw', 'ar'] as const;

/** Known plan codes get their translated label; custom codes show raw. */
const KNOWN_PLANS: TenantPlanCode[] = ['FREE', 'STARTER', 'PRO', 'BUSINESS', 'ENTERPRISE'];

interface FormState {
  name: string;
  slug: string;
  status: TenantStatus;
  currency: string;
  timezone: string;
  locale: string;
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

const emptyForm = (): FormState => ({
  name: '',
  slug: '',
  status: 'ACTIVE',
  currency: 'XAF',
  timezone: 'Africa/Douala',
  locale: 'fr',
});

export default function AdminTenantsPage() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'create' | 'edit' | 'plan' | null>(null);
  const [editing, setEditing] = useState<AdminTenantOverview | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [planCode, setPlanCode] = useState<string>('FREE');
  const [error, setError] = useState<string | null>(null);

  const { data: tenants } = useQuery({
    queryKey: ['admin', 'tenants-overview'],
    queryFn: () => getDataApi().adminTenantsOverview(),
  });
  const { data: plans } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => getDataApi().adminListPlans(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin'] });

  const create = useMutation({
    mutationFn: () => getDataApi().adminCreateTenant(form),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
    onError: (e) => setError(String(e).replace(/^Error:\s*/, '')),
  });
  const update = useMutation({
    mutationFn: () =>
      getDataApi().adminUpdateTenant(editing!.id, {
        name: form.name,
        slug: form.slug,
        status: form.status,
        currency: form.currency,
        timezone: form.timezone,
        locale: form.locale,
      }),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
    onError: (e) => setError(String(e).replace(/^Error:\s*/, '')),
  });
  const setPlan = useMutation({
    mutationFn: () => getDataApi().adminSetTenantPlan(editing!.id, planCode),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
    onError: (e) => setError(String(e).replace(/^Error:\s*/, '')),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TenantStatus }) =>
      getDataApi().adminUpdateTenant(id, { status }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => getDataApi().adminDeleteTenant(id),
    onSuccess: invalidate,
    onError: (e) => setError(String(e).replace(/^Error:\s*/, '')),
  });

  const openCreate = () => {
    setForm(emptyForm());
    setError(null);
    setDialog('create');
  };
  const openEdit = (tn: AdminTenantOverview) => {
    setEditing(tn);
    setForm({
      name: tn.name,
      slug: tn.slug,
      status: tn.status,
      currency: tn.currency,
      timezone: tn.timezone,
      locale: tn.locale,
    });
    setError(null);
    setDialog('edit');
  };
  const openPlan = (tn: AdminTenantOverview) => {
    setEditing(tn);
    setPlanCode(tn.plan ?? 'FREE');
    setError(null);
    setDialog('plan');
  };
  const onDelete = (tn: AdminTenantOverview) => {
    if (!window.confirm(t('admin.deleteTenantConfirm'))) return;
    remove.mutate(tn.id);
  };

  const setField = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const busy = create.isPending || update.isPending || setPlan.isPending;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('nav.adminTenants')}
        description={t('admin.tenantsHint')}
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus size={15} /> {t('admin.newTenant')}
          </Button>
        }
      />

      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('admin.tenantsHint')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>{t('nav.adminPlans')}</TableHead>
                <TableHead>{t('admin.users')}</TableHead>
                <TableHead>{t('nav.rooms')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="text-end">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(tenants ?? []).map((tn) => (
                <TableRow key={tn.id}>
                  <TableCell className="font-medium">{tn.name}</TableCell>
                  <TableCell className="font-mono text-xs">{tn.slug}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => openPlan(tn)}
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium hover:bg-muted"
                    >
                      <Wallet size={11} />
                      {tn.plan
                        ? KNOWN_PLANS.includes(tn.plan as TenantPlanCode)
                          ? t(`plan.${tn.plan}`)
                          : tn.plan
                        : '—'}
                    </button>
                  </TableCell>
                  <TableCell>
                    {tn.user_count} · {tn.property_count} {t('nav.properties').toLowerCase()}
                  </TableCell>
                  <TableCell>{tn.room_count}</TableCell>
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
                      <Button size="sm" variant="ghost" onClick={() => openEdit(tn)}>
                        <Pencil size={13} /> {t('common.edit')}
                      </Button>
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
                        className="text-destructive hover:text-destructive"
                        onClick={() => onDelete(tn)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(tenants ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    <Building2 size={18} className="mx-auto mb-2 opacity-50" />
                    {t('admin.empty')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create / edit dialog */}
      <Dialog open={dialog === 'create' || dialog === 'edit'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === 'create' ? t('admin.newTenant') : t('admin.editTenant')}</DialogTitle>
            <DialogDescription>{t('admin.tenantsHint')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm">
              {t('common.name')}
              <Input
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setField(dialog === 'create' ? { name, slug: slugify(name) } : { name });
                }}
                placeholder="Zen Hôtels & Résidences"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              Slug
              <Input
                value={form.slug}
                onChange={(e) => setField({ slug: e.target.value })}
                placeholder="zen-hotels"
                className="font-mono"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-sm">
                {t('admin.currency')}
                <Input
                  value={form.currency}
                  onChange={(e) => setField({ currency: e.target.value.toUpperCase() })}
                  maxLength={3}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                {t('admin.locale')}
                <Select value={form.locale} onValueChange={(v) => setField({ locale: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOCALES.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <label className="grid gap-1.5 text-sm">
              {t('admin.timezone')}
              <Input value={form.timezone} onChange={(e) => setField({ timezone: e.target.value })} />
            </label>
            {dialog === 'edit' ? (
              <label className="grid gap-1.5 text-sm">
                {t('common.status')}
                <Select
                  value={form.status}
                  onValueChange={(v) => setField({ status: v as TenantStatus })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy || !form.name.trim() || !form.slug.trim()}
              onClick={() => (dialog === 'create' ? create.mutate() : update.mutate())}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Plan dialog */}
      <Dialog open={dialog === 'plan'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('admin.setPlan')}</DialogTitle>
            <DialogDescription>
              {editing?.name} · {t('nav.adminPlans')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <Select value={planCode} onValueChange={setPlanCode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(plans ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.code}>
                    {p.name} — {formatMoney(p.monthly_price, p.currency, locale)} ·{' '}
                    {t('admin.maxUsers').toLowerCase()} {p.max_users}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button disabled={setPlan.isPending} onClick={() => setPlan.mutate()}>
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
