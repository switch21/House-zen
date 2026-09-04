/**
 * HOUSE-ZEN — Public booking engine (PHASE 11), route /book/:propertySlug.
 * Reuses the SAME availability engine as the back office (spec §10/§11).
 * Prices are ALWAYS recomputed server-side; the browser quote is indicative.
 * No account required; idempotency key prevents double submits.
 */

import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { CalendarDays, Hotel, MapPin, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi } from '@/lib/api';
import { addDaysISO, formatMoney, isValidDateRange, nightsBetween, todayISO } from '@/lib/utils/money-dates';
import { uuid } from '@/lib/utils';
import { DomainError, type AvailableRoomType } from '@/types/domain';

interface PropertyDetails {
  id: string;
  name: string;
  slug: string;
  city: string;
  country: string;
  currency: string;
  room_types: { id: string; name: string; description: string; base_price: number; max_occupancy: number }[];
}

export default function PublicBookingPage() {
  const { propertySlug = '' } = useParams();
  const { t, locale } = useTranslation();
  const [checkIn, setCheckIn] = useState(todayISO());
  const [checkOut, setCheckOut] = useState(addDaysISO(todayISO(), 2));
  const [adults, setAdults] = useState(2);
  const [offers, setOffers] = useState<AvailableRoomType[] | null>(null);
  const [selected, setSelected] = useState<AvailableRoomType | null>(null);
  const [guest, setGuest] = useState({ full_name: '', email: '', phone: '', country: '' });
  const [bookingResult, setBookingResult] = useState<{ reference: string; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: property, isLoading } = useQuery({
    queryKey: ['public', 'property', propertySlug],
    queryFn: () => getDataApi().publicProperty(propertySlug),
  });

  const nights = useMemo(
    () => (isValidDateRange(checkIn, checkOut) ? nightsBetween(checkIn, checkOut) : 0),
    [checkIn, checkOut],
  );

  const search = useMutation({
    mutationFn: async () => {
      const res = await getDataApi().publicSearchAvailability(propertySlug, checkIn, checkOut, adults);
      return res;
    },
    onSuccess: (res) => {
      setOffers(res);
      setSelected(null);
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('common.error')),
  });

  const book = useMutation({
    mutationFn: async () => {
      if (!selected) throw new DomainError('VALIDATION', 'Choisissez une chambre');
      return getDataApi().publicCreateBooking({
        property_slug: propertySlug,
        room_type_id: selected.room_type_id,
        check_in_date: checkIn,
        check_out_date: checkOut,
        adults,
        children: 0,
        guest: {
          full_name: guest.full_name,
          email: guest.email,
          phone: guest.phone,
          country: guest.country || undefined,
        },
        idempotency_key: uuid(),
      });
    },
    onSuccess: (res) => {
      setBookingResult({ reference: res.reference, total: res.total });
      setError(null);
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('common.error')),
  });

  const p = property as PropertyDetails | null | undefined;
  const currency = p?.currency ?? 'XAF';
  const estimate = selected ? selected.nightly_rate * Math.max(nights, 1) : 0;

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  if (!p) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <Hotel size={40} className="text-muted-foreground" />
        <h1 className="text-xl font-semibold">{t('errors.notFound')}</h1>
        <p className="text-sm text-muted-foreground">{propertySlug}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-secondary/50">
      <header className="bg-gradient-to-r from-[hsl(var(--sidebar))] to-primary/80 px-6 py-10 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-2 text-sm opacity-80">
            <Hotel size={16} /> {t('app.name')} — {t('booking.title')}
          </div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{p.name}</h1>
          <p className="mt-1 flex items-center gap-1 text-sm opacity-90">
            <MapPin size={14} /> {p.city}, {p.country}
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        {bookingResult ? (
          <Card className="border-success/40">
            <CardHeader>
              <CardTitle className="text-success">✓ {t('booking.confirmed')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">{t('booking.manageHint')}</p>
              <p className="rounded-lg bg-success/10 px-4 py-3 font-mono text-lg font-bold text-success">
                {t('booking.reference')} : {bookingResult.reference}
              </p>
              <p className="text-sm">
                {t('common.total')} : <strong>{formatMoney(bookingResult.total, currency, locale)}</strong>
              </p>
              <p className="text-xs text-muted-foreground">{t('booking.payAtProperty')}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Search bar */}
            <Card>
              <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pub-ci" className="flex items-center gap-1 text-xs">
                    <CalendarDays size={13} /> {t('reservations.checkIn')}
                  </Label>
                  <Input id="pub-ci" type="date" value={checkIn} min={todayISO()} onChange={(e) => setCheckIn(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pub-co" className="text-xs">
                    {t('reservations.checkOut')}
                  </Label>
                  <Input id="pub-co" type="date" value={checkOut} min={addDaysISO(checkIn, 1)} onChange={(e) => setCheckOut(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pub-adults" className="flex items-center gap-1 text-xs">
                    <Users size={13} /> {t('reservations.adults')}
                  </Label>
                  <Input
                    id="pub-adults"
                    type="number"
                    min={1}
                    max={8}
                    value={adults}
                    onChange={(e) => setAdults(Math.max(1, Number(e.target.value)))}
                  />
                </div>
                <div className="flex items-end">
                  <Button className="w-full" onClick={() => search.mutate()} disabled={search.isPending || !isValidDateRange(checkIn, checkOut)}>
                    {search.isPending ? t('common.loading') : t('booking.search')}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {error ? (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}

            {/* Offers */}
            {offers ? (
              offers.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center text-sm text-muted-foreground">
                    {t('reservations.unavailable')}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {offers.map((o) => (
                    <Card
                      key={o.room_type_id}
                      className={selected?.room_type_id === o.room_type_id ? 'border-primary ring-1 ring-primary' : ''}
                    >
                      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{o.name}</h3>
                            <Badge variant="success">{t('booking.available')}</Badge>
                          </div>
                          <p className="mt-0.5 text-sm text-muted-foreground">{o.description}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {o.available_rooms} × {t('booking.available')} · max {o.max_occupancy} {t('booking.guests').toLowerCase()}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-end">
                            <p className="text-lg font-bold">{formatMoney(o.nightly_rate, o.currency, locale)}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {t('common.night_other', { count: nights || 1 })} ≈{' '}
                              {formatMoney(o.nightly_rate * (nights || 1), o.currency, locale)}
                            </p>
                          </div>
                          <Button
                            variant={selected?.room_type_id === o.room_type_id ? 'default' : 'outline'}
                            onClick={() => setSelected(o)}
                          >
                            {selected?.room_type_id === o.room_type_id ? '✓' : t('booking.book')}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )
            ) : null}

            {/* Guest form */}
            {selected ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {t('booking.yourInfo')} — {selected.name}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="g-name">{t('booking.fullName')}</Label>
                      <Input id="g-name" value={guest.full_name} onChange={(e) => setGuest((g) => ({ ...g, full_name: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="g-email">{t('common.email')}</Label>
                      <Input id="g-email" type="email" value={guest.email} onChange={(e) => setGuest((g) => ({ ...g, email: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="g-phone">{t('common.phone')}</Label>
                      <Input id="g-phone" value={guest.phone} onChange={(e) => setGuest((g) => ({ ...g, phone: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="g-country">{t('common.country')}</Label>
                      <Input id="g-country" value={guest.country} onChange={(e) => setGuest((g) => ({ ...g, country: e.target.value }))} />
                    </div>
                  </div>

                  <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                    <p className="mb-1 font-semibold">{t('booking.summary')}</p>
                    <div className="flex justify-between">
                      <span>
                        {selected.name} — {nights} {t('common.night_other', { count: nights })}
                      </span>
                      <span>{formatMoney(estimate, currency, locale)}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{t('booking.taxesIncluded')}</p>
                  </div>

                  <Button
                    className="w-full"
                    size="lg"
                    onClick={() => book.mutate()}
                    disabled={book.isPending || !guest.full_name || !guest.email || !guest.phone}
                  >
                    {book.isPending ? t('common.loading') : t('booking.book')}
                  </Button>
                </CardContent>
              </Card>
            ) : null}
          </>
        )}

        <p className="flex items-center justify-center gap-1.5 pt-2 text-center text-xs text-muted-foreground">
          <ShieldCheck size={13} /> {t('booking.securedBy')} · © {new Date().getFullYear()} {p.name}
        </p>
      </main>
    </div>
  );
}
