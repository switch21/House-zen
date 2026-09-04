import { EntityCrudPage, type EntityCrudConfig } from '@/features/crud/EntityCrudPage';

const config: EntityCrudConfig = {
  entity: 'buildings',
  titleKey: 'buildings.title',
  createKey: 'buildings.create',
  readPermission: 'buildings.read',
  writePermission: 'buildings.write',
  columns: [
    { name: 'name', labelKey: 'common.name', kind: 'text' },
    { name: 'property_id', labelKey: 'nav.properties', kind: 'text', ref: { entity: 'properties', labelColumn: 'name' } },
    { name: 'floors', labelKey: 'buildings.floors', kind: 'number' },
  ],
  formFields: [
    { name: 'name', labelKey: 'common.name', kind: 'text' },
    { name: 'property_id', labelKey: 'nav.properties', kind: 'text', ref: { entity: 'properties', labelColumn: 'name' } },
    { name: 'floors', labelKey: 'buildings.floors', kind: 'number', min: 0, defaultValue: 1 },
  ],
};

export default function BuildingsPage() {
  return <EntityCrudPage config={config} />;
}
