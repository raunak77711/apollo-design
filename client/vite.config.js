import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Backend target for the dev proxy. Override with VITE_BACKEND_URL if needed.
const backend = process.env.VITE_BACKEND_URL || 'http://localhost:5010';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    host: true, // needed so the dev server is reachable inside Docker
    proxy: {
      // Proxy API + storage to the Express backend during dev.
      '/api': backend,
      '/storage': backend,
    },
  },
});
