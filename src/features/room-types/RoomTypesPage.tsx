import { EntityCrudPage, type EntityCrudConfig } from '@/features/crud/EntityCrudPage';

const config: EntityCrudConfig = {
  entity: 'room_types',
  titleKey: 'roomTypes.title',
  createKey: 'roomTypes.create',
  readPermission: 'room_types.read',
  writePermission: 'room_types.write',
  columns: [
    { name: 'name', labelKey: 'common.name', kind: 'text' },
    { name: 'property_id', labelKey: 'nav.properties', kind: 'text', ref: { entity: 'properties', labelColumn: 'name' } },
    { name: 'max_occupancy', labelKey: 'roomTypes.maxOccupancy', kind: 'number' },
    { name: 'base_price', labelKey: 'roomTypes.basePrice', kind: 'money' },
  ],
  formFields: [
    { name: 'name', labelKey: 'common.name', kind: 'text' },
    { name: 'property_id', labelKey: 'nav.properties', kind: 'text', ref: { entity: 'properties', labelColumn: 'name' } },
    { name: 'description', labelKey: 'common.description', kind: 'textarea' },
    { name: 'max_occupancy', labelKey: 'roomTypes.maxOccupancy', kind: 'number', min: 1, defaultValue: 2 },
    { name: 'base_price', labelKey: 'roomTypes.basePrice', kind: 'money', min: 0 },
  ],
};

export default function RoomTypesPage() {
  return <EntityCrudPage config={config} />;
}
