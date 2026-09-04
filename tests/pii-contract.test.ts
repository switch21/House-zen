/**
 * HOUSE-ZEN — PII read-path contract tests (migration 052 mirror).
 * The demo adapter mirrors the DATA semantics of the audited SQL RPC
 * `hz_read_id_document`: unknown id → null (no cross-tenant existence leak),
 * known id → stored value. The production adapter maps 1:1 onto the RPC,
 * which enforces customers.read / reservations.read and audit-logs every
 * access (the demo relies on the documented client-side guards).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DemoDataApi } from '@/lib/demo/api';
import { buildSeed } from '@/lib/demo/store';

describe('PII read path (migration 052 contract)', () => {
  let api: DemoDataApi;

  beforeEach(async () => {
    api = new DemoDataApi(buildSeed());
    await api.signIn('owner@demo.house-zen.app', 'demo1234');
  });

  it('returns the stored document for a known customer of the tenant', async () => {
    const { items } = await api.list('customers');
    expect(items.length).toBeGreaterThan(0);
    const first = items[0]!;
    const doc = await api.readIdDocument('customers', first.id);
    expect(doc).toBe((first as { id_document?: string }).id_document ?? null);
  });

  it('returns null for an unknown id (no existence leak)', async () => {
    await expect(api.readIdDocument('customers', 'does-not-exist')).resolves.toBeNull();
  });

  it('returns null for a row outside the tenant scope', async () => {
    // Seeded competitor row: tenant-scoped lookup must behave like RLS.
    await expect(api.readIdDocument('customers', 'c-competitor-y')).resolves.toBeNull();
  });

  it('rejects unauthenticated access like every other data path', async () => {
    const fresh = new DemoDataApi(buildSeed());
    await expect(fresh.readIdDocument('customers', 'any-id')).rejects.toThrow(/not signed in/i);
  });
});
