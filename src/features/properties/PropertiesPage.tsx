import { ExternalLink } from 'lucide-react';
import { EntityCrudPage, type EntityCrudConfig } from '@/features/crud/EntityCrudPage';

const config: EntityCrudConfig = {
  entity: 'properties',
  titleKey: 'properties.title',
  createKey: 'properties.create',
  readPermission: 'properties.read',
  writePermission: 'properties.write',
  defaultSort: { name: 'asc' },
  columns: [
    { name: 'name', labelKey: 'properties.name', kind: 'text' },
    { name: 'city', labelKey: 'common.city', kind: 'text' },
    { name: 'country', labelKey: 'common.country', kind: 'text' },
    { name: 'property_type', labelKey: 'properties.propertyType', kind: 'select', options: [
      { value: 'HOTEL', labelKey: 'propertyType.HOTEL' },
      { value: 'RESIDENCE', labelKey: 'propertyType.RESIDENCE' },
      { value: 'HOSTEL', labelKey: 'propertyType.HOSTEL' },
      { value: 'FURNISHED_APARTMENT', labelKey: 'propertyType.FURNISHED_APARTMENT' },
      { value: 'GUESTHOUSE', labelKey: 'propertyType.GUESTHOUSE' },
    ] },
    { name: 'is_published', labelKey: 'properties.published', kind: 'checkbox' },
  ],
  formFields: [
    { name: 'name', labelKey: 'properties.name', kind: 'text' },
    { name: 'property_type', labelKey: 'properties.propertyType', kind: 'select', options: [
      { value: 'HOTEL', labelKey: 'propertyType.HOTEL' },
      { value: 'RESIDENCE', labelKey: 'propertyType.RESIDENCE' },
      { value: 'HOSTEL', labelKey: 'propertyType.HOSTEL' },
      { value: 'FURNISHED_APARTMENT', labelKey: 'propertyType.FURNISHED_APARTMENT' },
      { value: 'GUESTHOUSE', labelKey: 'propertyType.GUESTHOUSE' },
    ] },
    { name: 'address', labelKey: 'common.address', kind: 'text' },
    { name: 'city', labelKey: 'common.city', kind: 'text' },
    { name: 'country', labelKey: 'common.country', kind: 'text' },
    { name: 'phone', labelKey: 'common.phone', kind: 'text' },
    { name: 'email', labelKey: 'common.email', kind: 'email' },
    { name: 'description', labelKey: 'properties.description', kind: 'textarea' },
    { name: 'photos', labelKey: 'properties.photos', kind: 'photos' },
    { name: 'timezone', labelKey: 'properties.timezone', kind: 'text', defaultValue: 'Africa/Douala' },
    { name: 'is_published', labelKey: 'properties.published', kind: 'checkbox', defaultValue: true },
  ],
  /** Published rows expose their public vitrine page (/book/:slug). */
  extraRowActions: (row, t) =>
    row.is_published && row.slug ? (
      <a
        href={`/book/${String(row.slug)}`}
        target="_blank"
        rel="noopener noreferrer"
        title={t('properties.viewPublic')}
        aria-label={t('properties.viewPublic')}
        onClick={(e) => e.stopPropagation()}
        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-primary/10"
      >
        <ExternalLink size={14} />
        <span className="hidden lg:inline">{t('properties.viewPublic')}</span>
      </a>
    ) : null,
};

export default function PropertiesPage() {
  return <EntityCrudPage config={config} />;
}
