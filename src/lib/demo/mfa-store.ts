/**
 * HOUSE-ZEN — Demo MFA store (TOTP simulation, DOCUMENTED demo-mode only).
 *
 * The production path delegates enrollment/challenges to Supabase Auth MFA
 * (TOTP verified server-side, HMAC-SHA1 per RFC 6238). In demo mode there is
 * no auth server, so this store:
 *   - persists factors in localStorage (UI convenience, non-authoritative),
 *   - derives the current 6-digit code from a documented SIMULATION hash
 *     (FNV-1a over secret + 30s time step) — displayed in the UI so the full
 *     enrollment/challenge UX can be exercised without a phone.
 * This code is dead in production (demoMode only) and never a silent fallback.
 */

import type { UUID } from '@/types/domain';

export interface DemoMfaFactor {
  id: UUID;
  user_id: UUID;
  friendly_name: string;
  secret: string;
  status: 'unverified' | 'verified';
  created_at: string;
}

const STORE_KEY = 'house-zen.demo-mfa';
const AAL2_KEY = 'house-zen.demo-aal2';

function readAll(): DemoMfaFactor[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as DemoMfaFactor[]) : [];
  } catch {
    return [];
  }
}

function writeAll(factors: DemoMfaFactor[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(factors));
  } catch {
    /* non-critical (private mode) */
  }
}

export const demoMfaStore = {
  listByUser(userId: UUID): DemoMfaFactor[] {
    return readAll().filter((f) => f.user_id === userId);
  },

  verifiedFactors(userId: UUID): DemoMfaFactor[] {
    return this.listByUser(userId).filter((f) => f.status === 'verified');
  },

  upsert(factor: DemoMfaFactor): void {
    const all = readAll().filter((f) => f.id !== factor.id);
    all.push(factor);
    writeAll(all);
  },

  remove(factorId: UUID): void {
    writeAll(readAll().filter((f) => f.id !== factorId));
  },

  /** Session flag: the current demo session passed a TOTP challenge. */
  markSessionAal2(): void {
    try {
      sessionStorage.setItem(AAL2_KEY, '1');
    } catch {
      /* non-critical */
    }
  },

  clearSessionAal2(): void {
    try {
      sessionStorage.removeItem(AAL2_KEY);
    } catch {
      /* non-critical */
    }
  },

  sessionIsAal2(): boolean {
    try {
      return sessionStorage.getItem(AAL2_KEY) === '1';
    } catch {
      return false;
    }
  },
};

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(length = 24): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += BASE32_ALPHABET[bytes[i]! % 32];
  }
  return out;
}

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Current 30s time step (same window as real TOTP). */
export function timeStep(now = Date.now()): number {
  return Math.floor(now / 30_000);
}

/**
 * SIMULATED 6-digit code for the demo factor (documented above).
 * NOT RFC 6238 — production verification happens in Supabase Auth.
 */
export function demoTotpCode(secret: string, step = timeStep()): string {
  const hash = fnv1a(`${secret}:${step}`);
  const code = hash % 1_000_000;
  return String(code).padStart(6, '0');
}

export function otpauthUrl(secret: string, email: string): string {
  return `otpauth://totp/HOUSE-ZEN:${encodeURIComponent(email)}?secret=${secret}&issuer=HOUSE-ZEN&algorithm=SHA1&digits=6&period=30`;
}
