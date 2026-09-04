/**
 * HOUSE-ZEN — i18n core (PHASE 10). Official locales: fr, en, es, de, ar, it, sw.
 * Fallback chain: requested → fr → raw key. Arabic = RTL. Locale preference is a
 * UI preference stored in localStorage (allowed use case, spec §26).
 */

export const LOCALES = ['fr', 'en', 'es', 'de', 'ar', 'it', 'sw'] as const;
export type Locale = (typeof LOCALES)[number];
export const BASE_LOCALE: Locale = 'fr';
export const RTL_LOCALES: readonly Locale[] = ['ar'];

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: 'Français', en: 'English', es: 'Español', de: 'Deutsch', ar: 'العربية', it: 'Italiano', sw: 'Kiswahili',
};

export const LOCALE_INTL: Record<Locale, string> = {
  fr: 'fr-FR', en: 'en-US', es: 'es-ES', de: 'de-DE', ar: 'ar-MA', it: 'it-IT', sw: 'sw-KE',
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

type Dict = Record<string, string>;
const registries: Partial<Record<Locale, Dict>> = {};

export function registerLocale(locale: Locale, dict: Dict): void {
  registries[locale] = dict;
}

export function getDict(locale: Locale): Dict {
  return registries[locale] ?? registries[BASE_LOCALE] ?? {};
}

export interface TranslateVars {
  [key: string]: string | number;
}

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export function translate(locale: Locale, key: string, vars?: TranslateVars): string {
  const dict = getDict(locale);
  const direct = dict[key];
  if (direct !== undefined) return interpolate(direct, vars);
  const base = registries[BASE_LOCALE]?.[key];
  if (base !== undefined) return interpolate(base, vars);
  return key;
}

export function coverage(locale: Locale, referenceKeys: string[]): { missing: string[]; ratio: number } {
  const dict = registries[locale] ?? {};
  const missing = referenceKeys.filter((k) => !(k in dict));
  return {
    missing,
    ratio: referenceKeys.length === 0 ? 1 : (referenceKeys.length - missing.length) / referenceKeys.length,
  };
}

const STORAGE_KEY = 'house-zen.locale';

export function loadPreferredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isLocale(stored)) return stored;
  } catch {
    /* non-critical */
  }
  return BASE_LOCALE;
}

export function savePreferredLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* non-critical */
  }
}

export function applyDocumentDirection(locale: Locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = locale;
  document.documentElement.dir = isRTL(locale) ? 'rtl' : 'ltr';
}
