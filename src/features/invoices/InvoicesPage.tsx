/**
 * HOUSE-ZEN — Invoices (spec §14): DRAFT → ISSUED → (PARTIALLY_PAID) → PAID, VOID.
 * An issued invoice is immutable: corrections go through void + new invoice.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Send, Ban, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/misc';
import { PageHeader, StatusBadge } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEntityList } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi } from '@/lib/api';
import { formatMoney, formatDateTime } from '@/lib/utils/money-dates';
import type { UUID } from '@/types/domain';
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useState } from 'react';

const INVOICE_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' }> = {
  DRAFT: { label: 'DRAFT', variant: 'secondary' },
  ISSUED: { label: 'ISSUED', variant: 'warning' },
  PARTIALLY_PAID: { label: 'PARTIALLY_PAID', variant: 'default' },
  PAID: { label: 'PAID', variant: 'success' },
  VOID: { label: 'VOID', variant: 'destructive' },
};

export default function InvoicesPage() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [reservationId, setReservationId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: invoices, isLoading } = useEntityList<Record<string, unknown>>('invoices', {
    sort: { created_at: 'desc' },
    pageSize: 200,
  });
  const { data: reservations } = useEntityList<Record<string, unknown>>('reservations', {
    pageSize: 500,
    filters: { status: 'CHECKED_IN' },
  });

  const refresh = () => {
    ['invoices', 'invoice_items', 'audit_logs', 'notifications'].forEach((e) =>
      qc.invalidateQueries({ queryKey: ['hz', e] }),
    );
  };

  const issue = useMutation({
    mutationFn: (id: UUID) => getDataApi().issueInvoice(id),
    onSuccess: refresh,
    onError: (e) => window.alert(e instanceof Error ? e.message : t('common.error')),
  });

  const voidInvoice = useMutation({
    mutationFn: ({ id, reason }: { id: UUID; reason: string }) => getDataApi().voidInvoice(id, reason),
    onSuccess: refresh,
    onError: (e) => window.alert(e instanceof Error ? e.message : t('common.error')),
  });

  const createFromReservation = useMutation({
    mutationFn: (rid: string) => getDataApi().createInvoiceFromReservation(rid),
    onSuccess: () => {
      setCreateOpen(false);
      refresh();
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('common.error')),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('invoices.title')}
        description={t('invoices.issuedHint')}
        actions={
          <Button onClick={() => { setError(null); setCreateOpen(true); }}>
            <Plus size={16} /> {t('invoices.create')}
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : !invoices || invoices.items.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('common.empty')} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('invoices.number')}</TableHead>
                  <TableHead>{t('invoices.subtotal')}</TableHead>
                  <TableHead>{t('invoices.tax')}</TableHead>
                  <TableHead>{t('common.total')}</TableHead>
                  <TableHead>{t('invoices.paid')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.items.map((inv) => {
                  const status = String(inv.status);
                  return (
                    <TableRow key={String(inv.id)}>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-1.5">
                          <FileText size={13} className="text-muted-foreground" />
                          {String(inv.number)}
                        </div>
                      </TableCell>
                      <TableCell>{formatMoney(Number(inv.subtotal), String(inv.currency), locale)}</TableCell>
                      <TableCell>{formatMoney(Number(inv.tax_total), String(inv.currency), locale)}</TableCell>
                      <TableCell className="font-semibold">{formatMoney(Number(inv.total), String(inv.currency), locale)}</TableCell>
                      <TableCell>{formatMoney(Number(inv.amount_paid), String(inv.currency), locale)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={status}
                          map={Object.fromEntries(
                            Object.entries(INVOICE_MAP).map(([k, v]) => [k, { ...v, label: t(`invoiceStatus.${k}`) }]),
                          )}
                        />
                      </TableCell>
                      <TableCell>{inv.issued_at ? formatDateTime(String(inv.issued_at), undefined, locale) : '—'}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          {status === 'DRAFT' ? (
                            <Button size="sm" variant="outline" onClick={() => issue.mutate(String(inv.id))}>
                              <Send size={13} /> {t('invoices.issue')}
                            </Button>
                          ) : null}
                          {['DRAFT', 'ISSUED', 'PARTIALLY_PAID'].includes(status) ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              title={t('invoices.void')}
                              onClick={() => {
                                const reason = window.prompt('Motif ?') ?? '';
                                if (reason) voidInvoice.mutate({ id: String(inv.id), reason });
                              }}
                            >
                              <Ban size={14} className="text-destructive" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('invoices.create')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <UiSelect value={reservationId} onValueChange={setReservationId}>
              <SelectTrigger><SelectValue placeholder={t('reservations.title')} /></SelectTrigger>
              <SelectContent>
                {(reservations?.items ?? []).map((r) => (
                  <SelectItem key={String(r.id)} value={String(r.id)}>
                    {String(r.reference)} — {String(r.check_in_date)}→{String(r.check_out_date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </UiSelect>
            {error ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
            <Button
              disabled={!reservationId || createFromReservation.isPending}
              onClick={() => createFromReservation.mutate(reservationId)}
            >
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
