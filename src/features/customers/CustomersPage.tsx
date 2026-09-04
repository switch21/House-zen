import { EntityCrudPage, type EntityCrudConfig } from '@/features/crud/EntityCrudPage';

const config: EntityCrudConfig = {
  entity: 'customers',
  titleKey: 'customers.title',
  createKey: 'customers.create',
  readPermission: 'customers.read',
  writePermission: 'customers.write',
  defaultSort: { full_name: 'asc' },
  columns: [
    { name: 'full_name', labelKey: 'common.name', kind: 'text' },
    { name: 'email', labelKey: 'common.email', kind: 'email' },
    { name: 'phone', labelKey: 'common.phone', kind: 'text' },
    { name: 'country', labelKey: 'common.country', kind: 'text' },
    { name: 'id_document', labelKey: 'customers.idDocument', kind: 'text' },
  ],
  formFields: [
    { name: 'full_name', labelKey: 'common.name', kind: 'text' },
    { name: 'email', labelKey: 'common.email', kind: 'email' },
    { name: 'phone', labelKey: 'common.phone', kind: 'text' },
    { name: 'country', labelKey: 'common.country', kind: 'text' },
    { name: 'id_document', labelKey: 'customers.idDocument', kind: 'text' },
    { name: 'notes', labelKey: 'common.notes', kind: 'textarea' },
  ],
};

export default function CustomersPage() {
  return <EntityCrudPage config={config} />;
}
