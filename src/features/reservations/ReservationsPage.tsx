/**
 * HOUSE-ZEN — Reservations page.
 * Creation runs through the single atomic engine (DataApi.createReservationAtomic)
 * which enforces availability + pricing server-side. Status transitions follow the
 * state machine (PENDING/CONFIRMED → CHECKED_IN → CHECKED_OUT, CANCELLED, NO_SHOW).
 */

import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Ban, UserX, LogIn, LogOut as LogOutIcon } from 'lucide-react';
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
import { formatMoney, formatDate, formatTime, isValidDateRange, addDaysISO, todayISO } from '@/lib/utils/money-dates';
import { DomainError, type Quote, type Reservation, type UUID } from '@/types/domain';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' }> = {
  DRAFT: { label: 'DRAFT', variant: 'secondary' },
  PENDING: { label: 'PENDING', variant: 'warning' },
  CONFIRMED: { label: 'CONFIRMED', variant: 'default' },
  CHECKED_IN: { label: 'CHECKED_IN', variant: 'success' },
  CHECKED_OUT: { label: 'CHECKED_OUT', variant: 'secondary' },
  CANCELLED: { label: 'CANCELLED', variant: 'destructive' },
  NO_SHOW: { label: 'NO_SHOW', variant: 'destructive' },
};

