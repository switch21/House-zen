/**
 * HOUSE-ZEN — Team: memberships & roles (RBAC, spec §6).
 */

import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/misc';
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEntityList } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/lib/auth/context';
import { getDataApi } from '@/lib/api';
import type { UUID, UserRole } from '@/types/domain';

const ROLES: UserRole[] = ['owner', 'manager', 'receptionist', 'accountant', 'housekeeping', 'maintenance'];

export default function TeamPage() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const qc = useQueryClient();
  const { data: memberships, isLoading } = useEntityList<Record<string, unknown>>('memberships', { pageSize: 100 });

  const writeAllowed = session?.role === 'owner';

  async function changeRole(id: UUID, role: string) {
    await getDataApi().update('memberships', id, { role });
    void qc.invalidateQueries({ queryKey: ['hz', 'memberships'] });
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t('team.title')} description={`${memberships?.items.length ?? 0} ${t('subscription.users').toLowerCase()}`} />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : !memberships || memberships.items.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('common.empty')} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('team.role')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberships.items.map((m) => (
                  <TableRow key={String(m.id)}>
                    <TableCell className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold">
                        {String(m.user_id).slice(0, 2).toUpperCase()}
                      </span>
                      <span className="font-mono text-xs">{String(m.user_id)}</span>
                    </TableCell>
                    <TableCell>
                      {writeAllowed ? (
                        <UiSelect value={String(m.role)} onValueChange={(v) => void changeRole(String(m.id), v)}>
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
                        <Badge variant="secondary">{t(`role.${String(m.role)}`)}</Badge>
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
