import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    // Les specs unitaires valident l'adaptateur démo (déterministe) :
    // on neutralise toute config Supabase héritée de .env.local — les tests
    // de bout en bout contre le backend réel relèvent de l'E2E, pas de Vitest.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
});
