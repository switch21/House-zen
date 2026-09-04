/**
 * HOUSE-ZEN — Money & date utilities (spec §8/§9).
 * SQL stores NUMERIC(15,2); JS rounds half-up cent-safe. Never raw float math on amounts.
 */

export const CURRENCY_LOCALE_MAP: Record<string, string> = {
  XAF: 'fr-FR', EUR: 'de-DE', USD: 'en-US', GBP: 'en-GB', NGN: 'en-NG',
};

export function roundMoney(amount: number): number {
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  // toPrecision(12) normalizes 100.49999999999999 → 100.5 before rounding.
  const cents = Math.round(Number((abs * 100).toPrecision(12)));
  return (sign * cents) / 100;
}

export function addMoney(a: number, b: number): number {
  return roundMoney(a + b);
}
export function subMoney(a: number, b: number): number {
  return roundMoney(a - b);
}
export function mulMoney(amount: number, quantity: number): number {
  return roundMoney(amount * quantity);
}
export function percentOf(amount: number, percent: number): number {
  return roundMoney((amount * percent) / 100);
}

export function formatMoney(amount: number, currency = 'XAF', locale = 'fr-FR'): string {
  const fractionDigits = currency === 'XAF' || currency === 'XOF' ? 0 : 2;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

export function nightsBetween(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T00:00:00Z`).getTime();
  const b = new Date(`${checkOut}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Spec §10 intersection rule: new_check_in < existing_check_out AND new_check_out > existing_check_in. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysISO(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isValidDateRange(checkIn: string, checkOut: string): boolean {
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(checkIn) || !iso.test(checkOut)) return false;
  return new Date(`${checkOut}T00:00:00Z`) > new Date(`${checkIn}T00:00:00Z`);
}

export function formatDateTime(iso: string, timezone = 'Africa/Douala', locale = 'fr-FR'): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export function formatDate(iso: string, locale = 'fr-FR'): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
}

/** Formats a Postgres `time` value ("HH:mm" | "HH:mm:ss") as a locale clock. */
export function formatTime(time: string, _locale = 'fr-FR'): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  if (!m) return time;
  return `${(m[1] ?? '0').padStart(2, '0')}:${m[2] ?? '00'}`;
}
