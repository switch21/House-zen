/**
 * HOUSE-ZEN — Check-ins & Check-outs (spec §11) driven by perform_checkin/perform_checkout.
 */

import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogIn, LogOut as LogOutIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/misc';
import { PageHeader } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEntityList } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi } from '@/lib/api';
import { formatDate, formatMoney, todayISO } from '@/lib/utils/money-dates';
import { DomainError, type Reservation } from '@/types/domain';

export function CheckinsPage() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();
  const { data: reservations, isLoading } = useEntityList<Reservation>('reservations', {
    filters: { status: 'CONFIRMED' },
    sort: { check_in_date: 'asc' },
    pageSize: 200,
  });
  const { data: customers } = useEntityList<Record<string, unknown>>('customers', { pageSize: 500 });

  const doCheckin = useMutation({
    mutationFn: (id: string) => getDataApi().performCheckin(id),
    onSuccess: () => {
      ['reservations', 'checkins', 'rooms', 'notifications'].forEach((e) =>
        qc.invalidateQueries({ queryKey: ['hz', e] }),
      );
    },
    onError: (e) => window.alert(e instanceof Error ? e.message : t('common.error')),
  });

  const today = todayISO();

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.checkins')} description={t('dashboard.arrivalsToday')} />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : !reservations || reservations.items.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('common.empty')} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reservations.reference')}</TableHead>
                  <TableHead>{t('reservations.customer')}</TableHead>
                  <TableHead>{t('reservations.checkIn')}</TableHead>
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                    <TableCell>{String(customers?.items.find((c) => c.id === r.customer_id)?.full_name ?? '—')}</TableCell>
                    <TableCell>
                      {formatDate(r.check_in_date, locale)}
                      {r.check_in_date <= today ? (
                        <span className="ms-2 rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                          {t('booking.available')}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button size="sm" onClick={() => doCheckin.mutate(r.id)}>
                        <LogIn size={13} /> {t('reservations.checkin')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function CheckoutsPage() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();
  const { data: reservations, isLoading } = useEntityList<Reservation>('reservations', {
    filters: { status: 'CHECKED_IN' },
    sort: { check_out_date: 'asc' },
    pageSize: 200,
  });
  const { data: customers } = useEntityList<Record<string, unknown>>('customers', { pageSize: 500 });
  const { data: invoices } = useEntityList<Record<string, unknown>>('invoices', { pageSize: 500 });

  const pendingId = useRef<string | null>(null);
  const doCheckout = useMutation({
    mutationFn: async ({ id, force }: { id: string; force: boolean }) => {
      pendingId.current = id;
      return getDataApi().performCheckout(id, force);
    },
    onSuccess: () => {
      ['reservations', 'checkouts', 'rooms', 'invoices', 'notifications'].forEach((e) =>
        qc.invalidateQueries({ queryKey: ['hz', e] }),
      );
    },
    onError: (e) => {
      if (e instanceof DomainError && e.code === 'BALANCE_DUE') {
        const ok = window.confirm(`${t('errors.balanceDue')}\n${e.message}\n\n${t('common.confirm')} ?`);
        const id = pendingId.current;
        if (ok && id) {
          getDataApi()
            .performCheckout(id, true)
            .then(() => {
              ['reservations', 'checkouts', 'rooms'].forEach((x) => qc.invalidateQueries({ queryKey: ['hz', x] }));
            });
        }
        return;
      }
      window.alert(e instanceof Error ? e.message : t('common.error'));
    },
  });

  const checkoutWithTracking = (id: string) => {
    doCheckout.mutate({ id, force: false });
  };

  const invoiceByReservation = new Map(
    (invoices?.items ?? []).filter((i) => i.reservation_id).map((i) => [String(i.reservation_id), i]),
  );

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.checkouts')} description={t('dashboard.departuresToday')} />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : !reservations || reservations.items.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('common.empty')} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reservations.reference')}</TableHead>
                  <TableHead>{t('reservations.customer')}</TableHead>
                  <TableHead>{t('reservations.checkOut')}</TableHead>
                  <TableHead>{t('invoices.balance')}</TableHead>
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.items.map((r) => {
                  const inv = invoiceByReservation.get(r.id);
                  const balance = inv ? Number(inv.total) - Number(inv.amount_paid) : 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                      <TableCell>{String(customers?.items.find((c) => c.id === r.customer_id)?.full_name ?? '—')}</TableCell>
                      <TableCell>{formatDate(r.check_out_date, locale)}</TableCell>
                      <TableCell className={balance > 0 ? 'font-semibold text-destructive' : ''}>
                        {formatMoney(balance, r.currency, locale)}
                      </TableCell>
                      <TableCell className="text-end">
                        <Button size="sm" onClick={() => checkoutWithTracking(r.id)}>
                          <LogOutIcon size={13} /> {t('reservations.checkout')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
