import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const syncTarget = process.env.SYNC_PROXY_TARGET ?? 'http://localhost:4111';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4110,
    strictPort: true,
    proxy: {
      '/sync': { target: syncTarget, ws: true },
    },
  },
  preview: {
    port: 4110,
    strictPort: true,
    proxy: {
      '/sync': { target: syncTarget, ws: true },
    },
  },
  build: {
    target: 'es2023',
    sourcemap: true,
  },
});
