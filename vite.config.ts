import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// HOUSE-ZEN — Vite configuration.
// Dev server binds port 3000 (gateway/preview requirement), host 0.0.0.0.
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 3000, strictPort: true, host: '0.0.0.0', allowedHosts: true },
  preview: { port: 3000, strictPort: true, host: '0.0.0.0' },
  build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 1200 },
});
