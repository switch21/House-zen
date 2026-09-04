/**
 * HOUSE-ZEN — Maintenance (spec §13): tickets with controlled workflow.
 * Resolving the last open ticket is required before a room returns OPERATIONAL.
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/misc';
import { PageHeader, StatusBadge } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEntityList, useEntityMutations } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi } from '@/lib/api';
import { formatDateTime } from '@/lib/utils/money-dates';
import type { UUID } from '@/types/domain';

const TICKET_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' }> = {
  OPEN: { label: 'OPEN', variant: 'warning' },
  IN_PROGRESS: { label: 'IN_PROGRESS', variant: 'default' },
  RESOLVED: { label: 'RESOLVED', variant: 'success' },
  CLOSED: { label: 'CLOSED', variant: 'secondary' },
};

export default function MaintenancePage() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ room_id: '', title: '', description: '', priority: 'NORMAL' });
  const { data: tickets, isLoading } = useEntityList<Record<string, unknown>>('maintenance_tickets', {
    sort: { created_at: 'desc' },
    pageSize: 200,
  });
  const { data: rooms } = useEntityList<Record<string, unknown>>('rooms', { pageSize: 500 });
  const { create, update } = useEntityMutations('maintenance_tickets');

  const roomsById = new Map((rooms?.items ?? []).map((r) => [String(r.id), r]));

  const refresh = () => {
    ['maintenance_tickets', 'rooms', 'maintenance_logs', 'audit_logs'].forEach((e) =>
      qc.invalidateQueries({ queryKey: ['hz', e] }),
    );
  };

  const advance = useMutation({
    mutationFn: async ({ id, to, room }: { id: UUID; to: string; room?: string }) => {
      await update.mutateAsync({
        id,
        data: to === 'RESOLVED' ? { status: to, resolved_at: new Date().toISOString() } : { status: to },
      });
      // Ticket creation takes the room offline; resolution restores it (via machine).
      if (room && to === 'RESOLVED') {
        await getDataApi().setRoomOperationalStatus(room, 'OPERATIONAL');
      }
    },
    onSuccess: refresh,
  });

  async function createTicket() {
    try {
      const created = await create.mutateAsync({ ...draft, status: 'OPEN' });
      const room = String(created.room_id);
      await getDataApi().setRoomOperationalStatus(room, 'UNDER_MAINTENANCE');
      setOpen(false);
      refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('common.error'));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('maintenance.title')}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> {t('maintenance.createTicket')}
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : !tickets || tickets.items.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('common.empty')} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('reservations.room')}</TableHead>
                  <TableHead>{t('housekeeping.priority')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.items.map((tk) => {
                  const room = roomsById.get(String(tk.room_id));
                  const status = String(tk.status);
                  return (
                    <TableRow key={String(tk.id)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Wrench size={14} className="text-muted-foreground" />
                          <span className="font-medium">{String(tk.title)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {String(room?.room_number ?? '—')}
                        {String(room?.status) === 'UNDER_MAINTENANCE' ? (
                          <span className="ms-2 rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                            {t('roomStatus.UNDER_MAINTENANCE')}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>{t(`priority.${String(tk.priority)}`)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={status}
                          map={Object.fromEntries(
                            Object.entries(TICKET_MAP).map(([k, v]) => [k, { ...v, label: t(`ticketStatus.${k}`) }]),
                          )}
                        />
                      </TableCell>
                      <TableCell>{formatDateTime(String(tk.created_at), undefined, locale)}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          {status === 'OPEN' ? (
                            <Button size="sm" variant="outline" onClick={() => advance.mutate({ id: String(tk.id), to: 'IN_PROGRESS' })}>
                              {t('taskStatus.IN_PROGRESS')}
                            </Button>
                          ) : null}
                          {status === 'IN_PROGRESS' ? (
                            <Button size="sm" onClick={() => advance.mutate({ id: String(tk.id), to: 'RESOLVED', room: String(tk.room_id) })}>
                              {t('maintenance.resolve')}
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('maintenance.createTicket')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label>{t('reservations.room')}</Label>
              <UiSelect value={draft.room_id} onValueChange={(v) => setDraft((d) => ({ ...d, room_id: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(rooms?.items ?? []).map((r) => (
                    <SelectItem key={String(r.id)} value={String(r.id)}>
                      {String(r.room_number)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </UiSelect>
            </div>
            <div className="space-y-1.5">
              <Label>{t('common.name')}</Label>
              <Input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('common.description')}</Label>
              <Textarea value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('housekeeping.priority')}</Label>
              <UiSelect value={draft.priority} onValueChange={(v) => setDraft((d) => ({ ...d, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">{t('priority.LOW')}</SelectItem>
                  <SelectItem value="NORMAL">{t('priority.NORMAL')}</SelectItem>
                  <SelectItem value="HIGH">{t('priority.HIGH')}</SelectItem>
                  <SelectItem value="URGENT">{t('priority.URGENT')}</SelectItem>
                </SelectContent>
              </UiSelect>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={createTicket} disabled={!draft.room_id || !draft.title}>
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
