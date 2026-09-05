/**
 * HOUSE-ZEN — Porte MFA du back-office plateforme (migration 060).
 * Affichée par RequireSuperAdmin quand la session n'est pas encore AAL2 :
 * l'opérateur doit activer (ou vérifier) la double authentification avant
 * d'accéder aux fonctions d'administration. Le sondage AAL laisse passer
 * dès que la session est montée à aal2 (enrôlement vérifié ou défi complété).
 */

import { useEffect, useRef } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/shared';
import { MfaSettings } from '@/features/settings/MfaSettings';
import { getMfaApi } from '@/lib/auth/mfa';
import { useI18n } from '@/lib/i18n/provider';

export default function AdminMfaGate({ onSatisfied }: { onSatisfied: () => void }) {
  const { t } = useI18n();
  const satisfiedRef = useRef(onSatisfied);
  satisfiedRef.current = onSatisfied;

  useEffect(() => {
    const check = async () => {
      try {
        const r = await getMfaApi().aal();
        if (r.current === 'aal2') satisfiedRef.current();
      } catch {
        /* transient — next tick retries */
      }
    };
    void check();
    const id = setInterval(check, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-4 py-2">
      <PageHeader
        title={t('admin.mfaGate.title')}
        description={t('admin.mfaGate.subtitle')}
        actions={<ShieldCheck size={20} className="text-primary" />}
      />
      <Card>
        <CardContent className="text-sm leading-relaxed text-muted-foreground">
          {t('admin.mfaGate.explanation')}
        </CardContent>
      </Card>
      <MfaSettings />
    </div>
  );
}
