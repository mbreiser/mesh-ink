import { defineConfig } from 'vite';

export default defineConfig({
  base: '/mesh-ink/',
  build: {
    chunkSizeWarningLimit: 800,
  },
});
