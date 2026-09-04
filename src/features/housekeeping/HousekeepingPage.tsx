/**
 * HOUSE-ZEN — Housekeeping (spec §12): task board + controlled room-state machine.
 * DIRTY → CLEANING → INSPECTED → CLEAN (transitions enforced by DataApi/SQL).
 */

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, PlayCircle, Plus, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/misc';
import { PageHeader, StatusBadge } from '@/components/layout/shared';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useEntityList, useEntityMutations } from '@/hooks/useEntity';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi } from '@/lib/api';
import { formatDate, todayISO } from '@/lib/utils/money-dates';
import type { UUID } from '@/types/domain';

const TASK_STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'success' | 'warning' }> = {
  PENDING: { label: 'PENDING', variant: 'warning' },
  IN_PROGRESS: { label: 'IN_PROGRESS', variant: 'default' },
  DONE: { label: 'DONE', variant: 'success' },
  BLOCKED: { label: 'BLOCKED', variant: 'destructive' },
};

export default function HousekeepingPage() {
  const { t, locale } = useTranslation();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ room_id: '', assigned_to: '', priority: 'NORMAL', notes: '', scheduled_date: todayISO() });
  const { data: tasks, isLoading } = useEntityList<Record<string, unknown>>('housekeeping_tasks', {
    sort: { scheduled_date: 'desc' },
    pageSize: 200,
  });
  const { data: rooms } = useEntityList<Record<string, unknown>>('rooms', { pageSize: 500 });
  const { create, update } = useEntityMutations('housekeeping_tasks');

  const roomsById = new Map((rooms?.items ?? []).map((r) => [String(r.id), r]));

  const refresh = () => {
    ['housekeeping_tasks', 'rooms', 'housekeeping_logs', 'audit_logs'].forEach((e) =>
      qc.invalidateQueries({ queryKey: ['hz', e] }),
    );
  };

  const setTaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: UUID; status: string }) => {
      if (status === 'DONE') {
        // Marking a task done drives the room state machine CLEANING/DIRTY → INSPECTED.
        const task = tasks?.items.find((x) => x.id === id);
        const roomId = task ? String(task.room_id) : '';
        const room = roomsById.get(roomId);
        const hk = String(room?.housekeeping_state ?? 'DIRTY');
        if (hk === 'DIRTY') await getDataApi().setRoomHousekeepingState(roomId, 'CLEANING');
        if (hk === 'DIRTY' || hk === 'CLEANING') await getDataApi().setRoomHousekeepingState(roomId, 'INSPECTED');
      }
      return update.mutateAsync({ id, data: { status, completed_at: status === 'DONE' ? new Date().toISOString() : null } });
    },
    onSuccess: refresh,
  });

  async function createTask() {
    try {
      await create.mutateAsync({ ...draft, status: 'PENDING' });
      // Creating a task for a CLEAN room flips it to DIRTY through the machine.
      const room = roomsById.get(draft.room_id);
      if (room && String(room.housekeeping_state) === 'CLEAN') {
        await getDataApi().setRoomHousekeepingState(draft.room_id, 'DIRTY');
      }
      setOpen(false);
      refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t('common.error'));
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('housekeeping.title')}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} /> {t('housekeeping.createTask')}
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : !tasks || tasks.items.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('common.empty')} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reservations.room')}</TableHead>
                  <TableHead>{t('housekeeping.scheduled')}</TableHead>
                  <TableHead>{t('housekeeping.priority')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.notes')}</TableHead>
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.items.map((task) => {
                  const room = roomsById.get(String(task.room_id));
                  const status = String(task.status);
                  return (
                    <TableRow key={String(task.id)}>
                      <TableCell className="font-medium">
                        {String(room?.room_number ?? '—')}
                        <span className={`ms-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          String(room?.housekeeping_state) === 'CLEAN' ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'
                        }`}>
                          {t(`housekeepingState.${String(room?.housekeeping_state ?? 'DIRTY')}`)}
                        </span>
                      </TableCell>
                      <TableCell>{formatDate(String(task.scheduled_date), locale)}</TableCell>
                      <TableCell>{t(`priority.${String(task.priority)}`)}</TableCell>
                      <TableCell>
                        <StatusBadge
                          status={status}
                          map={Object.fromEntries(
                            Object.entries(TASK_STATUS_MAP).map(([k, v]) => [k, { ...v, label: t(`taskStatus.${k}`) }]),
                          )}
                        />
                      </TableCell>
                      <TableCell className="max-w-48 truncate">{String(task.notes ?? '—')}</TableCell>
                      <TableCell className="text-end">
                        <div className="flex justify-end gap-1">
                          {status === 'PENDING' ? (
                            <Button size="icon" variant="ghost" title={t('housekeeping.startTask')} onClick={() => setTaskStatus.mutate({ id: String(task.id), status: 'IN_PROGRESS' })}>
                              <PlayCircle size={15} />
                            </Button>
                          ) : null}
                          {status === 'IN_PROGRESS' ? (
                            <>
                              <Button size="icon" variant="ghost" title={t('housekeeping.markDone')} onClick={() => setTaskStatus.mutate({ id: String(task.id), status: 'DONE' })}>
                                <CheckCircle2 size={15} className="text-success" />
                              </Button>
                              <Button size="icon" variant="ghost" title={t('taskStatus.BLOCKED')} onClick={() => setTaskStatus.mutate({ id: String(task.id), status: 'BLOCKED' })}>
                                <XCircle size={15} className="text-destructive" />
                              </Button>
                            </>
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
            <DialogTitle>{t('housekeeping.createTask')}</DialogTitle>
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
              <Label>{t('housekeeping.scheduled')}</Label>
              <Input type="date" value={draft.scheduled_date} onChange={(e) => setDraft((d) => ({ ...d, scheduled_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('housekeeping.priority')}</Label>
              <UiSelect value={draft.priority} onValueChange={(v) => setDraft((d) => ({ ...d, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">{t('priority.LOW')}</SelectItem>
                  <SelectItem value="NORMAL">{t('priority.NORMAL')}</SelectItem>
                  <SelectItem value="HIGH">{t('priority.HIGH')}</SelectItem>
                </SelectContent>
              </UiSelect>
            </div>
            <div className="space-y-1.5">
              <Label>{t('common.notes')}</Label>
              <Input value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={createTask} disabled={!draft.room_id}>{t('common.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
