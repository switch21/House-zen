/**
 * HOUSE-ZEN — MFA (TOTP) contract + implementations.
 *
 *  - Production: Supabase Auth MFA (server-verified TOTP, RFC 6238,
 *    AAL levels). Enrollment factors, challenges and verification never
 *    touch our frontend code paths for trust decisions — the JWT `aal`
 *    claim is the authority and PostgreSQL policies can require `aal2`.
 *  - Demo mode: documented simulation (demoMfaStore) exercising the exact
 *    same UX flow without an auth server.
 *
 * The MFA layer is intentionally OUTSIDE DataApi: it is an auth-domain
 * concern, consumed by the settings page and the /mfa-challenge route only.
 */

import { config } from '@/lib/config/env';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  demoMfaStore,
  demoTotpCode,
  generateBase32Secret,
  otpauthUrl,
} from '@/lib/demo/mfa-store';
import type { UUID } from '@/types/domain';

export interface MfaFactor {
  id: UUID;
  friendlyName: string;
  status: 'unverified' | 'verified';
}

export interface MfaEnrollment {
  factorId: UUID;
  /** Data-URL QR code image (rendered in the enrollment dialog). */
  qrDataUrl?: string;
  secret?: string;
  otpauthUrl?: string;
}

export interface AalLevels {
  current: 'aal1' | 'aal2';
  max: 'aal1' | 'aal2';
}

export interface MfaApi {
  listFactors(): Promise<MfaFactor[]>;
  /** Creates an unverified TOTP factor; returns QR/secret for the user. */
  enroll(email: string): Promise<MfaEnrollment>;
  /** Confirms enrollment with the first code from the authenticator app. */
  verifyEnrollment(factorId: UUID, code: string): Promise<boolean>;
  /** Starts a login challenge for an already-verified factor. */
  createChallenge(factorId: UUID): Promise<string>;
  verifyChallenge(factorId: UUID, challengeId: string, code: string): Promise<boolean>;
  unenroll(factorId: UUID): Promise<void>;
  aal(): Promise<AalLevels>;
}

/* ============================ Demo implementation ============================ */

class DemoMfaApi implements MfaApi {
  private userId(): UUID {
    // The challenge page runs with an aal1 session; settings run with a full
    // session. Both go through the auth context, so we read the demo session.
    try {
      const uid = sessionStorage.getItem('house-zen.demo-session');
      if (!uid) throw new Error('no demo session');
      return uid;
    } catch {
      throw new Error('MFA requires an authenticated demo session');
    }
  }

  async listFactors(): Promise<MfaFactor[]> {
    return demoMfaStore
      .listByUser(this.userId())
      .map((f) => ({ id: f.id, friendlyName: f.friendly_name, status: f.status }));
  }

  async enroll(email: string): Promise<MfaEnrollment> {
    const secret = generateBase32Secret();
    const id = `mfa-${crypto.randomUUID()}`;
    demoMfaStore.upsert({
      id,
      user_id: this.userId(),
      friendly_name: email,
      secret,
      status: 'unverified',
      created_at: new Date().toISOString(),
    });
    const url = otpauthUrl(secret, email);
    const qrDataUrl = await this.qrDataUrl(url);
    return { factorId: id, secret, otpauthUrl: url, qrDataUrl };
  }

  /** QR generation via dynamic import — keeps the demo bundle lean. */
  private async qrDataUrl(text: string): Promise<string | undefined> {
    try {
      const mod = (await import('qrcode')) as { toDataURL(t: string): Promise<string> };
      return await mod.toDataURL(text);
    } catch {
      return undefined;
    }
  }

  async verifyEnrollment(factorId: UUID, code: string): Promise<boolean> {
    const factor = demoMfaStore.listByUser(this.userId()).find((f) => f.id === factorId);
    if (!factor) throw new Error('Facteur introuvable');
    const expected = demoTotpCode(factor.secret);
    if (code.trim() !== expected) return false;
    demoMfaStore.upsert({ ...factor, status: 'verified' });
    return true;
  }

  async createChallenge(factorId: UUID): Promise<string> {
    const factor = demoMfaStore.listByUser(this.userId()).find((f) => f.id === factorId);
    if (!factor || factor.status !== 'verified') throw new Error('Facteur non vérifié');
    return `challenge-${factorId}`;
  }

