import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
      },
      preload: {
        input: 'electron/preload.ts',
      },
      renderer: {},
    }),
  ],
  server: {
    port: 5174,
    strictPort: true,
    // Bind to all interfaces (IPv4 + IPv6). Without this, Vite defaults to
    // `localhost` which on macOS binds to ::1 only — Chrome / Playwright
    // resolve `localhost` to 127.0.0.1 first and get ERR_CONNECTION_REFUSED,
    // which made external UI testing agents fail with "connection refused"
    // mid-session. host: true binds 0.0.0.0 + ::, fixing the asymmetry.
    host: true,
  },
});
