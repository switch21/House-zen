/**
 * HOUSE-ZEN — MFA enrollment management (Settings → Security tab).
 * Production: Supabase Auth MFA TOTP (QR + server verification).
 * Demo: documented simulation with the code displayed inline.
 * Super admins are strongly encouraged (soft enforcement) to enroll.
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { useAuth } from '@/lib/auth/context';
import { getMfaApi } from '@/lib/auth/mfa';
import { useI18n } from '@/lib/i18n/provider';
import { isDemoMode } from '@/lib/api';

export function MfaSettings() {
  const { t } = useI18n();
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [enrolling, setEnrolling] = useState<{
    factorId: string;
    qrDataUrl?: string;
    secret?: string;
    otpauthUrl?: string;
  } | null>(null);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: factors, isLoading } = useQuery({
    queryKey: ['mfa', 'factors'],
    queryFn: () => getMfaApi().listFactors(),
  });

  const verified = (factors ?? []).filter((f) => f.status === 'verified');
  const mfaEnabled = verified.length > 0;

  async function startEnrollment() {
    setError(null);
    setMessage(null);
    try {
      const enrollment = await getMfaApi().enroll(session?.email ?? '');
      setEnrolling(enrollment);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
    }
  }

  async function confirmEnrollment() {
    if (!enrolling) return;
    setError(null);
    try {
      const ok = await getMfaApi().verifyEnrollment(enrolling.factorId, code);
      if (!ok) {
        setError(t('mfa.invalidCode'));
        return;
      }
      setEnrolling(null);
      setCode('');
      setMessage(t('mfa.enabled'));
      await queryClient.invalidateQueries({ queryKey: ['mfa', 'factors'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
    }
  }

  async function disable(factorId: string) {
    setError(null);
    try {
      await getMfaApi().unenroll(factorId);
      setMessage(t('mfa.disabled'));
      await queryClient.invalidateQueries({ queryKey: ['mfa', 'factors'] });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('errors.generic'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {mfaEnabled ? (
            <ShieldCheck size={16} className="text-success" />
          ) : (
            <ShieldAlert size={16} className="text-warning" />
          )}
          {t('mfa.title')}
        </CardTitle>
        <CardDescription>{t('mfa.settingsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant={mfaEnabled ? 'default' : 'secondary'}>
            {mfaEnabled ? t('mfa.statusOn') : t('mfa.statusOff')}
          </Badge>
          {session?.isSuperAdmin && !mfaEnabled ? (
            <span className="text-xs text-warning">{t('mfa.superAdminAdvice')}</span>
          ) : null}
        </div>

        {verified.map((f) => (
          <div
            key={f.id}
            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
          >
            <div>
              <p className="font-medium">{f.friendlyName || 'TOTP'}</p>
              <p className="text-xs text-muted-foreground">{t('mfa.statusOn')}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void disable(f.id)}>
              {t('mfa.unenroll')}
            </Button>
          </div>
        ))}

        {!mfaEnabled && !enrolling ? (
          <Button onClick={() => void startEnrollment()}>{t('mfa.enroll')}</Button>
        ) : null}

        {enrolling ? (
          <div className="space-y-3 rounded-md border p-3">
            <p className="text-sm font-medium">{t('mfa.scan')}</p>
            {enrolling.qrDataUrl ? (
              <img
                src={enrolling.qrDataUrl}
                alt="QR TOTP"
                className="h-44 w-44 rounded-md border bg-white p-1"
              />
            ) : null}
            {enrolling.secret ? (
              <div className="space-y-1">
                <Label htmlFor="mfa-secret">{t('mfa.secretLabel')}</Label>
                <code
                  id="mfa-secret"
                  className="block break-all rounded bg-muted px-2 py-1 font-mono text-xs"
                >
                  {enrolling.secret}
                </code>
              </div>
            ) : null}
            {enrolling.otpauthUrl ? (
              <a
                href={enrolling.otpauthUrl}
                className="block text-xs text-primary underline"
              >
                {t('mfa.otpauthLink')}
              </a>
            ) : null}
            <div className="flex max-w-xs items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="mfa-code">{t('mfa.codeLabel')}</Label>
                <Input
                  id="mfa-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                />
              </div>
              <Button onClick={() => void confirmEnrollment()} disabled={code.length !== 6}>
                {t('mfa.verify')}
              </Button>
            </div>
            {isDemoMode() ? (
              <p className="text-xs text-muted-foreground">{t('mfa.demoHint')}</p>
            ) : null}
          </div>
        ) : null}

        {message ? <p className="text-xs text-success">{message}</p> : null}
        {error ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {isLoading ? <p className="text-xs text-muted-foreground">{t('common.loading')}</p> : null}
      </CardContent>
    </Card>
  );
}
