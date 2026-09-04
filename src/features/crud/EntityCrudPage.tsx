/**
 * HOUSE-ZEN — Generic CRUD page factory.
 * Drives list + create/edit dialog + delete for standard tenant entities.
 * Specialized modules (reservations, housekeeping, invoices…) build their own pages.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/misc';
import { PageHeader } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEntityList, useEntityMutations } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/lib/auth/context';
import { can, type Permission } from '@/lib/permissions/rbac';
import { getDataApi, type EntityName } from '@/lib/api';
import { formatMoney, formatDate } from '@/lib/utils/money-dates';
import type { UUID } from '@/types/domain';

export type FieldKind = 'text' | 'textarea' | 'number' | 'money' | 'select' | 'date' | 'checkbox' | 'email';

export interface FieldConfig {
  name: string;
  labelKey: string;
  kind: FieldKind;
  options?: { value: string; labelKey?: string; label?: string }[];
  /** Foreign entity for select options: [entity, labelColumn]. */
  ref?: { entity: EntityName; labelColumn: string };
  min?: number;
  step?: number;
  defaultValue?: string | number | boolean;
  hideInTable?: boolean;
  render?: (row: Record<string, unknown>) => ReactNode;
}

export interface EntityCrudConfig {
  entity: EntityName;
  titleKey: string;
  createKey: string;
  readPermission: Permission;
  writePermission: Permission;
  columns: FieldConfig[];
  formFields: FieldConfig[];
  defaultSort?: Record<string, 'asc' | 'desc'>;
  extraRowActions?: (row: Record<string, unknown>) => ReactNode;
  headerExtra?: ReactNode;
  /** Called before create — return data to merge (e.g. tenant-computed fields). */
  beforeCreate?: (draft: Record<string, unknown>) => Promise<Record<string, unknown>> | Record<string, unknown>;
}

