/**
 * HOUSE-ZEN — DataApi factory.
 * Binds the Supabase implementation when credentials exist; otherwise the
 * documented demo adapter. This is the single switch point (visible banner in UI).
 */

import { config } from '@/lib/config/env';
import type { DataApi } from './types';
import { DemoDataApi } from '@/lib/demo/api';
import { SupabaseDataApi } from './supabase/api';

let cached: DataApi | null = null;

export function getDataApi(): DataApi {
  if (cached) return cached;
  if (config.demoMode) {
    cached = new DemoDataApi();
  } else {
    cached = new SupabaseDataApi();
  }
  return cached;
}

export function isDemoMode(): boolean {
  return config.demoMode;
}

export type { DataApi, EntityName, ListParams, Paginated, AuthSession, KPIs, AdminStats } from './types';
