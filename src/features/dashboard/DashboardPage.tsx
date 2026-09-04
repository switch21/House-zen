/**
 * HOUSE-ZEN — Dashboard (PHASE 7): occupancy, ADR, RevPAR, revenue vs expenses,
 * arrivals/departures today, recent reservations. Charts via Recharts.
 */

import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis,
} from 'recharts';
import { BedDouble, CalendarCheck, CalendarX2, Sparkles, TrendingUp, Wrench, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, StatCard, StatusBadge } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/lib/auth/context';
import { getDataApi } from '@/lib/api';
import { formatMoney, formatDate } from '@/lib/utils/money-dates';
import type { KPIs } from '@/lib/api/types';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' }> = {
  PENDING: { label: 'PENDING', variant: 'warning' },
  CONFIRMED: { label: 'CONFIRMED', variant: 'default' },
  CHECKED_IN: { label: 'CHECKED_IN', variant: 'success' },
  CHECKED_OUT: { label: 'CHECKED_OUT', variant: 'secondary' },
  CANCELLED: { label: 'CANCELLED', variant: 'destructive' },
  NO_SHOW: { label: 'NO_SHOW', variant: 'destructive' },
  DRAFT: { label: 'DRAFT', variant: 'secondary' },
};

export default function DashboardPage() {
  const { t, locale } = useTranslation();
  const { session } = useAuth();
  const navigate = useNavigate();
  const currency = session?.tenant?.currency ?? 'XAF';

  const { data: kpis, isLoading } = useQuery({
    queryKey: ['hz', 'kpis', session?.tenant?.id ?? 'none'],
    queryFn: () => getDataApi().kpis(session?.tenant?.id ?? ''),
    enabled: Boolean(session?.tenant),
  });

  if (isLoading || !kpis) {
    return (
      <div className="space-y-4">
        <PageHeader title={t('dashboard.title')} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const k = kpis as KPIs;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('dashboard.title')}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/app/checkins')}>
              {t('nav.checkins')}
            </Button>
            <Button onClick={() => navigate('/app/reservations')}>
              {t('reservations.create')}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t('dashboard.occupancy')}
          value={`${k.occupancyRate}%`}
          hint={`${k.occupiedRooms}/${k.totalRooms} ${t('dashboard.occupiedRooms').toLowerCase()}`}
          icon={<BedDouble size={16} />}
        />
        <StatCard label={t('dashboard.adr')} value={formatMoney(k.adr, currency, locale)} icon={<TrendingUp size={16} />} />
        <StatCard label={t('dashboard.revpar')} value={formatMoney(k.revpar, currency, locale)} icon={<TrendingUp size={16} />} tone="success" />
        <StatCard
          label={t('dashboard.revenue')}
          value={formatMoney(k.revenue30d, currency, locale)}
          hint={`${t('nav.expenses')}: ${formatMoney(k.expenses30d, currency, locale)}`}
          icon={<Wallet size={16} />}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('dashboard.arrivalsToday')} value={String(k.arrivalsToday.length)} icon={<CalendarCheck size={16} />} />
        <StatCard label={t('dashboard.departuresToday')} value={String(k.departuresToday.length)} icon={<CalendarX2 size={16} />} />
        <StatCard label={t('dashboard.dirtyRooms')} value={String(k.dirtyRooms)} icon={<Sparkles size={16} />} tone={k.dirtyRooms > 3 ? 'warning' : 'default'} />
        <StatCard label={t('dashboard.openTickets')} value={String(k.openTickets)} icon={<Wrench size={16} />} tone={k.openTickets > 0 ? 'warning' : 'default'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('dashboard.revenueChart')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={k.revenueSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} width={60} />
                  <ReTooltip />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="expenses" fill="hsl(var(--destructive) / 0.6)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t('dashboard.occupancyChart')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={k.occupancySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 10 }} width={40} unit="%" domain={[0, 100]} />
                  <ReTooltip />
                  <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t('dashboard.recentReservations')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('reservations.reference')}</TableHead>
                <TableHead>{t('reservations.checkIn')}</TableHead>
                <TableHead>{t('reservations.checkOut')}</TableHead>
                <TableHead>{t('common.total')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {k.recentReservations.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                  <TableCell>{formatDate(r.check_in_date, locale)}</TableCell>
                  <TableCell>{formatDate(r.check_out_date, locale)}</TableCell>
                  <TableCell>{formatMoney(r.total_amount, r.currency, locale)}</TableCell>
                  <TableCell>
                    <StatusBadge
                      status={r.status}
                      map={Object.fromEntries(
                        Object.entries(STATUS_MAP).map(([key, v]) => [key, { ...v, label: t(`reservations.status.${key}`) }]),
                      )}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
