import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Docker-on-Windows bind mounts miss inotify events without polling.
    watch: { usePolling: true, interval: 800 },
    // With the relative VITE_API_BASE_URL (/api/v1), direct access on :5174
    // still works: the dev server forwards /api to the api container, the
    // same shape Caddy gives every other entry point.
    proxy: { '/api': { target: 'http://api:3000' } },
    // Vite rejects unknown Host headers (DNS-rebinding protection). Allow the
    // hostnames the dev server legitimately serves behind Caddy: tailnet
    // machine names and Cloudflare quick-tunnel URLs.
    allowedHosts: ['.ts.net', '.trycloudflare.com'],
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          mui: ['@mui/material', '@mui/icons-material'],
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
        },
      },
    },
  },
});
