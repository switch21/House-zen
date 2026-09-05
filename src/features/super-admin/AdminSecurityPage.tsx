/**
 * HOUSE-ZEN — Gestion MFA du back-office plateforme (route /admin/security).
 * Même composant que Paramètres ▸ Sécurité : les super admins plateforme pure
 * n'ont aucun accès /app — cette route est leur surface de gestion des facteurs.
 */

import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/layout/shared';
import { MfaSettings } from '@/features/settings/MfaSettings';
import { useI18n } from '@/lib/i18n/provider';

export default function AdminSecurityPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <PageHeader
        title={t('admin.mfaGate.securityTitle')}
        description={t('admin.mfaGate.securitySubtitle')}
        actions={<ShieldCheck size={20} className="text-primary" />}
      />
      <MfaSettings />
    </div>
  );
}
