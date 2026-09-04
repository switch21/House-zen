/**
 * Centralized environment configuration (spec §3).
 * The anon key is public by design: security is enforced by PostgreSQL RLS.
 * SERVICE ROLE key must NEVER appear in frontend code.
 */

interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  demoMode: boolean;
  appUrl: string;
  defaultLocale: string;
  defaultTimezone: string;
  defaultCurrency: string;
  appName: string;
}

const env = import.meta.env as Record<string, string | undefined>;

function readEnv(key: string): string {
  const value = env[key];
  return typeof value === 'string' ? value.trim() : '';
}

const supabaseUrl = readEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY');

export const config: AppConfig = {
  supabaseUrl,
  supabaseAnonKey,
  demoMode: supabaseUrl.length === 0 || supabaseAnonKey.length === 0,
  appUrl: readEnv('VITE_APP_URL') || 'http://localhost:3000',
  defaultLocale: readEnv('VITE_DEFAULT_LOCALE') || 'fr',
  defaultTimezone: 'Africa/Douala',
  defaultCurrency: 'XAF',
  appName: 'HOUSE-ZEN',
};