export default function ReservationsPage() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [form, setForm] = useState({
    customer_id: '',
    room_type_id: '',
    room_id: '',
    check_in_date: todayISO(),
    check_in_time: '14:00',
    check_out_date: addDaysISO(todayISO(), 2),
    check_out_time: '12:00',
    adults: 2,
    children: 0,
    notes: '',
  });

  const { data: reservations, isLoading } = useEntityList<Reservation>('reservations', {
    sort: { created_at: 'desc' },
    pageSize: 200,
    filters: statusFilter !== 'ALL' ? { status: statusFilter } : undefined,
  });
  const { data: customers } = useEntityList<Record<string, unknown>>('customers', { pageSize: 500 });
  const { data: rooms } = useEntityList<Record<string, unknown>>('rooms', { pageSize: 500 });
  const { data: roomTypes } = useEntityList<Record<string, unknown>>('room_types', { pageSize: 500 });
  const { data: reservationItems } = useEntityList<Record<string, unknown>>('reservation_items', { pageSize: 500 });

  const roomsById = useMemo(
    () => new Map((rooms?.items ?? []).map((r) => [String(r.id), r])),
    [rooms],
  );
  const roomByReservation = useMemo(() => {
    const m = new Map<string, string>();
    for (const ri of reservationItems?.items ?? []) {
      m.set(String(ri.reservation_id), String(ri.room_id));
    }
    return m;
  }, [reservationItems]);
  const typesById = useMemo(
    () => new Map((roomTypes?.items ?? []).map((r) => [String(r.id), r])),
    [roomTypes],
  );
  const customersById = useMemo(
    () => new Map((customers?.items ?? []).map((c) => [String(c.id), c])),
    [customers],
  );

  const refreshAll = () => {
    ['reservations', 'reservation_items', 'rooms', 'invoices', 'notifications', 'audit_logs'].forEach((e) =>
      qc.invalidateQueries({ queryKey: ['hz', e] }),
    );
  };

  const invalidateQuote = useMutation({
    mutationFn: async (f: typeof form) => {
      if (!f.room_type_id || !isValidDateRange(f.check_in_date, f.check_out_date)) return null;
      const propertyId = String(typesById.get(f.room_type_id)?.property_id ?? '');
      return getDataApi().quote({
        property_id: propertyId,
        room_type_id: f.room_type_id,
        room_id: f.room_id || undefined,
        check_in_date: f.check_in_date,
        check_out_date: f.check_out_date,
      });
    },
  });

  async function openCreate() {
    const firstType = roomTypes?.items?.[0];
    setForm({
      customer_id: customers?.items?.[0] ? String(customers.items[0].id) : '',
      room_type_id: firstType ? String(firstType.id) : '',
      room_id: '',
      check_in_date: todayISO(),
      check_in_time: '14:00',
      check_out_date: addDaysISO(todayISO(), 2),
      check_out_time: '12:00',
      adults: 2,
      children: 0,
      notes: '',
    });
    setError(null);
    setQuote(null);
    setCreateOpen(true);
  }

  async function refreshQuote(f: typeof form) {
    setForm(f);
    try {
      const q = await invalidateQuote.mutateAsync(f);
      setQuote(q);
    } catch {
      setQuote(null);
    }
  }

  const createReservation = useMutation({
    mutationFn: async () => {
      if (!form.customer_id || !form.room_id || !form.room_type_id) {
        throw new DomainError('VALIDATION', 'Champs requis manquants');
      }
      return getDataApi().createReservationAtomic({
        property_id: String(typesById.get(form.room_type_id)?.property_id ?? ''),
        customer_id: form.customer_id,
        room_id: form.room_id,
        room_type_id: form.room_type_id,
        check_in_date: form.check_in_date,
        check_in_time: form.check_in_time,
        check_out_date: form.check_out_date,
        check_out_time: form.check_out_time,
        adults: form.adults,
        children: form.children,
        notes: form.notes || undefined,
        source: 'BACK_OFFICE',
      });
    },
    onSuccess: () => {
      setCreateOpen(false);
      refreshAll();
    },
    onError: (e) => {
      setError(e instanceof Error ? e.message : t('common.error'));
    },
  });

  async function changeStatus(id: UUID, to: Reservation['status'], reason?: string) {
    setError(null);
    try {
      await getDataApi().updateReservationStatus(id, to, reason);
      refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function doCheckin(id: UUID) {
    setError(null);
    try {
      await getDataApi().performCheckin(id);
      refreshAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    }
  }

  async function doCheckout(id: UUID) {
    setError(null);
    try {
      await getDataApi().performCheckout(id, false);
      refreshAll();
    } catch (e) {
      if (e instanceof DomainError && e.code === 'BALANCE_DUE') {
        const ok = window.confirm(`${t('errors.balanceDue')}\n${e.message}\n\n${t('common.confirm')} ?`);
        if (ok) {
          try {
            await getDataApi().performCheckout(id, true);
            refreshAll();
          } catch (e2) {
            setError(e2 instanceof Error ? e2.message : t('common.error'));
          }
        }
      } else {
        setError(e instanceof Error ? e.message : t('common.error'));
      }
    }
  }

  const validRooms = isValidDateRange(form.check_in_date, form.check_out_date)
    ? (rooms?.items ?? []).filter(
        (r) => String(r.room_type_id) === form.room_type_id && String(r.status) === 'OPERATIONAL',
      )
    : [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('reservations.title')}
        actions={
          <>
            <UiSelect value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('common.all')}</SelectItem>
                {Object.keys(STATUS_MAP).map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`reservations.status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </UiSelect>
            <Button onClick={openCreate}>
              <Plus size={16} /> {t('reservations.create')}
            </Button>
          </>
        }
      />

      {error ? (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

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
                  <TableHead>{t('reservations.room')}</TableHead>
                  <TableHead>{t('reservations.checkIn')}</TableHead>
                  <TableHead>{t('reservations.checkOut')}</TableHead>
                  <TableHead>{t('common.total')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reservations.items.map((r) => {
                  const roomId = roomByReservation.get(r.id);
                  const room = roomId ? roomsById.get(roomId) : undefined;
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                      <TableCell>{String(customersById.get(r.customer_id)?.full_name ?? '—')}</TableCell>
                      <TableCell>{room ? String(room.room_number) : '—'}</TableCell>
                      <TableCell>
                        {formatDate(r.check_in_date, locale)}
                        <span className="ms-1.5 font-mono text-xs text-muted-foreground">{formatTime(r.check_in_time, locale)}</span>
                      </TableCell>
                      <TableCell>
                        {formatDate(r.check_out_date, locale)}
                        <span className="ms-1.5 font-mono text-xs text-muted-foreground">{formatTime(r.check_out_time, locale)}</span>
                      </TableCell>
                      <TableCell>{formatMoney(r.total_amount, r.currency, locale)}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} map={Object.fromEntries(
                          Object.entries(STATUS_MAP).map(([k, v]) => [k, { ...v, label: t(`reservations.status.${k}`) }]),
                        )} />
                      </TableCell>
                      <TableCell className="text-end">
                        <div className="flex items-center justify-end gap-1">
                          {r.status === 'PENDING' ? (
                            <Button size="sm" variant="outline" onClick={() => changeStatus(r.id, 'CONFIRMED')}>
                              {t('reservations.confirm')}
                            </Button>
                          ) : null}
                          {r.status === 'CONFIRMED' ? (
                            <Button size="sm" onClick={() => doCheckin(r.id)}>
                              <LogIn size={13} /> {t('reservations.checkin')}
                            </Button>
                          ) : null}
                          {r.status === 'CHECKED_IN' ? (
                            <Button size="sm" onClick={() => doCheckout(r.id)}>
                              <LogOutIcon size={13} /> {t('reservations.checkout')}
                            </Button>
                          ) : null}
                          {['PENDING', 'CONFIRMED'].includes(r.status) ? (
                            <>
                              <Button size="icon" variant="ghost" title={t('reservations.cancel')} onClick={() => changeStatus(r.id, 'CANCELLED', 'Annulée par le back-office')}>
                                <Ban size={14} className="text-destructive" />
                              </Button>
                              <Button size="icon" variant="ghost" title={t('reservations.noShow')} onClick={() => changeStatus(r.id, 'NO_SHOW')}>
                                <UserX size={14} className="text-warning" />
                              </Button>
                            </>
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

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('reservations.create')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t('reservations.customer')}</Label>
              <UiSelect value={form.customer_id} onValueChange={(v) => setForm((f) => ({ ...f, customer_id: v }))}>
                <SelectTrigger><SelectValue placeholder={t('reservations.selectCustomer')} /></SelectTrigger>
                <SelectContent>
                  {(customers?.items ?? []).map((c) => (
                    <SelectItem key={String(c.id)} value={String(c.id)}>
                      {String(c.full_name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </UiSelect>
            </div>
            <div className="space-y-1.5">
              <Label>{t('reservations.roomType')}</Label>
              <UiSelect
                value={form.room_type_id}
                onValueChange={async (v) => {
                  await refreshQuote({ ...form, room_type_id: v, room_id: '' });
                }}
              >
                <SelectTrigger><SelectValue placeholder={t('reservations.selectRoomType')} /></SelectTrigger>
                <SelectContent>
                  {(roomTypes?.items ?? []).map((rt) => (
                    <SelectItem key={String(rt.id)} value={String(rt.id)}>
                      {String(rt.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </UiSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ci">{t('reservations.checkIn')}</Label>
              <div className="flex gap-2">
                <Input
                  id="ci"
                  type="date"
                  className="flex-1"
                  value={form.check_in_date}
                  onChange={(e) => void refreshQuote({ ...form, check_in_date: e.target.value })}
                />
                <Input
                  aria-label={t('reservations.checkInTime')}
                  type="time"
                  className="w-28"
                  value={form.check_in_time}
                  onChange={(e) => setForm((f) => ({ ...f, check_in_time: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="co">{t('reservations.checkOut')}</Label>
              <div className="flex gap-2">
                <Input
                  id="co"
                  type="date"
                  className="flex-1"
                  value={form.check_out_date}
                  onChange={(e) => void refreshQuote({ ...form, check_out_date: e.target.value })}
                />
                <Input
                  aria-label={t('reservations.checkOutTime')}
                  type="time"
                  className="w-28"
                  value={form.check_out_time}
                  onChange={(e) => setForm((f) => ({ ...f, check_out_time: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adults">{t('reservations.adults')}</Label>
              <Input
                id="adults"
                type="number"
                min={1}
                value={form.adults}
                onChange={(e) => setForm((f) => ({ ...f, adults: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="children">{t('reservations.children')}</Label>
              <Input
                id="children"
                type="number"
                min={0}
                value={form.children}
                onChange={(e) => setForm((f) => ({ ...f, children: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>{t('reservations.room')}</Label>
              <UiSelect value={form.room_id} onValueChange={(v) => setForm((f) => ({ ...f, room_id: v }))}>
                <SelectTrigger><SelectValue placeholder={t('reservations.selectRoom')} /></SelectTrigger>
                <SelectContent>
                  {validRooms.map((r) => (
                    <SelectItem key={String(r.id)} value={String(r.id)}>
                      {String(r.room_number)} — {String(typesById.get(String(r.room_type_id))?.name ?? '')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </UiSelect>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">{t('common.notes')}</Label>
              <Input id="notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>

          {quote ? (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="mb-1 font-semibold">{t('reservations.quote')}</p>
              <div className="flex justify-between">
                <span>
                  {quote.nightly_rate !== undefined
                    ? `${formatMoney(quote.nightly_rate, quote.currency, locale)} × ${quote.nights} ${t('common.night', { count: quote.nights })}`
                    : ''}
                </span>
                <span>{formatMoney(quote.room_total, quote.currency, locale)}</span>
              </div>
              {quote.services.map((s, i) => (
                <div key={i} className="flex justify-between text-muted-foreground">
                  <span>{s.label} ×{s.quantity}</span>
                  <span>{formatMoney(s.total, quote.currency, locale)}</span>
                </div>
              ))}
              <div className="flex justify-between text-muted-foreground">
                <span>{t('invoices.tax')} ({quote.tax_percent}%)</span>
                <span>{formatMoney(quote.tax_total, quote.currency, locale)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
                <span>{t('common.total')}</span>
                <span>{formatMoney(quote.total, quote.currency, locale)}</span>
              </div>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => createReservation.mutate()}
              disabled={createReservation.isPending || !form.room_id || !form.customer_id}
            >
              {t('reservations.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
