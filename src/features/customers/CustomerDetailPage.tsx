/**
 * HOUSE-ZEN — Customer detail page (fiche client).
 * Identity + ID document (number decrypted ONLY through the audited RPC
 * hz_read_id_document) + full stay history: every passage with arrival /
 * departure dates AND times, number of nights, room, status and amount.
 * The FIRST registration (earliest arrival) is visually set apart with an
 * accent bar and a dedicated badge.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Mail, MapPin, Phone, Sparkles, Wallet } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader, StatCard, StatusBadge } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/misc';
import { useEntity, useEntityList } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/lib/auth/context';
import { getDataApi } from '@/lib/api';
import { formatMoney, formatDate, formatTime, nightsBetween } from '@/lib/utils/money-dates';
import type { UUID } from '@/types/domain';

const STATUS_VARIANTS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' }> = {
  DRAFT: { label: 'DRAFT', variant: 'secondary' },
  PENDING: { label: 'PENDING', variant: 'warning' },
  CONFIRMED: { label: 'CONFIRMED', variant: 'default' },
  CHECKED_IN: { label: 'CHECKED_IN', variant: 'success' },
  CHECKED_OUT: { label: 'CHECKED_OUT', variant: 'secondary' },
  CANCELLED: { label: 'CANCELLED', variant: 'destructive' },
  NO_SHOW: { label: 'NO_SHOW', variant: 'destructive' },
};

type Row = Record<string, unknown>;

export default function CustomerDetailPage() {
  const { t, locale } = useTranslation();
  const { session } = useAuth();
  const { id } = useParams<{ id: UUID }>();
  const currency = session?.tenant?.currency ?? 'XAF';

  const { data: customer, isLoading } = useEntity<Row>('customers', id);
  const { data: reservations } = useEntityList<Row>('reservations', {
    filters: { customer_id: id },
    sort: { check_in_date: 'desc' },
    pageSize: 200,
  });
  const { data: items } = useEntityList<Row>('reservation_items', { pageSize: 500 });
  const { data: rooms } = useEntityList<Row>('rooms', { pageSize: 500 });

  // Audited PII read — every access is logged server-side (migration 052).
  const [idNumber, setIdNumber] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setIdNumber(null);
    if (!id) return;
    getDataApi()
      .readIdDocument('customers', id)
      .then((n) => { if (alive) setIdNumber(n); })
      .catch(() => { if (alive) setIdNumber(null); });
    return () => { alive = false; };
  }, [id]);

  const roomByReservation = useMemo(() => {
    const roomIdByRes = new Map<string, string>();
    for (const it of items?.items ?? []) {
      if (!roomIdByRes.has(String(it.reservation_id))) {
        roomIdByRes.set(String(it.reservation_id), String(it.room_id));
      }
    }
    const numberByRoom = new Map((rooms?.items ?? []).map((r) => [String(r.id), String(r.room_number)]));
    return (resId: string) => {
      const rid = roomIdByRes.get(resId);
      return rid ? numberByRoom.get(rid) ?? null : null;
    };
  }, [items, rooms]);

  const stays = useMemo(() => reservations?.items ?? [], [reservations]);

  /** First registration = earliest arrival among all stays (tie → lowest ref). */
  const firstStayId = useMemo(() => {
    let best: { key: string; id: string } | null = null;
    for (const r of stays) {
      const key = `${String(r.check_in_date)}T${String(r.check_in_time ?? '23:59')}`;
      if (!best || key < best.key) best = { key, id: String(r.id) };
    }
    return best?.id ?? null;
  }, [stays]);

  const totals = useMemo(() => {
    const valid = stays.filter((r) => r.status !== 'CANCELLED' && r.status !== 'NO_SHOW');
    const nights = valid.reduce(
      (acc, r) => acc + Math.max(nightsBetween(String(r.check_in_date), String(r.check_out_date)), 0),
      0,
    );
    const spent = valid.reduce((acc, r) => acc + Number(r.total_amount ?? 0), 0);
    return { count: valid.length, nights, spent };
  }, [stays]);

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>;
  }
  if (!customer) {
    return (
      <div className="space-y-3">
        <EmptyState title={t('customers.detail.notFound')} />
        <div className="flex justify-center">
          <Link to="/app/customers" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <ArrowLeft size={14} /> {t('customers.detail.back')}
          </Link>
        </div>
      </div>
    );
  }

  const fullName = String(customer.full_name ?? '');
  const idType = customer.id_type ? String(customer.id_type) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title={fullName}
        description={t('customers.detail.title')}
        actions={
          <Link to="/app/customers" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <ArrowLeft size={14} /> {t('customers.detail.back')}
          </Link>
        }
      />

      {/* Identity + ID document */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold">{t('customers.detail.identity')}</h2>
              {idType ? (
                <Badge variant="secondary">{t(`customers.idType.${idType}`)}</Badge>
              ) : null}
              {idNumber ? (
                <Badge variant="outline" className="font-mono">{idNumber}</Badge>
              ) : null}
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-muted-foreground" />
                <dt className="sr-only">{t('common.email')}</dt>
                <dd className="truncate">{customer.email ? String(customer.email) : '—'}</dd>
              </div>
              <div className="flex items-center gap-2">
                <Phone size={14} className="text-muted-foreground" />
                <dt className="sr-only">{t('common.phone')}</dt>
                <dd>{customer.phone ? String(customer.phone) : '—'}</dd>
              </div>
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-muted-foreground" />
                <dt className="sr-only">{t('common.country')}</dt>
                <dd>{customer.country ? String(customer.country) : '—'}</dd>
              </div>
              <div className="flex items-center gap-2">
                <CalendarClock size={14} className="text-muted-foreground" />
                <dt className="sr-only">{t('customers.idIssueDate')}</dt>
                <dd className="text-muted-foreground">
                  {customer.id_issue_date
                    ? `${t('customers.idIssued')} ${formatDate(String(customer.id_issue_date), locale)}${customer.id_issue_place ? ` · ${String(customer.id_issue_place)}` : ''}`
                    : '—'}
                </dd>
              </div>
            </dl>
            {customer.notes ? (
              <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{String(customer.notes)}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex h-full flex-col justify-center gap-1 p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles size={14} className="text-primary" /> {t('customers.detail.clientSince')}
            </p>
            <p className="text-2xl font-semibold tracking-tight text-primary">
              {firstStayId
                ? formatDate(String(stays.find((r) => String(r.id) === firstStayId)?.check_in_date), locale)
                : formatDate(String(customer.created_at ?? '').slice(0, 10), locale)}
            </p>
            <p className="text-xs text-muted-foreground">{t('customers.detail.clientSinceHint')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Aggregate stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={t('customers.detail.stays')} value={String(totals.count)} />
        <StatCard label={t('customers.detail.nights')} value={String(totals.nights)} />
        <StatCard
          label={t('customers.detail.spent')}
          value={formatMoney(totals.spent, currency, locale)}
          icon={<Wallet size={16} />}
        />
      </div>

      {/* Stay history */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-base font-semibold">{t('customers.detail.history')}</h2>
            <span className="text-xs text-muted-foreground">{t('customers.detail.historyHint')}</span>
          </div>
          {stays.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('customers.detail.noStays')} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reservations.checkIn')}</TableHead>
                  <TableHead>{t('reservations.checkOut')}</TableHead>
                  <TableHead>{t('customers.detail.nightsShort')}</TableHead>
                  <TableHead>{t('reservations.room')}</TableHead>
                  <TableHead>{t('common.total')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stays.map((r) => {
                  const isFirst = String(r.id) === firstStayId;
                  const status = STATUS_VARIANTS[String(r.status)];
                  return (
                    <TableRow
                      key={String(r.id)}
                      className={isFirst ? 'border-s-4 border-s-primary bg-primary/5' : undefined}
                    >
                      <TableCell>
                        <div className="font-medium">
                          {formatDate(String(r.check_in_date), locale)}
                          <span className="ms-1.5 font-mono text-xs text-muted-foreground">
                            {r.check_in_time ? formatTime(String(r.check_in_time), locale) : ''}
                          </span>
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">{String(r.reference ?? '')}</div>
                      </TableCell>
                      <TableCell>
                        {formatDate(String(r.check_out_date), locale)}
                        <span className="ms-1.5 font-mono text-xs text-muted-foreground">
                          {r.check_out_time ? formatTime(String(r.check_out_time), locale) : ''}
                        </span>
                      </TableCell>
                      <TableCell>
                        {Math.max(nightsBetween(String(r.check_in_date), String(r.check_out_date)), 0)}
                      </TableCell>
                      <TableCell>{roomByReservation(String(r.id)) ?? '—'}</TableCell>
                      <TableCell>{formatMoney(Number(r.total_amount ?? 0), String(r.currency ?? currency), locale)}</TableCell>
                      <TableCell>
                        {isFirst ? (
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge
                              status={String(r.status)}
                              map={Object.fromEntries(
                                Object.entries(STATUS_VARIANTS).map(([k, v]) => [k, { ...v, label: t(`reservations.status.${k}`) }]),
                              )}
                            />
                            <Badge className="bg-primary text-primary-foreground hover:bg-primary">
                              ★ {t('customers.detail.firstRegistration')}
                            </Badge>
                          </div>
                        ) : status ? (
                          <StatusBadge
                            status={String(r.status)}
                            map={Object.fromEntries(
                              Object.entries(STATUS_VARIANTS).map(([k, v]) => [k, { ...v, label: t(`reservations.status.${k}`) }]),
                            )}
                          />
                        ) : null}
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
