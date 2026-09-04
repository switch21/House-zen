import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// HOUSE-ZEN — Vite configuration.
// Dev server binds port 3000 (gateway/preview requirement), host 0.0.0.0.
//
// Bundle strategy (perf budget — docs/implementation/known-limitations.md §8):
//  - route-level code splitting via React.lazy in src/app/router/routes.tsx
//  - manualChunks isolates heavy vendors so the app shell stays small:
//      react-vendor  react / react-dom / react-router / scheduler
//      charts        recharts + d3 stack (only fetched by Dashboard/Reports)
//      supabase      @supabase/* (auth-js, realtime, storage)
//      radix         headless UI primitives shared by shadcn components
//      query         @tanstack/react-query engine
//      vendor        remaining node_modules fallback
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 3000, strictPort: true, host: '0.0.0.0', allowedHosts: true },
  preview: { port: 3000, strictPort: true, host: '0.0.0.0' },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
            return 'react-vendor';
          }
          if (/[\\/]node_modules[\\/](recharts|victory-vendor|d3-[a-z-]+|internmap|decimal.js|eventemitter3)[\\/]/.test(id)) {
            return 'charts';
          }
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('@radix-ui')) return 'radix';
          if (id.includes('@tanstack')) return 'query';
          return 'vendor';
        },
      },
    },
  },
});
