import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { createReadStream, existsSync } from 'node:fs';

const fixturesDir = fileURLToPath(new URL('../../fixtures', import.meta.url));

/**
 * DEV-ONLY: serve the repo-root fixtures/ folder at /fixtures/* so the watching-shell
 * dev entry (app-dev.html?ledger) can replay the AUS–EGY story JSONL through the frozen
 * parser to light the ledger with real events. These files are gitignored + never
 * bundled; this middleware only runs in `vite dev`. Not a product surface.
 */
function serveFixtures() {
  return {
    name: 'rooot-serve-fixtures-dev',
    apply: 'serve' as const,
    configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: { statusCode: number; end: (s?: string) => void; setHeader: (k: string, v: string) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/fixtures/')) return next();
        const name = decodeURIComponent(url.slice('/fixtures/'.length).split('?')[0] ?? '');
        if (!name || name.includes('..')) {
          res.statusCode = 400;
          res.end('bad path');
          return;
        }
        const path = `${fixturesDir}/${name}`;
        if (!existsSync(path)) {
          res.statusCode = 404;
          res.end('not found');
          return;
        }
        res.setHeader('Content-Type', 'application/x-ndjson');
        createReadStream(path).pipe(res as unknown as NodeJS.WritableStream);
      });
    },
  };
}

export default defineConfig({
  plugins: [serveFixtures()],
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
      // can be judged without sitting through a replay); /app-dev.html = the
      // watching-shell verification entry (Lane A — real ARG–CPV replay @60).
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        stagedev: fileURLToPath(new URL('./stage-dev.html', import.meta.url)),
        relicdev: fileURLToPath(new URL('./relic-dev.html', import.meta.url)),
        appdev: fileURLToPath(new URL('./app-dev.html', import.meta.url)),
      },
    },
  },
});
