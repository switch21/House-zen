import { EntityCrudPage, type EntityCrudConfig } from '@/features/crud/EntityCrudPage';

const config: EntityCrudConfig = {
  entity: 'amenities',
  titleKey: 'amenities.title',
  createKey: 'amenities.create',
  readPermission: 'amenities.read',
  writePermission: 'amenities.write',
  columns: [
    { name: 'name', labelKey: 'common.name', kind: 'text' },
    { name: 'icon', labelKey: 'common.type', kind: 'text' },
  ],
  formFields: [
    { name: 'name', labelKey: 'common.name', kind: 'text' },
    { name: 'icon', labelKey: 'common.type', kind: 'text', defaultValue: 'check' },
  ],
};

export default function AmenitiesPage() {
  return <EntityCrudPage config={config} />;
}
