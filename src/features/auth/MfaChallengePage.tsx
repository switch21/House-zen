/**
 * HOUSE-ZEN — MFA challenge page (/mfa-challenge).
 * Reached when an authenticated session sits at AAL1 while a verified TOTP
 * factor exists. Verifying upgrades the session to AAL2 and unlocks the app.
 * Demo mode displays the simulated code so the flow is fully demonstrable.
 */

import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Hotel, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { useAuth } from '@/lib/auth/context';
import { getMfaApi } from '@/lib/auth/mfa';
import { useI18n } from '@/lib/i18n/provider';
import { isDemoMode } from '@/lib/api';

export default function MfaChallengePage() {
  const { t } = useI18n();
  const { session, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [simulatedCode, setSimulatedCode] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from ?? '/app/dashboard';

  // If nothing is pending, leave immediately (direct URL access).
  useEffect(() => {
    if (session && !session.pendingMfa) navigate(from, { replace: true });
  }, [session, from, navigate]);

  // Demo mode: surface the simulated TOTP code (documented simulation).
  useEffect(() => {
    if (!isDemoMode()) return;
    const api = getMfaApi();
    const tick = () => {
      try {
        const sim = api as unknown as { currentSimulatedCode(): string };
        setSimulatedCode(sim.currentSimulatedCode());
      } catch {
        setSimulatedCode(null);
      }
    };
    tick();
    const interval = setInterval(tick, 5_000);
    return () => clearInterval(interval);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const mfa = getMfaApi();
      const factors = await mfa.listFactors();
      const factor = factors.find((f) => f.status === 'verified');
      if (!factor) throw new Error(t('mfa.noFactor'));
      const challengeId = await mfa.createChallenge(factor.id);
      const ok = await mfa.verifyChallenge(factor.id, challengeId, code);
      if (!ok) {
        setError(t('mfa.invalidCode'));
        return;
      }
      await refresh();
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/60 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow">
            <Hotel size={22} />
          </div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <ShieldCheck size={20} className="text-primary" />
            {t('mfa.challengeTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('mfa.challengeDesc')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('mfa.title')}</CardTitle>
            <CardDescription>{session?.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="totp">{t('mfa.codeLabel')}</Label>
                <Input
                  id="totp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className="text-center text-lg tracking-[0.4em]"
                  autoFocus
                />
              </div>
              {isDemoMode() && simulatedCode ? (
                <p className="rounded-md bg-warning/15 px-3 py-2 text-xs text-warning-foreground">
                  {t('mfa.simulatedCode')} : <strong className="font-mono">{simulatedCode}</strong>
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={busy || code.length !== 6}>
                {busy ? t('common.loading') : t('mfa.verify')}
              </Button>
            </form>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate('/login', { replace: true });
              }}
              className="mt-4 w-full text-center text-xs text-muted-foreground underline"
            >
              {t('nav.logout')}
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
