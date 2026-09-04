import { EntityCrudPage, type EntityCrudConfig } from '@/features/crud/EntityCrudPage';

/**
 * Clients — identity metadata (type / issue date / issue place) is stored in
 * clear; the document NUMBER stays in the encrypted `id_document` PII column
 * and is only decrypted through the audited RPC on the client detail page.
 */
const config: EntityCrudConfig = {
  entity: 'customers',
  titleKey: 'customers.title',
  createKey: 'customers.create',
  readPermission: 'customers.read',
  writePermission: 'customers.write',
  defaultSort: { full_name: 'asc' },
  rowLink: (row) => `/app/customers/${String(row.id)}`,
  columns: [
    { name: 'full_name', labelKey: 'common.name', kind: 'text' },
    { name: 'phone', labelKey: 'common.phone', kind: 'text' },
    { name: 'country', labelKey: 'common.country', kind: 'text' },
    { name: 'id_type', labelKey: 'customers.idType', kind: 'select', options: [
      { value: 'CNI', labelKey: 'customers.idType.CNI' },
      { value: 'PASSEPORT', labelKey: 'customers.idType.PASSEPORT' },
      { value: 'PERMIS', labelKey: 'customers.idType.PERMIS' },
      { value: 'RECEPISSE', labelKey: 'customers.idType.RECEPISSE' },
    ] },
    { name: 'email', labelKey: 'common.email', kind: 'email' },
  ],
  formFields: [
    { name: 'full_name', labelKey: 'common.name', kind: 'text' },
    { name: 'email', labelKey: 'common.email', kind: 'email' },
    { name: 'phone', labelKey: 'common.phone', kind: 'text' },
    { name: 'country', labelKey: 'common.country', kind: 'text' },
    { name: 'id_type', labelKey: 'customers.idType', kind: 'select', options: [
      { value: 'CNI', labelKey: 'customers.idType.CNI' },
      { value: 'PASSEPORT', labelKey: 'customers.idType.PASSEPORT' },
      { value: 'PERMIS', labelKey: 'customers.idType.PERMIS' },
      { value: 'RECEPISSE', labelKey: 'customers.idType.RECEPISSE' },
    ] },
    { name: 'id_document', labelKey: 'customers.idDocument', kind: 'text' },
    { name: 'id_issue_date', labelKey: 'customers.idIssueDate', kind: 'date' },
    { name: 'id_issue_place', labelKey: 'customers.idIssuePlace', kind: 'text' },
    { name: 'notes', labelKey: 'common.notes', kind: 'textarea' },
  ],
};

export default function CustomersPage() {
  return <EntityCrudPage config={config} />;
}
