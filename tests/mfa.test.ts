/**
 * HOUSE-ZEN — MFA flow tests (demo simulation of the Supabase Auth TOTP path).
 * Covers: enrollment (unverified factor), wrong-code rejection, enrollment
 * confirmation, pendingMfa session gating (AAL1 → AAL2), challenge verify and
 * unenroll. Mirrors exactly what Supabase Auth MFA enforces server-side.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoDataApi } from '@/lib/demo/api';
import { buildSeed } from '@/lib/demo/store';
import { demoMfaStore, demoTotpCode } from '@/lib/demo/mfa-store';
import { getMfaApi, resetMfaApi } from '@/lib/auth/mfa';

/** Minimal Web Storage stub — the demo MFA store persists through it. */
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

describe('MFA (TOTP) demo flow', () => {
  let api: DemoDataApi;

  beforeEach(async () => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    vi.stubGlobal('sessionStorage', new MemoryStorage());
    resetMfaApi();
    api = new DemoDataApi(buildSeed());
    await api.signIn('owner@demo.house-zen.app', 'demo1234');
  });

  it('enrolls an unverified TOTP factor with secret and otpauth URL', async () => {
    const enrollment = await getMfaApi().enroll('owner@demo.house-zen.app');
    expect(enrollment.factorId).toBeTruthy();
    expect(enrollment.secret).toMatch(/^[A-Z2-7]{24}$/);
    expect(enrollment.otpauthUrl).toContain('otpauth://totp/HOUSE-ZEN:');
    expect(enrollment.otpauthUrl).toContain(`secret=${enrollment.secret}`);
    const factors = await getMfaApi().listFactors();
    expect(factors).toHaveLength(1);
    expect(factors[0]!.status).toBe('unverified');
  });

  it('rejects a wrong code during enrollment, accepts the simulated one', async () => {
    const enrollment = await getMfaApi().enroll('owner@demo.house-zen.app');
    const right = demoTotpCode(enrollment.secret!);
    const wrong = right === '000000' ? '000001' : '000000';
    expect(await getMfaApi().verifyEnrollment(enrollment.factorId, wrong)).toBe(false);
    expect(await getMfaApi().verifyEnrollment(enrollment.factorId, right)).toBe(true);
    const factors = await getMfaApi().listFactors();
    expect(factors[0]!.status).toBe('verified');
  });

  it('a verified factor makes a FRESH session pending MFA (AAL1) until challenge', async () => {
    const enrollment = await getMfaApi().enroll('owner@demo.house-zen.app');
    await getMfaApi().verifyEnrollment(
      enrollment.factorId,
      demoTotpCode(enrollment.secret!),
    );
    // Prod parity: the enrollment confirmation itself returns an AAL2 session —
    // pendingMfa only applies to the NEXT login (fresh AAL1 session).
    expect((await api.getSession())?.pendingMfa).toBe(false);
    expect((await getMfaApi().aal()).current).toBe('aal2');
    demoMfaStore.clearSessionAal2(); // simulate the next login
    const fresh = await api.getSession();
    expect(fresh?.pendingMfa).toBe(true);
  });

  it('challenge verify upgrades to AAL2 and clears pendingMfa', async () => {
    const mfa = getMfaApi();
    const enrollment = await mfa.enroll('owner@demo.house-zen.app');
    await mfa.verifyEnrollment(enrollment.factorId, demoTotpCode(enrollment.secret!));
    demoMfaStore.clearSessionAal2(); // simulate a fresh AAL1 login session
    expect((await mfa.aal()).current).toBe('aal1');
    const challengeId = await mfa.createChallenge(enrollment.factorId);
    const right = demoTotpCode(enrollment.secret!);
    const wrong = right === '123456' ? '123457' : '123456';
    expect(await mfa.verifyChallenge(enrollment.factorId, challengeId, wrong)).toBe(false);
    expect(await mfa.verifyChallenge(enrollment.factorId, challengeId, right)).toBe(true);
    const levels = await mfa.aal();
    expect(levels.current).toBe('aal2');
    expect(levels.max).toBe('aal2');
    expect((await api.getSession())?.pendingMfa).toBe(false);
  });

  it('unenrolling the last factor returns the session to plain AAL1', async () => {
    const mfa = getMfaApi();
    const enrollment = await mfa.enroll('owner@demo.house-zen.app');
    await mfa.verifyEnrollment(enrollment.factorId, demoTotpCode(enrollment.secret!));
    await mfa.unenroll(enrollment.factorId);
    expect(await mfa.listFactors()).toHaveLength(0);
    expect((await api.getSession())?.pendingMfa ?? false).toBe(false);
  });

  it('store hygiene: verifiedFactors filters by user and status', async () => {
    const enrollment = await getMfaApi().enroll('owner@demo.house-zen.app');
    const userId = api.getStore().sessions.get('current')?.id;
    expect(userId).toBeTruthy();
    expect(demoMfaStore.verifiedFactors(userId!)).toHaveLength(0);
    await getMfaApi().verifyEnrollment(enrollment.factorId, demoTotpCode(enrollment.secret!));
    expect(demoMfaStore.verifiedFactors(userId!)).toHaveLength(1);
  });
});
