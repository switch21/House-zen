/**
 * HOUSE-ZEN — Settings → Taxes (CRUD).
 * Rows live in `tax_rates` (RLS: settings.write — migration 057 fixed the
 * broken permission gate that made this tab read-only for everyone).
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useEntityList, useEntityMutations } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi } from '@/lib/api';
import type { UUID } from '@/types/domain';

interface TaxRow extends Record<string, unknown> {
  id: string;
  name: string;
  rate_percent: number | string;
  is_default: boolean;
}

const EMPTY = { name: '', rate_percent: '', is_default: false };

export function TaxesTab({ writeAllowed }: { writeAllowed: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: taxRates, isLoading } = useEntityList<TaxRow>('tax_rates', { pageSize: 100 });
  const { create, update } = useEntityMutations('tax_rates');

  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<UUID | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  function openCreate() {
    setEditId(null);
    setForm(EMPTY);
    setError(null);
    setOpen(true);
  }

  function openEdit(row: TaxRow) {
    setEditId(row.id);
    setForm({ name: row.name, rate_percent: String(row.rate_percent), is_default: Boolean(row.is_default) });
    setError(null);
    setOpen(true);
  }

  async function submit() {
    setError(null);
    const rate = Number(form.rate_percent.replace(',', '.'));
    if (!form.name.trim() || Number.isNaN(rate) || rate < 0 || rate > 100) {
      setError(t('settings.taxInvalid'));
      return;
    }
    const data = { name: form.name.trim(), rate_percent: rate, is_default: form.is_default };
    try {
      if (editId) await update.mutateAsync({ id: editId, data });
      else await create.mutateAsync(data);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['hz', 'tax_rates'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function removeRow(id: UUID) {
    if (!window.confirm(t('settings.taxDeleteConfirm'))) return;
    setError(null);
    try {
      await getDataApi().remove('tax_rates', id);
      void qc.invalidateQueries({ queryKey: ['hz', 'tax_rates'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{t('settings.taxesHint')}</p>
          {writeAllowed ? (
            <Button size="sm" onClick={openCreate}>
              <Plus size={14} /> {t('settings.taxAdd')}
            </Button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        ) : null}
        {isLoading ? (
          <div className="py-6 text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : !taxRates || taxRates.items.length === 0 ? (
          <div className="py-4">
            <EmptyState title={t('common.empty')} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('settings.taxRate')}</TableHead>
                <TableHead>{t('settings.taxDefault')}</TableHead>
                {writeAllowed ? <TableHead className="text-end">{t('common.actions')}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {taxRates.items.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="font-medium">{tx.name}</TableCell>
                  <TableCell>{Number(tx.rate_percent)}%</TableCell>
                  <TableCell>{tx.is_default ? <Badge variant="secondary">{t('common.yes')}</Badge> : '—'}</TableCell>
                  {writeAllowed ? (
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(tx)} title={t('common.edit')}>
                          <Pencil size={13} />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => void removeRow(tx.id)} title={t('common.delete')}>
                          <Trash2 size={13} className="text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? t('settings.taxEdit') : t('settings.taxAdd')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tax-name">{t('common.name')}</Label>
              <Input
                id="tax-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="TVA 19,25 %"
              />
            </div>
            <div className="grid grid-cols-2 items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tax-rate">{t('settings.taxRate')}</Label>
                <Input
                  id="tax-rate"
                  type="number" min={0} max={100} step="0.01"
                  value={form.rate_percent}
                  onChange={(e) => setForm((f) => ({ ...f, rate_percent: e.target.value }))}
                />
              </div>
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
                />
                {t('settings.taxDefault')}
              </label>
            </div>
            {error ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={() => void submit()} disabled={create.isPending || update.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
