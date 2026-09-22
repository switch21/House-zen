/**
 * HOUSE-ZEN — Audit log (spec §30): who/what/when/where/before/after.
 * Readability contract: raw codes never reach the screen. Actions render as
 * localized labels (audit.log.* curated + verb fallback), entities as
 * localized names with the business reference resolved server-side
 * (hz_audit_feed, migration 067), actors as names — never UUIDs.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/misc';
import { getDataApi } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { formatDateTime } from '@/lib/utils/money-dates';
import { auditActionLabel, auditEntityLabel } from '@/lib/utils/audit';

export default function AuditPage() {
  const { t, locale } = useTranslation();
  const [search, setSearch] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['hz', 'audit_feed', search],
    queryFn: () => getDataApi().auditFeed(search),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('audit.title')}
        actions={
          <Input
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-56"
            aria-label={t('common.search')}
          />
        }
      />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : !data || data.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('common.empty')} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('audit.when')}</TableHead>
                  <TableHead>{t('audit.action')}</TableHead>
                  <TableHead>{t('audit.entity')}</TableHead>
                  <TableHead>{t('audit.actor')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDateTime(log.created_at, undefined, locale)}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      {auditActionLabel(log.action, t)}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-medium">{auditEntityLabel(log.entity, t)}</span>
                      {log.ref ? (
                        <span className="text-muted-foreground"> · {log.ref}</span>
                      ) : log.entity_id ? (
                        <span className="text-muted-foreground"> · {log.entity_id.slice(0, 8)}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {log.actor_name ? (
                        <span>
                          {log.actor_name}
                          {log.actor_email ? (
                            <span className="text-muted-foreground"> · {log.actor_email}</span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t('audit.system')}</span>
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
