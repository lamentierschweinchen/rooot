import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@contracts': fileURLToPath(new URL('../../contracts', import.meta.url)),
    },
  },
  server: { port: 5173 },
});
