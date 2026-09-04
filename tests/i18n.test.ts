/**
 * HOUSE-ZEN — i18n coverage tests (PHASE 10).
 * fr = 100% base. en must be a full mirror. Other locales have documented
 * partial coverage with fr fallback (never blank, never hardcoded UI).
 */

import { describe, expect, it } from 'vitest';
import { allTranslations } from '@/lib/i18n/locales';
import { coverage } from '@/lib/i18n/core';

const FR_KEYS = Object.keys(allTranslations.fr);

describe('i18n', () => {
  it('exactly seven official locales are registered', () => {
    expect(Object.keys(allTranslations).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'it', 'sw']);
  });

  it('base locale fr has no empty values', () => {
    for (const [key, value] of Object.entries(allTranslations.fr)) {
      expect(String(value).length, key).toBeGreaterThan(0);
    }
  });

  it('en fully mirrors fr (100% coverage)', () => {
    const { missing, ratio } = coverage('en', FR_KEYS);
    expect(missing, missing.join(', ')).toHaveLength(0);
    expect(ratio).toBe(1);
  });

  it('secondary locales cover the navigation core and never crash on fallback', () => {
    for (const locale of ['es', 'de', 'ar', 'it', 'sw'] as const) {
      const { ratio } = coverage(locale, [
        'nav.dashboard', 'nav.reservations', 'nav.logout', 'auth.signIn',
        'reservations.title', 'common.save', 'errors.notFound',
      ]);
      expect(ratio, `${locale} core coverage`).toBeGreaterThan(0.8);
    }
  });

  it('arabic is flagged RTL, others LTR', async () => {
    const { isRTL } = await import('@/lib/i18n/core');
    expect(isRTL('ar')).toBe(true);
    expect(isRTL('fr')).toBe(false);
    expect(isRTL('en')).toBe(false);
  });

  it('interpolates {{count}} variables', async () => {
    const { translate } = await import('@/lib/i18n/core');
    expect(translate('fr', 'common.night', { count: 3 })).toContain('3');
  });
});
