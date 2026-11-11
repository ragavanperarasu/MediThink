import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/*
 * The API is proxied rather than called cross-origin, so the session cookie
 * is same-site in development exactly as it is in production, where the
 * server serves this build itself.
 */
const api = { '/api': { target: 'http://localhost:4100', changeOrigin: false } };

export default defineConfig({
  plugins: [react()],
  server: { port: 5180, proxy: api },
  preview: { port: 5180, proxy: api },
  // pdf.js ships modern syntax.
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
