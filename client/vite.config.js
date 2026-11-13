import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/*
 * By default the API is proxied rather than called cross-origin, so the
 * session cookie is same-site in development exactly as it is in production,
 * where the server serves this build itself. Both addresses come from
 * client/.env: API_PROXY_TARGET for the proxy, VITE_API_BASE_URL to call an
 * API somewhere else instead.
 */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const api = { '/api': { target: env.API_PROXY_TARGET || 'http://localhost:4100', changeOrigin: false } };
  return {
    plugins: [react()],
    server: { port: 5180, proxy: api },
    preview: { port: 5180, proxy: api },
    build: {
      // pdf.js ships modern syntax.
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
      rolldownOptions: {
        output: {
          // pdf.js's worker is an .mjs file. Many servers (nginx before 1.23, for
          // one) send .mjs as application/octet-stream, and browsers refuse to run
          // a module script with that type — the PDF then "could not be opened".
          // Emitting it as .js makes every server send it as JavaScript.
          assetFileNames: (asset) => (/\.mjs$/.test(asset.names?.[0] ?? asset.name ?? '')
            ? 'assets/[name]-[hash].js'
            : 'assets/[name]-[hash][extname]'),
        },
      },
    },
  };
});
