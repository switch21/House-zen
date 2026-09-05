/**
 * HOUSE-ZEN — Calendar: 14-day × room occupancy grid.
 * Same availability semantics as the booking engine (single source, spec §10).
 */

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/shared';
import { useEntityList } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { addDaysISO, formatDate, todayISO } from '@/lib/utils/money-dates';
import { cn } from '@/lib/utils';
import type { Reservation } from '@/types/domain';

const BLOCKING: Reservation['status'][] = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];

export default function CalendarPage() {
  const { t, locale } = useTranslation();
  const [start, setStart] = useState(() => todayISO());
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDaysISO(start, i)), [start]);

  const roomsQuery = useEntityList<Record<string, unknown>>('rooms', {
    sort: { room_number: 'asc' },
    pageSize: 500,
  });
  const { data: rooms, isLoading: roomsLoading } = roomsQuery;
  const { data: reservations, isLoading: resLoading } = useEntityList<Reservation>('reservations', { pageSize: 500 });
  const { data: reservationItems, isError: itemsError } = useEntityList<Record<string, unknown>>('reservation_items', { pageSize: 500 });
  const loading = roomsLoading || resLoading;

  // room per reservation (join via reservation_items)
  const roomByReservation = useMemo(() => {
    const m = new Map<string, string>();
    for (const ri of reservationItems?.items ?? []) {
      m.set(String(ri.reservation_id), String(ri.room_id));
    }
    return m;
  }, [reservationItems]);

  const cell = (roomId: string, day: string): Reservation | undefined => {
    for (const r of reservations?.items ?? []) {
      if (!BLOCKING.includes(r.status)) continue;
      if (roomByReservation.get(r.id) === roomId && day >= r.check_in_date && day < r.check_out_date) {
        return r;
      }
    }
    return undefined;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('nav.calendar')}
        description={t('reservations.calendarHint')}
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setStart(addDaysISO(start, -7))} aria-label="prev">
              <ChevronLeft size={16} />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setStart(todayISO())}>
              {formatDate(todayISO(), locale)}
            </Button>
            <Button variant="outline" size="icon" onClick={() => setStart(addDaysISO(start, 7))} aria-label="next">
              <ChevronRight size={16} />
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label={t('common.loading')} />
        </div>
      ) : itemsError ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">{t('common.error')}</CardContent>
        </Card>
      ) : (
      <Card>
        <CardContent className="overflow-x-auto p-2 scrollbar-thin">
          <div className="min-w-[900px]">
            <div className="flex border-b">
              <div className="sticky start-0 z-10 w-24 shrink-0 bg-card p-2 text-xs font-semibold">
                {t('rooms.title')}
              </div>
              {days.map((d) => (
                <div key={d} className="w-16 shrink-0 p-2 text-center text-[10px] font-medium text-muted-foreground">
                  {d.slice(8)}/{d.slice(5, 7)}
                </div>
              ))}
            </div>
            {(rooms?.items ?? []).map((room) => (
              <div key={String(room.id)} className="flex border-b last:border-0">
                <div className="sticky start-0 z-10 w-24 shrink-0 bg-card p-2 text-xs font-medium">
                  {String(room.room_number)}
                </div>
                {days.map((d) => {
                  const res = cell(String(room.id), d);
                  return (
                    <div key={d} className="w-16 shrink-0 p-1">
                      <div
                        className={cn(
                          'h-7 rounded',
                          res
                            ? res.status === 'CHECKED_IN'
                              ? 'bg-success/70'
                              : 'bg-primary/60'
                            : String(room.status) === 'UNDER_MAINTENANCE'
                              ? 'bg-destructive/25'
                              : 'bg-muted/50',
                        )}
                        title={res ? `${res.reference} (${res.status})` : String(room.status)}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-success/70" /> {t('reservations.status.CHECKED_IN')}</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-primary/60" /> {t('reservations.status.CONFIRMED')}</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-destructive/25" /> {t('roomStatus.UNDER_MAINTENANCE')}</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-muted/50" /> {t('booking.available')}</span>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  );
}
