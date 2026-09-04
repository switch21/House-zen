/**
 * HOUSE-ZEN — Audit log (spec §30): who/what/when/where/before/after.
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/misc';
import { useEntityList } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { formatDateTime } from '@/lib/utils/money-dates';

export default function AuditPage() {
  const { t, locale } = useTranslation();
  const [search, setSearch] = useState('');
  const { data, isLoading } = useEntityList<Record<string, unknown>>('audit_logs', {
    search: search || undefined,
    sort: { created_at: 'desc' },
    pageSize: 100,
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
          />
        }
      />
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : !data || data.items.length === 0 ? (
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
                {data.items.map((log) => (
                  <TableRow key={String(log.id)}>
                    <TableCell className="whitespace-nowrap text-xs">
                      {formatDateTime(String(log.created_at), undefined, locale)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{String(log.action)}</TableCell>
                    <TableCell className="text-xs">
                      {String(log.entity)}
                      {log.entity_id ? <span className="text-muted-foreground"> · {String(log.entity_id).slice(0, 8)}</span> : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{String(log.actor_id ?? '—').slice(0, 8)}</TableCell>
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
