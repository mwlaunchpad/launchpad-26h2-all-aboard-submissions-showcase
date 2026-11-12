import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import config from './showcase.config.json' with { type: 'json' };

export default defineConfig({
  plugins: [react()],
  base: config.base,
  server: { port: 5173, open: false },
  build: { assetsInlineLimit: 0, chunkSizeWarningLimit: 900 },
});
