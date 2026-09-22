/**
 * HOUSE-ZEN — Plan-quota error pipeline (spec PHASE 12).
 *
 * Postgres (migration 064 triggers / hz_assert_quota) raises:
 *   `QUOTA_EXCEEDED: <kind> limit reached (<limit>) [plan <CODE>]`
 * The demo adapter throws DomainError('QUOTA_EXCEEDED') with the SAME
 * canonical message, so one parser serves both adapters. UI layers convert
 * violations into localized messages; anything else passes through raw.
 */

import { DomainError } from '@/types/domain';

export type QuotaKind = 'properties' | 'rooms' | 'users';

export interface QuotaViolation {
  kind: QuotaKind;
  limit: number | null;
  plan: string | null;
}

const QUOTA_RE =
  /QUOTA_EXCEEDED:\s*(properties|rooms|users)\s+limit reached\s+\((\d+)\)(?:\s+\[plan\s+([A-Za-z0-9_-]+)\])?/;

/** Parse a canonical quota violation message — null when not a quota error. */
export function parseQuotaViolation(raw: string): QuotaViolation | null {
  const m = QUOTA_RE.exec(raw);
  if (!m) return null;
  return {
    kind: m[1] as QuotaKind,
    limit: m[2] ? Number(m[2]) : null,
    plan: m[3] ?? null,
  };
}

/** Build the canonical DomainError for a violation (adapters throw this). */
export function quotaDomainError(kind: QuotaKind, limit: number | null, plan: string | null): DomainError {
  return new DomainError(
    'QUOTA_EXCEEDED',
    `QUOTA_EXCEEDED: ${kind} limit reached (${limit ?? '?'}) [plan ${plan ?? '?'}]`,
  );
}

/** True when the raw message is any QUOTA_EXCEEDED flavor (incl. plan-change guard). */
export function isAnyQuotaMessage(raw: string): boolean {
  return raw.includes('QUOTA_EXCEEDED');
}

export type QuotaTranslator = (key: string, vars?: Record<string, string | number>) => string;

/** Localized, human message for any error — quota violations are translated,
 *  everything else falls back to the raw message (minus the Error: prefix). */
export function friendlyErrorMessage(e: unknown, t: QuotaTranslator): string {
  const raw = (e instanceof Error ? e.message : String(e)).replace(/^Error:\s*/, '');
  const v = parseQuotaViolation(raw);
  if (v) return t(`errors.quota.${v.kind}`, { limit: v.limit ?? 0, plan: v.plan ?? '—' });
  if (isAnyQuotaMessage(raw)) return t('errors.quota');
  return raw;
}
