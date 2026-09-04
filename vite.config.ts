import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// HOUSE-ZEN — Vite configuration.
// Dev server binds port 3000 (gateway/preview requirement), host 0.0.0.0.
//
// Bundle strategy (perf budget — docs/implementation/known-limitations.md §8):
//  - route-level code splitting via React.lazy in src/app/router/routes.tsx
//  - manualChunks isolates heavy vendors so the app shell stays small:
//      vendor   react + EVERYTHING importing React at top-level
//               (react-dom, scheduler, react-router*, @radix-ui, @tanstack,
//               lucide-react, react-i18next…) — MUST stay in ONE chunk:
//               splitting them creates cross-chunk cycles whose evaluation
//               order breaks top-level `forwardRef()` calls → silent blank
//               page in production (no dev-server equivalent, no error).
//      charts   recharts + d3 stack — reachable ONLY via React.lazy routes
//               (Dashboard/Reports) → dynamically evaluated, safe to split
//      supabase @supabase/* (auth-js, realtime, storage) — pure JS, no React
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 3000, strictPort: true, host: '0.0.0.0', allowedHosts: true },
  preview: { port: 3000, strictPort: true, host: '0.0.0.0' },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          // Lazy-only heavy stack (recharts imported solely by lazy routes)
          if (/[\\/]node_modules[\\/](recharts|victory-vendor|d3-[a-z-]+|internmap|decimal.js|eventemitter3)[\\/]/.test(id)) {
            return 'charts';
          }
          // Pure JS, no React binding — safe standalone chunk
          if (id.includes('@supabase')) return 'supabase';
          // ⚠️ React + all top-level React consumers in ONE chunk (see header)
          return 'vendor';
        },
      },
    },
  },
});
