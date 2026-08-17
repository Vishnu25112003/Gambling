import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
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
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