  async verifyChallenge(factorId: UUID, _challengeId: string, code: string): Promise<boolean> {
    const factor = demoMfaStore.listByUser(this.userId()).find((f) => f.id === factorId);
    if (!factor) throw new Error('Facteur introuvable');
    if (code.trim() !== demoTotpCode(factor.secret)) return false;
    demoMfaStore.markSessionAal2();
    return true;
  }

  async unenroll(factorId: UUID): Promise<void> {
    demoMfaStore.remove(factorId);
    if (demoMfaStore.verifiedFactors(this.userId()).length === 0) {
      demoMfaStore.clearSessionAal2();
    }
  }

  async aal(): Promise<AalLevels> {
    const hasVerified = demoMfaStore.verifiedFactors(this.userId()).length > 0;
    const current = hasVerified && demoMfaStore.sessionIsAal2() ? 'aal2' : 'aal1';
    return { current, max: hasVerified ? 'aal2' : 'aal1' };
  }

  /** UI helper for demo mode: the simulated code to type. */
  currentSimulatedCode(): string {
    const factor = demoMfaStore.listByUser(this.userId()).find((f) => f.status === 'verified')
      ?? demoMfaStore.listByUser(this.userId()).find((f) => f.status === 'unverified');
    return factor ? demoTotpCode(factor.secret) : '';
  }
}

/* ========================= Supabase implementation ========================= */

class SupabaseMfaApi implements MfaApi {
  async listFactors(): Promise<MfaFactor[]> {
    const sb = getSupabaseClient();
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) throw new Error(error.message);
    return (data.totp ?? []).map((f) => ({
      id: f.id,
      friendlyName: f.friendly_name ?? 'TOTP',
      status: f.status === 'verified' ? 'verified' : 'unverified',
    }));
  }

  async enroll(email: string): Promise<MfaEnrollment> {
    const sb = getSupabaseClient();
    const { data, error } = await sb.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: email,
    });
    if (error) throw new Error(error.message);
    const qrDataUrl = data.totp?.qr_code
      ? `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(data.totp.qr_code)))}`
      : undefined;
    return {
      factorId: data.id,
      qrDataUrl,
      secret: data.totp?.secret,
      otpauthUrl: data.totp?.uri,
    };
  }

  async verifyEnrollment(factorId: UUID, code: string): Promise<boolean> {
    const sb = getSupabaseClient();
    const challenge = await sb.auth.mfa.challenge({ factorId });
    if (challenge.error) throw new Error(challenge.error.message);
    const { error } = await sb.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code,
    });
    return !error;
  }

  async createChallenge(factorId: UUID): Promise<string> {
    const sb = getSupabaseClient();
    const { data, error } = await sb.auth.mfa.challenge({ factorId });
    if (error) throw new Error(error.message);
    return data.id;
  }

  async verifyChallenge(factorId: UUID, challengeId: string, code: string): Promise<boolean> {
    const sb = getSupabaseClient();
    const { error } = await sb.auth.mfa.verify({ factorId, challengeId, code });
    if (error) return false;
    // Refresh so the JWT carries aal2 immediately.
    await sb.auth.refreshSession();
    return true;
  }

  async unenroll(factorId: UUID): Promise<void> {
    const sb = getSupabaseClient();
    const { error } = await sb.auth.mfa.unenroll({ factorId });
    if (error) throw new Error(error.message);
  }

  async aal(): Promise<AalLevels> {
    const sb = getSupabaseClient();
    const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    const current = (data?.currentLevel ?? 'aal1') as 'aal1' | 'aal2';
    const max = (data?.nextLevel ?? 'aal1') as 'aal1' | 'aal2';
    return { current, max };
  }
}

/* ============================== Factory ============================== */

let cached: MfaApi | null = null;

export function getMfaApi(): MfaApi {
  if (cached) return cached;
  if (config.demoMode || !isSupabaseConfigured()) {
    cached = new DemoMfaApi();
  } else {
    cached = new SupabaseMfaApi();
  }
  return cached;
}

/** Test seam + logout hygiene. */
export function resetMfaApi(): void {
  cached = null;
}

export type { DemoMfaApi };