function FieldInput({
  field,
  value,
  onChange,
  label,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (v: unknown) => void;
  label: string;
}) {
  const { t } = useTranslation();
  if (field.kind === 'textarea') {
    return <Textarea value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
  }
  if (field.kind === 'checkbox') {
    return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" aria-label={label} />;
  }
  if (field.kind === 'select' && field.options) {
    return (
      <UiSelect value={String(value ?? '')} onValueChange={(v) => onChange(v)}>
        <SelectTrigger>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.labelKey ? t(o.labelKey) : o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </UiSelect>
    );
  }
  if (field.kind === 'number' || field.kind === 'money') {
    return (
      <Input
        type="number"
        min={field.min}
        step={field.step ?? (field.kind === 'money' ? 0.01 : 1)}
        value={value === null || value === undefined ? '' : String(value)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    );
  }
  if (field.kind === 'date') {
    return <Input type="date" value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <Input
      type={field.kind === 'email' ? 'email' : 'text'}
      value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function EntityCrudPage({ config }: { config: EntityCrudConfig }) {
  const { t, locale } = useTranslation();
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [refOptions, setRefOptions] = useState<Record<string, Record<string, unknown>[]>>({});
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading } = useEntityList<Record<string, unknown>>(config.entity, {
    search: search || undefined,
    sort: config.defaultSort,
  });
  const { create, update, remove } = useEntityMutations(config.entity);

  const writeAllowed = session ? can(session.role, config.writePermission) : false;
  const currency = session?.tenant?.currency ?? 'XAF';

  const loadRefs = useCallback(async () => {
    const refFields = config.formFields.filter((f) => f.ref);
    const next: Record<string, Record<string, unknown>[]> = {};
    for (const f of refFields) {
      const res = await getDataApi().list<Record<string, unknown>>(f.ref!.entity, { pageSize: 500 });
      next[f.name] = res.items;
    }
    setRefOptions(next);
    return next;
  }, [config.formFields]);

  useEffect(() => {
    void loadRefs();
  }, [loadRefs]);

  async function openCreate() {
    const initial: Record<string, unknown> = {};
    for (const f of config.formFields) {
      initial[f.name] = f.defaultValue ?? (f.kind === 'checkbox' ? false : f.kind === 'number' || f.kind === 'money' ? null : '');
    }
    const refs = await loadRefs();
    for (const f of config.formFields.filter((x) => x.ref)) {
      const first = refs[f.name]?.[0];
      if (first) initial[f.name] = first.id;
    }
    setEditing(null);
    setDraft(initial);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(row: Record<string, unknown>) {
    setEditing(row);
    setDraft({ ...row });
    setError(null);
    setDialogOpen(true);
  }

  async function submit() {
    setError(null);
    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id as UUID, data: draft });
      } else {
        const payload = config.beforeCreate ? await config.beforeCreate(draft) : draft;
        await create.mutateAsync(payload);
      }
      setDialogOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function removeRow(row: Record<string, unknown>) {
    if (!window.confirm(t('common.confirmDelete'))) return;
    try {
      await remove.mutateAsync(row.id as UUID);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  function cellValue(row: Record<string, unknown>, field: FieldConfig): ReactNode {
    if (field.render) return field.render(row);
    const raw = row[field.name];
    if (field.kind === 'money') return formatMoney(Number(raw ?? 0), currency, locale);
    if (field.kind === 'date') return raw ? formatDate(String(raw), locale) : '—';
    if (field.kind === 'checkbox') return raw ? t('common.yes') : t('common.no');
    if (field.kind === 'select' && field.options) {
      const opt = field.options.find((o) => o.value === raw);
      return opt ? (opt.labelKey ? t(opt.labelKey) : opt.label) : String(raw ?? '—');
    }
    if (field.ref) {
      const match = (refOptions[field.name] ?? []).find((x) => x.id === raw);
      return (match?.[field.ref.labelColumn] as string) ?? '—';
    }
    return raw === null || raw === undefined || raw === '' ? '—' : String(raw);
  }

  const visibleColumns = config.columns.filter((c) => !c.hideInTable);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t(config.titleKey)}
        actions={
          <>
            <Input
              placeholder={t('common.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-40 sm:w-56"
              aria-label={t('common.search')}
            />
            {writeAllowed ? (
              <Button onClick={openCreate}>
                <Plus size={16} /> {t(config.createKey)}
              </Button>
            ) : null}
          </>
        }
      />

      {config.headerExtra}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : !data || data.items.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('common.empty')} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {visibleColumns.map((c) => (
                    <TableHead key={c.name}>{t(c.labelKey)}</TableHead>
                  ))}
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={String(row.id)}>
                    {visibleColumns.map((c) => (
                      <TableCell key={c.name} className="max-w-64 truncate">
                        {cellValue(row, c)}
                      </TableCell>
                    ))}
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        {config.extraRowActions?.(row)}
                        {writeAllowed ? (
                          <>
                            <Button variant="ghost" size="icon" aria-label="edit" onClick={() => openEdit(row)}>
                              <Pencil size={14} />
                            </Button>
                            <Button variant="ghost" size="icon" aria-label="delete" onClick={() => removeRow(row)}>
                              <Trash2 size={14} className="text-destructive" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t('common.edit') : t(config.createKey)}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            {config.formFields.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label htmlFor={`f-${f.name}`}>{t(f.labelKey)}</Label>
                {f.ref ? (
                  <UiSelect
                    value={String(draft[f.name] ?? '')}
                    onValueChange={(v) => setDraft((d) => ({ ...d, [f.name]: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t(f.labelKey)} />
                    </SelectTrigger>
                    <SelectContent>
                      {(refOptions[f.name] ?? []).map((item) => (
                        <SelectItem key={String(item.id)} value={String(item.id)}>
                          {String(item[f.ref!.labelColumn])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </UiSelect>
                ) : (
                  <FieldInput
                    field={f}
                    value={draft[f.name]}
                    onChange={(v) => setDraft((d) => ({ ...d, [f.name]: v }))}
                    label={t(f.labelKey)}
                  />
                )}
              </div>
            ))}
            {error ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={create.isPending || update.isPending}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
