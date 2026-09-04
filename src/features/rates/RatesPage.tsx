/**
 * HOUSE-ZEN — Rates & seasons (tabs): seasonal price modifiers + base rates.
 */

import { EntityCrudPage, type EntityCrudConfig } from '@/features/crud/EntityCrudPage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTranslation } from '@/hooks/useTranslation';

const ratesConfig: EntityCrudConfig = {
  entity: 'rates',
  titleKey: 'rates.title',
  createKey: 'rates.create',
  readPermission: 'rates.read',
  writePermission: 'rates.write',
  columns: [
    { name: 'room_type_id', labelKey: 'nav.roomTypes', kind: 'text', ref: { entity: 'room_types', labelColumn: 'name' } },
    { name: 'price', labelKey: 'common.price', kind: 'money' },
    { name: 'valid_from', labelKey: 'rates.validFrom', kind: 'date' },
  ],
  formFields: [
    { name: 'room_type_id', labelKey: 'nav.roomTypes', kind: 'text', ref: { entity: 'room_types', labelColumn: 'name' } },
    { name: 'price', labelKey: 'common.price', kind: 'money', min: 0 },
    { name: 'valid_from', labelKey: 'rates.validFrom', kind: 'date' },
  ],
};

const seasonsConfig: EntityCrudConfig = {
  entity: 'rate_seasons',
  titleKey: 'rates.seasons',
  createKey: 'rates.createSeason',
  readPermission: 'rates.read',
  writePermission: 'rates.write',
  columns: [
    { name: 'name', labelKey: 'common.name', kind: 'text' },
    { name: 'property_id', labelKey: 'nav.properties', kind: 'text', ref: { entity: 'properties', labelColumn: 'name' } },
    { name: 'start_date', labelKey: 'rates.validFrom', kind: 'date' },
    { name: 'end_date', labelKey: 'rates.validTo', kind: 'date' },
    { name: 'modifier_percent', labelKey: 'rates.modifierPercent', kind: 'number' },
  ],
  formFields: [
    { name: 'name', labelKey: 'common.name', kind: 'text' },
    { name: 'property_id', labelKey: 'nav.properties', kind: 'text', ref: { entity: 'properties', labelColumn: 'name' } },
    { name: 'start_date', labelKey: 'rates.validFrom', kind: 'date' },
    { name: 'end_date', labelKey: 'rates.validTo', kind: 'date' },
    { name: 'modifier_percent', labelKey: 'rates.modifierPercent', kind: 'number', defaultValue: 0 },
  ],
};

export default function RatesPage() {
  const { t } = useTranslation();
  return (
    <Tabs defaultValue="rates" className="space-y-4">
      <TabsList>
        <TabsTrigger value="rates">{t('rates.title')}</TabsTrigger>
        <TabsTrigger value="seasons">{t('rates.seasons')}</TabsTrigger>
      </TabsList>
      <TabsContent value="rates">
        <EntityCrudPage config={ratesConfig} />
      </TabsContent>
      <TabsContent value="seasons">
        <EntityCrudPage config={seasonsConfig} />
      </TabsContent>
    </Tabs>
  );
}
