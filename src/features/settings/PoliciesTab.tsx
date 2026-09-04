/**
 * HOUSE-ZEN — Settings → Cancellation policies (CRUD).
 * Rows live in `cancellation_policies` (RLS: settings.write — migration 057
 * fixed the broken permission gate that made this tab read-only).
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
import { useEntityList, useEntityMutations } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi } from '@/lib/api';
import type { UUID } from '@/types/domain';

interface PolicyRow extends Record<string, unknown> {
  id: string;
  name: string;
  free_cancellation_hours: number | string;
  penalty_percent: number | string;
}

const EMPTY = { name: '', free_cancellation_hours: '24', penalty_percent: '0' };

export function PoliciesTab({ writeAllowed }: { writeAllowed: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: policies, isLoading } = useEntityList<PolicyRow>('cancellation_policies', { pageSize: 100 });
  const { create, update } = useEntityMutations('cancellation_policies');

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

  function openEdit(row: PolicyRow) {
    setEditId(row.id);
    setForm({
      name: row.name,
      free_cancellation_hours: String(row.free_cancellation_hours),
      penalty_percent: String(row.penalty_percent),
    });
    setError(null);
    setOpen(true);
  }

  async function submit() {
    setError(null);
    const hours = Number(form.free_cancellation_hours);
    const penalty = Number(form.penalty_percent.replace(',', '.'));
    if (!form.name.trim() || Number.isNaN(hours) || hours < 0 || hours > 720
      || Number.isNaN(penalty) || penalty < 0 || penalty > 100) {
      setError(t('settings.policyInvalid'));
      return;
    }
    const data = {
      name: form.name.trim(),
      free_cancellation_hours: Math.round(hours),
      penalty_percent: penalty,
    };
    try {
      if (editId) await update.mutateAsync({ id: editId, data });
      else await create.mutateAsync(data);
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ['hz', 'cancellation_policies'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function removeRow(id: UUID) {
    if (!window.confirm(t('settings.policyDeleteConfirm'))) return;
    setError(null);
    try {
      await getDataApi().remove('cancellation_policies', id);
      void qc.invalidateQueries({ queryKey: ['hz', 'cancellation_policies'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{t('settings.policiesHint')}</p>
          {writeAllowed ? (
            <Button size="sm" onClick={openCreate}>
              <Plus size={14} /> {t('settings.policyAdd')}
            </Button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        ) : null}
        {isLoading ? (
          <div className="py-6 text-sm text-muted-foreground">{t('common.loading')}</div>
        ) : !policies || policies.items.length === 0 ? (
          <div className="py-4">
            <EmptyState title={t('common.empty')} />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('settings.freeCancellationHours')}</TableHead>
                <TableHead>{t('settings.penaltyPercent')}</TableHead>
                {writeAllowed ? <TableHead className="text-end">{t('common.actions')}</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {policies.items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.free_cancellation_hours} h</TableCell>
                  <TableCell>{Number(p.penalty_percent)} %</TableCell>
                  {writeAllowed ? (
                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(p)} title={t('common.edit')}>
                          <Pencil size={13} />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => void removeRow(p.id)} title={t('common.delete')}>
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
            <DialogTitle>{editId ? t('settings.policyEdit') : t('settings.policyAdd')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pol-name">{t('common.name')}</Label>
              <Input
                id="pol-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('settings.policyNamePlaceholder')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pol-hours">{t('settings.freeCancellationHours')}</Label>
                <Input
                  id="pol-hours"
                  type="number" min={0} max={720}
                  value={form.free_cancellation_hours}
                  onChange={(e) => setForm((f) => ({ ...f, free_cancellation_hours: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pol-penalty">{t('settings.penaltyPercent')}</Label>
                <Input
                  id="pol-penalty"
                  type="number" min={0} max={100} step="0.01"
                  value={form.penalty_percent}
                  onChange={(e) => setForm((f) => ({ ...f, penalty_percent: e.target.value }))}
                />
              </div>
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
