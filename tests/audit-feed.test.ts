/**
 * HOUSE-ZEN — Audit journal readability tests (spec §30, migration 067).
 * Raw codes must never reach the screen: curated action labels, localized
 * entity names, actor identity + business references resolved per row.
 */

import { describe, expect, it } from 'vitest';
import { DemoDataApi } from '@/lib/demo/api';
import { buildSeed, DEMO_TENANT_ID } from '@/lib/demo/store';
import { auditActionLabel, auditEntityLabel } from '@/lib/utils/audit';

const T = DEMO_TENANT_ID;

const DICT: Record<string, string> = {
  'audit.log.payment.created': 'Paiement enregistré',
  'audit.verb.updated': 'Modification',
  'properties.title': 'Établissements',
};
const t = (k: string) => DICT[k] ?? k;

describe('audit label helpers', () => {
  it('uses the curated label for known actions', () => {
    expect(auditActionLabel('payment.created', t)).toBe('Paiement enregistré');
  });

  it('falls back to a localized verb, then the raw segment', () => {
    expect(auditActionLabel('services.updated', t)).toBe('Modification');
    expect(auditActionLabel('services.exploded', t)).toBe('exploded');
  });

  it('localizes entity names via page titles, raw fallback otherwise', () => {
    expect(auditEntityLabel('properties', t)).toBe('Établissements');
    expect(auditEntityLabel('custom_thing', t)).toBe('custom_thing');
  });
});

describe('demo auditFeed (server parity, migration 067)', () => {
  it('resolves actor identity and business references', async () => {
    const api = new DemoDataApi(buildSeed());
    await api.signIn('owner@demo.house-zen.app', 'demo1234');
    const feed = await api.auditFeed();
    const seeded = feed.find((e) => e.action === 'tenant.created');
    expect(seeded).toBeTruthy();
    expect(seeded?.actor_name).toBe('Arlette Nkeng');
    expect(seeded?.actor_email).toBe('owner@demo.house-zen.app');
    expect(seeded?.ref).toBe('Zen Hôtels & Résidences');
  });

  it('resolves the reference of newly created rows (property name)', async () => {
    const api = new DemoDataApi(buildSeed());
    await api.signIn('owner@demo.house-zen.app', 'demo1234');
    const prop = await api.create('properties', { name: 'Zen Kribi', property_type: 'HOTEL' });
    const feed = await api.auditFeed();
    const row = feed.find((e) => e.action === 'properties.created' && e.entity_id === prop.id);
    expect(row?.ref).toBe('Zen Kribi');
    expect(row?.actor_name).toBe('Arlette Nkeng');
  });

  it('search filters on action and actor', async () => {
    const api = new DemoDataApi(buildSeed());
    await api.signIn('owner@demo.house-zen.app', 'demo1234');
    const byAction = await api.auditFeed('tenant.created');
    expect(byAction.length).toBeGreaterThan(0);
    const byActor = await api.auditFeed('arlette');
    expect(byActor.length).toBeGreaterThan(0);
    const none = await api.auditFeed('inexistant-xyz');
    expect(none).toHaveLength(0);
    void T;
  });
});
