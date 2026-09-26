import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    port: 3000,
    host: '0.0.0.0',
    open: true,
    // Vite 6+ rejects requests whose Host header it doesn't recognize.
    // Codespaces/devcontainer forwarding uses a rotating *.app.github.dev
    // (or *.preview.app.github.dev) hostname, so allow that suffix explicitly
    // instead of Vite silently refusing to serve the page.
    allowedHosts: ['.app.github.dev', '.githubpreview.dev', 'localhost'],
    hmr: {
      // Through the Codespaces HTTPS forwarding proxy, the browser always
      // talks on 443 even though Vite listens on 3000 internally — without
      // this, the HMR websocket tries the wrong port and live-reload breaks.
      clientPort: 443,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        ws: true,
        changeOrigin: true,
        secure: false,
        timeout: 60000,
        proxyTimeout: 60000,
      },
      '/health': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
        timeout: 60000,
        proxyTimeout: 60000,
      },
      '/realtime': {
        target: 'ws://localhost:4000',
        ws: true,
        changeOrigin: true,
        timeout: 60000,
        proxyTimeout: 60000,
      },
    },
  }
});