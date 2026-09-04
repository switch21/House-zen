/**
 * HOUSE-ZEN — Payments (spec §15): idempotency key + allocation to invoices.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/misc';
import { PageHeader, StatusBadge } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEntityList } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/utils/money-dates';
import { uuid } from '@/lib/utils';
import type { PaymentMethod } from '@/types/domain';

const METHOD_MAP: Record<string, string> = {
  CASH: 'paymentMethod.CASH',
  MOBILE_MONEY: 'paymentMethod.MOBILE_MONEY',
  CARD: 'paymentMethod.CARD',
  BANK_TRANSFER: 'paymentMethod.BANK_TRANSFER',
  OTHER: 'paymentMethod.OTHER',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning'> = {
  PENDING: 'warning',
  PROCESSING: 'default',
  SUCCEEDED: 'success',
  FAILED: 'destructive',
  CANCELLED: 'secondary',
  REFUNDED: 'secondary',
  PARTIALLY_REFUNDED: 'secondary',
};

export default function PaymentsPage() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ invoice_id: string; amount: string; method: PaymentMethod }>({
    invoice_id: '',
    amount: '',
    method: 'CASH',
  });

  const { data: payments, isLoading } = useEntityList<Record<string, unknown>>('payments', {
    sort: { created_at: 'desc' },
    pageSize: 200,
  });
  const { data: invoices } = useEntityList<Record<string, unknown>>('invoices', { pageSize: 500 });

  const record = useMutation({
    mutationFn: () =>
      getDataApi().recordPayment({
        invoice_id: form.invoice_id || null,
        reservation_id: null,
        amount: Number(form.amount),
        method: form.method,
        idempotency_key: uuid(),
      }),
    onSuccess: () => {
      setOpen(false);
      setForm({ invoice_id: '', amount: '', method: 'CASH' });
      ['payments', 'invoices', 'payment_allocations', 'notifications', 'audit_logs'].forEach((e) =>
        qc.invalidateQueries({ queryKey: ['hz', e] }),
      );
    },
    onError: (e) => window.alert(e instanceof Error ? e.message : t('common.error')),
  });

  const openInvoices = (invoices?.items ?? []).filter((i) =>
    ['ISSUED', 'PARTIALLY_PAID'].includes(String(i.status)),
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('payments.title')}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Wallet size={16} /> {t('payments.create')}
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : !payments || payments.items.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('common.empty')} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('payments.amount')}</TableHead>
                  <TableHead>{t('payments.method')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>Idempotency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.items.map((p) => (
                  <TableRow key={String(p.id)}>
                    <TableCell>{formatDateTime(String(p.created_at), undefined, locale)}</TableCell>
                    <TableCell className="font-semibold">
                      {formatMoney(Number(p.amount), String(p.currency), locale)}
                    </TableCell>
                    <TableCell>{t(METHOD_MAP[String(p.method)] ?? 'paymentMethod.OTHER')}</TableCell>
                    <TableCell>
                      <StatusBadge
                        status={String(p.status)}
                        map={Object.fromEntries(
                          Object.keys(STATUS_VARIANT).map((k) => [k, { label: t(`paymentStatus.${k}`), variant: STATUS_VARIANT[k] ?? 'secondary' }]),
                        )}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-[10px] text-muted-foreground">
                      {String(p.idempotency_key ?? '—').slice(0, 8)}…
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('payments.create')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>{t('payments.allocate')}</Label>
              <UiSelect value={form.invoice_id} onValueChange={(v) => setForm((f) => ({ ...f, invoice_id: v }))}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">—</SelectItem>
                  {openInvoices.map((i) => (
                    <SelectItem key={String(i.id)} value={String(i.id)}>
                      {String(i.number)} — {formatMoney(Number(i.total) - Number(i.amount_paid), String(i.currency), locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </UiSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="amount">{t('payments.amount')}</Label>
              <Input
                id="amount"
                type="number"
                min={0}
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('payments.method')}</Label>
              <UiSelect value={form.method} onValueChange={(v) => setForm((f) => ({ ...f, method: v as PaymentMethod }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(METHOD_MAP).map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(METHOD_MAP[m] ?? 'paymentMethod.OTHER')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </UiSelect>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={() => record.mutate()}
              disabled={record.isPending || !form.amount || Number(form.amount) <= 0}
            >
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
