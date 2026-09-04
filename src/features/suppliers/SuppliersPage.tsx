import { EntityCrudPage, type EntityCrudConfig } from '@/features/crud/EntityCrudPage';

const config: EntityCrudConfig = {
  entity: 'suppliers',
  titleKey: 'suppliers.title',
  createKey: 'suppliers.create',
  readPermission: 'suppliers.read',
  writePermission: 'suppliers.write',
  columns: [
    { name: 'name', labelKey: 'common.name', kind: 'text' },
    { name: 'contact_name', labelKey: 'suppliers.contactName', kind: 'text' },
    { name: 'phone', labelKey: 'common.phone', kind: 'text' },
    { name: 'email', labelKey: 'common.email', kind: 'email' },
  ],
  formFields: [
    { name: 'name', labelKey: 'common.name', kind: 'text' },
    { name: 'contact_name', labelKey: 'suppliers.contactName', kind: 'text' },
    { name: 'phone', labelKey: 'common.phone', kind: 'text' },
    { name: 'email', labelKey: 'common.email', kind: 'email' },
  ],
};

export default function SuppliersPage() {
  return <EntityCrudPage config={config} />;
}
