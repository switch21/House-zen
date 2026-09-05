/**
 * HOUSE-ZEN — i18n coverage tests (PHASE 10, tightened at full-coverage pass).
 * fr = 100% base. Every official locale must now fully mirror fr — no silent
 * fallbacks, no blank values. Fallback chain stays as a runtime safety net.
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

  it('every locale fully mirrors fr (100% coverage, no empty values)', () => {
    for (const locale of ['es', 'de', 'ar', 'it', 'sw'] as const) {
      const { missing, ratio } = coverage(locale, FR_KEYS);
      expect(missing, `${locale} missing: ${missing.join(', ')}`).toHaveLength(0);
      expect(ratio, `${locale} coverage`).toBe(1);
      for (const key of FR_KEYS) {
        expect(String(allTranslations[locale][key]).length, `${locale}:${key}`).toBeGreaterThan(0);
      }
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
