/**
 * HOUSE-ZEN — Money & date rule tests (spec §8/§10).
 */

import { describe, expect, it } from 'vitest';
import {
  addMoney, isValidDateRange, mulMoney, nightsBetween, percentOf,
  rangesOverlap, roundMoney, subMoney,
} from '@/lib/utils/money-dates';

describe('money', () => {
  it('rounds half-up cent-safe', () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(-1.005)).toBe(-1.01);
  });

  it('avoids float drift on sums', () => {
    // naive: 0.1 + 0.2 = 0.30000000000000004
    expect(addMoney(0.1, 0.2)).toBe(0.3);
  });

  it('computes multiplication and percentages', () => {
    expect(mulMoney(35000, 3)).toBe(105000);
    expect(percentOf(10000, 19.25)).toBe(1925);
    expect(subMoney(1000, 250.5)).toBe(749.5);
  });
});

describe('dates & overlap rule (spec §10)', () => {
  it('counts nights between dates', () => {
    expect(nightsBetween('2026-01-01', '2026-01-05')).toBe(4);
    expect(nightsBetween('2026-01-01', '2026-01-02')).toBe(1);
  });

  it('rejects invalid ranges', () => {
    expect(isValidDateRange('2026-01-05', '2026-01-05')).toBe(false);
    expect(isValidDateRange('2026-01-05', '2026-01-01')).toBe(false);
    expect(isValidDateRange('2026-01-01', '2026-01-05')).toBe(true);
  });

  it('applies the exact intersection rule', () => {
    // new_check_in < existing_check_out AND new_check_out > existing_check_in
    expect(rangesOverlap('2026-01-01', '2026-01-04', '2026-01-03', '2026-01-06')).toBe(true);
    expect(rangesOverlap('2026-01-01', '2026-01-04', '2026-01-04', '2026-01-06')).toBe(false); // touch = OK
    expect(rangesOverlap('2026-01-01', '2026-01-04', '2025-12-28', '2026-01-01')).toBe(false); // touch = OK
    expect(rangesOverlap('2026-01-01', '2026-01-10', '2026-01-02', '2026-01-03')).toBe(true);  // inside
  });
});
