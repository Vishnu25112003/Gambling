import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    /*
     * `node_modules/react-dom` at the repo ROOT is 16.14.0 — hoisted in by
     * @solana/wallet-adapter-keystone -> @keystonehq/sdk -> react-qr-reader,
     * which peer-deps `react-dom: ~16` — while the app runs React 19.
     * react-dom@16 throws on import against react@19. @vitejs/plugin-react
     * happens to inject this same dedupe today, so the breakage is currently
     * masked; declaring it here means it does not depend on that.
     */
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      // The Solana stack imports the Node `buffer` builtin, which Vite would
      // otherwise externalize into a warn-only stub (`buffer.Buffer` === undefined).
      // The trailing slash forces resolution to the npm package rather than the
      // builtin, so deps get the real browser implementation.
      buffer: 'buffer/',
    },
  },
  optimizeDeps: {
    include: ['buffer'],
  },
  define: {
    // Some Solana wallet-adapter deps still reach for `global`/`process`.
    global: 'globalThis',
  },
  server: {
    port: 5173,
    // Other projects on this machine also default to 5173/5174 — without this,
    // Vite silently falls back to a free port instead, which then no longer
    // matches CORS_ORIGIN/SIWS_DOMAIN on the backend and breaks sign-in with a
    // CORS error that looks exactly like "the wallet won't connect".
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true },
      // Doc 11 — uploaded avatars are served by the API, not by Vite. Without
      // this every uploaded image 404s in development while working in a build.
      '/uploads': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
