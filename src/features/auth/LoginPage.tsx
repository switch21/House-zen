import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Hotel } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/input';
import { useAuth } from '@/lib/auth/context';
import { useI18n } from '@/lib/i18n/provider';
import { getDataApi, isDemoMode } from '@/lib/api';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
type FormValues = z.infer<typeof schema>;

const DEMO_ACCOUNTS = [
  { email: 'owner@demo.house-zen.app', role: 'owner' },
  { email: 'manager@demo.house-zen.app', role: 'manager' },
  { email: 'reception@demo.house-zen.app', role: 'receptionist' },
  { email: 'compta@demo.house-zen.app', role: 'accountant' },
  { email: 'menage@demo.house-zen.app', role: 'housekeeping' },
  { email: 'tech@demo.house-zen.app', role: 'maintenance' },
  { email: 'admin@house-zen.app', role: 'super_admin' },
];

export default function LoginPage() {
  const { t } = useI18n();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: 'owner@demo.house-zen.app', password: 'demo1234' } });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const session = await getDataApi().signIn(values.email, values.password);
      await refresh();
      // AAL1 + verified factor → TOTP challenge before entering the app.
      navigate(session.pendingMfa ? '/mfa-challenge' : '/app/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('auth.invalidCredentials'));
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/60 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow">
            <Hotel size={22} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{t('auth.signInTitle')}</h1>
          <p className="text-sm text-muted-foreground">{t('auth.signInSubtitle')}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('auth.signIn')}</CardTitle>
            {isDemoMode() ? (
              <CardDescription>
                {t('common.demoTitle')} — {t('auth.demoAccounts')} (mot de passe : demo1234)
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">{t('common.email')}</Label>
                <Input id="email" type="email" autoComplete="email" placeholder={t('auth.emailPlaceholder')} {...register('email')} />
                {errors.email ? <p className="text-xs text-destructive">{errors.email.message}</p> : null}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Input id="password" type="password" autoComplete="current-password" {...register('password')} />
                {errors.password ? <p className="text-xs text-destructive">{errors.password.message}</p> : null}
              </div>
              {error ? (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  {error}
                </p>
              ) : null}
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? t('common.loading') : t('auth.signIn')}
              </Button>
            </form>

            {isDemoMode() ? (
              <div className="mt-4 border-t pt-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">{t('auth.demoAccounts')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button
                      key={a.email}
                      type="button"
                      onClick={() => {
                        setValue('email', a.email);
                        setValue('password', 'demo1234');
                      }}
                      className="rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-accent"
                    >
                      {a.role}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} HOUSE-ZEN — <a className="underline" href="/book/zen-palace-douala">{t('booking.title')}</a>
        </p>
      </div>
    </div>
  );
}
