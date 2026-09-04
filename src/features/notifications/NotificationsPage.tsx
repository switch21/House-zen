/**
 * HOUSE-ZEN — Notifications center (PHASE 9, IN_APP channel).
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/misc';
import { PageHeader } from '@/components/layout/shared';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi } from '@/lib/api';
import { formatDateTime } from '@/lib/utils/money-dates';
import { cn } from '@/lib/utils';
import type { Notification } from '@/types/domain';

export default function NotificationsPage() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['hz', 'notifications', 'mine'],
    queryFn: () => getDataApi().listMyNotifications(),
  });

  const markAll = useMutation({
    mutationFn: () => getDataApi().markAllNotificationsRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hz', 'notifications'] }),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => getDataApi().markNotificationRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hz', 'notifications'] }),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('notifications.title')}
        actions={
          <Button variant="outline" onClick={() => markAll.mutate()}>
            <CheckCheck size={15} /> {t('notifications.markAllRead')}
          </Button>
        }
      />
      <Card>
        <CardContent className="p-2">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : !data || data.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('notifications.empty')} />
            </div>
          ) : (
            <ul className="space-y-1">
              {(data as Notification[]).map((n) => (
                <li
                  key={n.id}
                  className={cn(
                    'flex items-start gap-3 rounded-lg p-3 transition-colors',
                    n.read_at ? 'opacity-60' : 'bg-primary/5',
                  )}
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Bell size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground/60">
                      {n.event_key} · {formatDateTime(n.created_at, undefined, locale)}
                    </p>
                  </div>
                  {!n.read_at ? (
                    <Button size="sm" variant="ghost" onClick={() => markOne.mutate(n.id)}>
                      ✓
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
