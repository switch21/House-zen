/**
 * HOUSE-ZEN — Super Admin · Plan management (migration 059).
 * Full CRUD on the SaaS billing plans (prices, quotas, features).
 * Deletion is blocked while an active subscription references the plan
 * (plans FK is ON DELETE RESTRICT — the SQL layer stays the authority).
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Trash2 } from 'lucide-react';
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
import { PageHeader } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi } from '@/lib/api';
import { formatMoney } from '@/lib/utils/money-dates';
import type { Plan } from '@/types/domain';

interface PlanForm {
  code: string;
  name: string;
  monthly_price: string;
  currency: string;
  max_properties: string;
  max_rooms: string;
  max_users: string;
  features: string;
}

const emptyForm = (): PlanForm => ({
  code: '',
  name: '',
  monthly_price: '0',
  currency: 'XAF',
  max_properties: '1',
  max_rooms: '5',
  max_users: '2',
  features: '',
});

const toForm = (p: Plan): PlanForm => ({
  code: p.code,
  name: p.name,
  monthly_price: String(p.monthly_price),
  currency: p.currency,
  max_properties: String(p.max_properties),
  max_rooms: String(p.max_rooms),
  max_users: String(p.max_users),
  features: p.features.join(', '),
});

export default function AdminPlansPage() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<'create' | 'edit' | null>(null);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  const { data: plans } = useQuery({
    queryKey: ['admin', 'plans'],
    queryFn: () => getDataApi().adminListPlans(),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['admin'] });

  const create = useMutation({
    mutationFn: () =>
      getDataApi().adminCreatePlan({
        code: form.code.toUpperCase().trim(),
        name: form.name.trim(),
        monthly_price: Number(form.monthly_price) || 0,
        currency: form.currency.toUpperCase() || 'XAF',
        max_properties: Number(form.max_properties) || 0,
        max_rooms: Number(form.max_rooms) || 0,
        max_users: Number(form.max_users) || 0,
        features: form.features
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
    onError: (e) => setError(String(e).replace(/^Error:\s*/, '')),
  });
  const update = useMutation({
    mutationFn: () =>
      getDataApi().adminUpdatePlan(editing!.id, {
        name: form.name.trim(),
        monthly_price: Number(form.monthly_price) || 0,
        currency: form.currency.toUpperCase() || 'XAF',
        max_properties: Number(form.max_properties) || 0,
        max_rooms: Number(form.max_rooms) || 0,
        max_users: Number(form.max_users) || 0,
        features: form.features
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    onSuccess: () => {
      invalidate();
      setDialog(null);
    },
    onError: (e) => setError(String(e).replace(/^Error:\s*/, '')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => getDataApi().adminDeletePlan(id),
    onSuccess: invalidate,
    onError: (e) => setError(String(e).replace(/^Error:\s*/, '')),
  });

  const openCreate = () => {
    setForm(emptyForm());
    setError(null);
    setDialog('create');
  };
  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm(toForm(p));
    setError(null);
    setDialog('edit');
  };
  const onDelete = (p: Plan) => {
    if (!window.confirm(t('common.confirmDelete'))) return;
    remove.mutate(p.id);
  };

  const setField = (patch: Partial<PlanForm>) => setForm((f) => ({ ...f, ...patch }));
  const busy = create.isPending || update.isPending;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('nav.adminPlans')}
        description={t('admin.plansHint')}
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus size={15} /> {t('admin.newPlan')}
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
          <CardTitle className="text-sm">{t('admin.plansHint')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('admin.price')}</TableHead>
                <TableHead>{t('admin.limits')}</TableHead>
                <TableHead>{t('admin.features')}</TableHead>
                <TableHead className="text-end">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(plans ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs font-semibold">{p.code}</TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{formatMoney(p.monthly_price, p.currency, locale)}</TableCell>
                  <TableCell className="text-xs">
                    {p.max_properties} / {p.max_rooms} / {p.max_users}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">
                    {p.features.join(', ') || '—'}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                        <Pencil size={13} /> {t('common.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => onDelete(p)}
                      >
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialog === 'create' || dialog === 'edit'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === 'create' ? t('admin.newPlan') : t('admin.editPlan')}</DialogTitle>
            <DialogDescription>{t('admin.plansHint')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-sm">
                Code
                <Input
                  value={form.code}
                  onChange={(e) => setField({ code: e.target.value.toUpperCase() })}
                  placeholder="PRO"
                  disabled={dialog === 'edit'}
                  maxLength={20}
                  className="font-mono"
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                {t('common.name')}
                <Input value={form.name} onChange={(e) => setField({ name: e.target.value })} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5 text-sm">
                {t('admin.price')}
                <Input
                  type="number"
                  min={0}
                  value={form.monthly_price}
                  onChange={(e) => setField({ monthly_price: e.target.value })}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                {t('admin.currency')}
                <Input
                  value={form.currency}
                  onChange={(e) => setField({ currency: e.target.value.toUpperCase() })}
                  maxLength={3}
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <label className="grid gap-1.5 text-sm">
                {t('admin.maxProperties')}
                <Input
                  type="number"
                  min={0}
                  value={form.max_properties}
                  onChange={(e) => setField({ max_properties: e.target.value })}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                {t('admin.maxRooms')}
                <Input
                  type="number"
                  min={0}
                  value={form.max_rooms}
                  onChange={(e) => setField({ max_rooms: e.target.value })}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                {t('admin.maxUsers')}
                <Input
                  type="number"
                  min={0}
                  value={form.max_users}
                  onChange={(e) => setField({ max_users: e.target.value })}
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm">
              {t('admin.features')}
              <Input
                value={form.features}
                onChange={(e) => setField({ features: e.target.value })}
                placeholder="basic_pms, public_widget, reports"
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={busy || !form.code.trim() || !form.name.trim()}
              onClick={() => (dialog === 'create' ? create.mutate() : update.mutate())}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
