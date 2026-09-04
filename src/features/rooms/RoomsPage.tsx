import { EntityCrudPage, type EntityCrudConfig } from '@/features/crud/EntityCrudPage';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/hooks/useTranslation';
import { getDataApi } from '@/lib/api';
import { DomainError } from '@/types/domain';
import { useQueryClient } from '@tanstack/react-query';
import { Wrench, Wrench as WrenchOff, CheckCircle2 } from 'lucide-react';

const HK_COLORS: Record<string, string> = {
  DIRTY: 'bg-warning/15 text-warning',
  CLEANING: 'bg-muted text-muted-foreground',
  INSPECTED: 'bg-primary/15 text-primary',
  CLEAN: 'bg-success/15 text-success',
};

function RoomsActions({ row }: { row: Record<string, unknown> }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const hk = String(row.housekeeping_state);
  const status = String(row.status);

  async function advanceHk(to: 'CLEANING' | 'INSPECTED' | 'CLEAN' | 'DIRTY') {
    try {
      await getDataApi().setRoomHousekeepingState(String(row.id), to);
      void qc.invalidateQueries({ queryKey: ['hz', 'rooms'] });
    } catch (e) {
      window.alert(e instanceof DomainError ? e.message : t('common.error'));
    }
  }

  async function toggleStatus() {
    try {
      await getDataApi().setRoomOperationalStatus(
        String(row.id),
        status === 'OPERATIONAL' ? 'UNDER_MAINTENANCE' : 'OPERATIONAL',
      );
      void qc.invalidateQueries({ queryKey: ['hz', 'rooms'] });
    } catch (e) {
      window.alert(e instanceof DomainError ? e.message : t('common.error'));
    }
  }

  return (
    <div className="flex items-center gap-1">
      <span className={`me-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${HK_COLORS[hk] ?? ''}`}>
        {t(`housekeepingState.${hk}`)}
      </span>
      {hk === 'DIRTY' ? (
        <Button variant="ghost" size="icon" title={t('housekeeping.startTask')} onClick={() => advanceHk('CLEANING')}>
          <SparkleIcon />
        </Button>
      ) : hk === 'CLEANING' ? (
        <Button variant="ghost" size="icon" title="INSPECTED" onClick={() => advanceHk('INSPECTED')}>
          <CheckCircle2 size={14} />
        </Button>
      ) : null}
      <Button variant="ghost" size="icon" onClick={toggleStatus} title={t('rooms.status')}>
        {status === 'OPERATIONAL' ? <WrenchOff size={14} /> : <Wrench size={14} className="text-destructive" />}
      </Button>
    </div>
  );
}

function SparkleIcon() {
  return <span aria-hidden>🧹</span>;
}

const config: EntityCrudConfig = {
  entity: 'rooms',
  titleKey: 'rooms.title',
  createKey: 'rooms.create',
  readPermission: 'rooms.read',
  writePermission: 'rooms.write',
  defaultSort: { room_number: 'asc' },
  columns: [
    { name: 'room_number', labelKey: 'rooms.roomNumber', kind: 'text' },
    { name: 'property_id', labelKey: 'nav.properties', kind: 'text', ref: { entity: 'properties', labelColumn: 'name' } },
    { name: 'room_type_id', labelKey: 'nav.roomTypes', kind: 'text', ref: { entity: 'room_types', labelColumn: 'name' } },
    { name: 'floor', labelKey: 'rooms.floor', kind: 'number' },
    { name: 'status', labelKey: 'rooms.status', kind: 'select', options: [
      { value: 'OPERATIONAL', labelKey: 'roomStatus.OPERATIONAL' },
      { value: 'UNDER_MAINTENANCE', labelKey: 'roomStatus.UNDER_MAINTENANCE' },
    ] },
    { name: 'housekeeping_state', labelKey: 'rooms.housekeepingState', kind: 'text' },
  ],
  formFields: [
    { name: 'room_number', labelKey: 'rooms.roomNumber', kind: 'text' },
    { name: 'property_id', labelKey: 'nav.properties', kind: 'text', ref: { entity: 'properties', labelColumn: 'name' } },
    { name: 'room_type_id', labelKey: 'nav.roomTypes', kind: 'text', ref: { entity: 'room_types', labelColumn: 'name' } },
    { name: 'floor', labelKey: 'rooms.floor', kind: 'number', min: 0 },
    { name: 'status', labelKey: 'rooms.status', kind: 'select', options: [
      { value: 'OPERATIONAL', labelKey: 'roomStatus.OPERATIONAL' },
      { value: 'UNDER_MAINTENANCE', labelKey: 'roomStatus.UNDER_MAINTENANCE' },
    ] },
  ],
  extraRowActions: (row) => <RoomsActions row={row} />,
};

export default function RoomsPage() {
  return <EntityCrudPage config={config} />;
}
