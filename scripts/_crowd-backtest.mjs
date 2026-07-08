import assert from 'node:assert';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// crowd-sim.js is a browser IIFE with a CommonJS `module.exports` tail (so it also
// works as a plain <script> in the browser — see Step 5's window.__stands glue).
// apps/web/package.json sets "type": "module", so Node's loader treats this .js as
// ESM for `import`, dynamic `import()`, AND `require()` (Node 24 transparently runs
// require(esm) for type:module files) — the file has no `export` statements, so a
// named import fails ("does not provide an export named 'createModel'"), and even
// require() executes it with real ESM semantics (top-level `this` is undefined,
// not module.exports), which throws inside the IIFE instead of populating exports.
// Module._compile forces genuine CJS compilation (module/exports/require locals,
// this === module.exports) independent of the ambient package.json "type", which
// is exactly the environment the IIFE's `module.exports = { createModel }` tail
// expects — so we use it here rather than import/require.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const crowdSimPath = path.resolve(__dirname, '../apps/web/public/crowd-sim.js');
const source = fs.readFileSync(crowdSimPath, 'utf8');
const crowdSimModule = new Module(crowdSimPath);
crowdSimModule.filename = crowdSimPath;
crowdSimModule.paths = Module._nodeModulePaths(path.dirname(crowdSimPath));
crowdSimModule._compile(source, crowdSimPath);
const { createModel } = crowdSimModule.exports;

const m = createModel();                       // default TUNE
m.ingest({ type: 'score', ev: { home: 0, away: 0, minute: 0 } });
const s = m.snapshot();
assert.ok(s && s.rooted && typeof s.rooted.home === 'number', 'snapshot has rooted counts');
assert.ok(s.roar && typeof s.roar.home === 'number', 'snapshot has roar');
console.log('OK skeleton snapshot', JSON.stringify(s));
