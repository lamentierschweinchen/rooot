import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@contracts': fileURLToPath(new URL('../../contracts', import.meta.url)),
    },
  },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      // multi-page: `/` = the real-replay stage; /stage-dev.html = the scripted
      // judgment harness (jump buttons for pre/dark/GOOOL/late/FT — clearly
      // badged DEV · SCRIPTED MATCH · NOT LIVE, deliberately public so states
      // can be judged without sitting through a replay).
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        stagedev: fileURLToPath(new URL('./stage-dev.html', import.meta.url)),
      },
    },
  },
});
