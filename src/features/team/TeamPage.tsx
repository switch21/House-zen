/**
 * HOUSE-ZEN — Team: memberships & roles (RBAC, spec §6).
 * Names/emails come from `teamDirectory()` (SECURITY DEFINER RPC in real
 * mode, demo user directory in demo mode) — profiles RLS only exposes the
 * caller's own row, which previously left the table showing raw user UUIDs.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/misc';
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEntityMutations } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/lib/auth/context';
import { getDataApi } from '@/lib/api';
import type { UUID, UserRole } from '@/types/domain';

const ROLES: UserRole[] = ['owner', 'manager', 'receptionist', 'accountant', 'housekeeping', 'maintenance'];

function initials(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/[\s._@-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? '?').concat(parts[1]?.[0] ?? '').toUpperCase();
}

export default function TeamPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const qc = useQueryClient();

  const { data: team, isLoading } = useQuery({
    queryKey: ['hz', 'team_directory'],
    queryFn: () => getDataApi().teamDirectory(),
  });

  const { update } = useEntityMutations('memberships');
  const writeAllowed = session?.role === 'owner';

  async function changeRole(membershipId: UUID, role: string) {
    await update.mutateAsync({ id: membershipId, data: { role } });
    void qc.invalidateQueries({ queryKey: ['hz', 'team_directory'] });
  }

  const members = team ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title={t('team.title')} description={`${members.length} ${t('subscription.users').toLowerCase()}`} />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : members.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('common.empty')} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('common.email')}</TableHead>
                  <TableHead>{t('team.role')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.membership_id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold">
                          {initials(m.full_name, m.email)}
                        </span>
                        <span className="font-medium">{m.full_name || m.email}</span>
                        {m.user_id === session?.userId ? (
                          <Badge variant="outline">{t('team.you')}</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.email}</TableCell>
                    <TableCell>
                      {writeAllowed && m.role !== 'owner' ? (
                        <UiSelect value={m.role} onValueChange={(v) => void changeRole(m.membership_id, v)}>
                          <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r}>
                                {t(`role.${r}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </UiSelect>
                      ) : (
                        <Badge variant="secondary">{t(`role.${m.role}`)}</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
