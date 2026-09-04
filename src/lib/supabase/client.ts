import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '@/lib/config/env';

/**
 * HOUSE-ZEN — centralized Supabase client (spec §3). The ONLY instantiation point.
 * Uses the public anon key; authorization is enforced server-side by RLS with auth.uid().
 * SECURITY: SUPABASE_SERVICE_ROLE_KEY must never be referenced anywhere in frontend code.
 */

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (config.demoMode) {
    throw new Error(
      'Supabase is not configured — app runs in documented demo mode. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.',
    );
  }
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      global: { headers: { 'x-application-name': 'house-zen' } },
      db: { schema: 'public' },
    });
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  return !config.demoMode;
}
