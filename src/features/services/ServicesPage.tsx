import { EntityCrudPage, type EntityCrudConfig } from '@/features/crud/EntityCrudPage';

const config: EntityCrudConfig = {
  entity: 'services',
  titleKey: 'services.title',
  createKey: 'services.create',
  readPermission: 'services.read',
  writePermission: 'services.write',
  columns: [
    { name: 'name', labelKey: 'common.name', kind: 'text' },
    { name: 'description', labelKey: 'common.description', kind: 'text' },
    { name: 'price', labelKey: 'common.price', kind: 'money' },
    { name: 'is_active', labelKey: 'common.status', kind: 'checkbox' },
  ],
  formFields: [
    { name: 'name', labelKey: 'common.name', kind: 'text' },
    { name: 'description', labelKey: 'common.description', kind: 'textarea' },
    { name: 'price', labelKey: 'common.price', kind: 'money', min: 0 },
    { name: 'is_active', labelKey: 'common.status', kind: 'checkbox', defaultValue: true },
  ],
};

export default function ServicesPage() {
  return <EntityCrudPage config={config} />;
}
