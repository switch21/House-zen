/**
 * HOUSE-ZEN — Expenses + categories (tabs) & suppliers reference.
 */

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/misc';
import { PageHeader } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EntityCrudPage, type EntityCrudConfig } from '@/features/crud/EntityCrudPage';
import { useEntityList, useEntityMutations } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { formatMoney, formatDate, todayISO } from '@/lib/utils/money-dates';

const expenseConfig: EntityCrudConfig = {
  entity: 'expenses',
  titleKey: 'expenses.title',
  createKey: 'expenses.create',
  readPermission: 'expenses.read',
  writePermission: 'expenses.write',
  defaultSort: { spent_at: 'desc' },
  columns: [
    { name: 'label', labelKey: 'common.name', kind: 'text' },
    { name: 'category_id', labelKey: 'expenses.category', kind: 'text', ref: { entity: 'expense_categories', labelColumn: 'name' } },
    { name: 'supplier_id', labelKey: 'nav.suppliers', kind: 'text', ref: { entity: 'suppliers', labelColumn: 'name' } },
    { name: 'amount', labelKey: 'payments.amount', kind: 'money' },
    { name: 'spent_at', labelKey: 'expenses.spentAt', kind: 'date' },
  ],
  formFields: [
    { name: 'label', labelKey: 'common.name', kind: 'text' },
    { name: 'category_id', labelKey: 'expenses.category', kind: 'text', ref: { entity: 'expense_categories', labelColumn: 'name' } },
    { name: 'supplier_id', labelKey: 'nav.suppliers', kind: 'text', ref: { entity: 'suppliers', labelColumn: 'name' } },
    { name: 'amount', labelKey: 'payments.amount', kind: 'money', min: 0 },
    { name: 'spent_at', labelKey: 'expenses.spentAt', kind: 'date', defaultValue: todayISO() },
  ],
};

function CategoriesTab() {
  const { t, locale } = useTranslation();
  const [name, setName] = useState('');
  const { data } = useEntityList<Record<string, unknown>>('expense_categories', { pageSize: 100 });
  const { create } = useEntityMutations('expense_categories');

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex gap-2">
          <Input placeholder={t('common.name')} value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          <Button
            onClick={async () => {
              if (!name.trim()) return;
              await create.mutateAsync({ name: name.trim() });
              setName('');
            }}
          >
            <Plus size={15} /> {t('expenses.createCategory')}
          </Button>
        </div>
        {!data || data.items.length === 0 ? (
          <EmptyState title={t('common.empty')} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.items.map((c) => (
                <TableRow key={String(c.id)}>
                  <TableCell>{String(c.name)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="text-xs text-muted-foreground">
          {t('expenses.category')} — {locale}
        </p>
      </CardContent>
    </Card>
  );
}

export default function ExpensesPage() {
  const { t, locale } = useTranslation();
  const [createOpen] = useState(false);
  const [draft] = useState({ category: '' });
  const [dialog, setDialog] = useState(false);
  const { data: categories } = useEntityList<Record<string, unknown>>('expense_categories', { pageSize: 100 });
  const { data: expenses } = useEntityList<Record<string, unknown>>('expenses', { pageSize: 500 });
  const total = (expenses?.items ?? []).reduce((acc, e) => acc + Number(e.amount ?? 0), 0);

  void createOpen;
  void draft;

  return (
    <Tabs defaultValue="list" className="space-y-4">
      <PageHeader title={t('expenses.title')} />
      <TabsList>
        <TabsTrigger value="list">{t('expenses.title')}</TabsTrigger>
        <TabsTrigger value="categories">{t('expenses.category')}</TabsTrigger>
      </TabsList>
      <TabsContent value="list" className="space-y-4">
        <div className="text-sm text-muted-foreground">
          {t('common.total')} : <span className="font-semibold text-foreground">{formatMoney(total, 'XAF', locale)}</span>
        </div>
        <EntityCrudPage config={expenseConfig} />
      </TabsContent>
      <TabsContent value="categories">
        <CategoriesTab />
      </TabsContent>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('expenses.create')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{t('expenses.category')}</Label>
            <UiSelect>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(categories?.items ?? []).map((c) => (
                  <SelectItem key={String(c.id)} value={String(c.id)}>
                    {String(c.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </UiSelect>
          </div>
          <DialogFooter>
            <Button onClick={() => setDialog(false)}>{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {formatDate(todayISO(), locale) ? null : null}
    </Tabs>
  );
}
