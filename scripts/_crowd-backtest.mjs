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

import { toFeed } from './_tofeed.mjs';
const feed = toFeed('apps/web/dist/replay/col-gha-20260704.jsonl'); // combined odds+scores
const M = createModel();
let minB = 1, maxB = 0, maxGap = 0, firstMarket = null, marketMoved = false;
for (const msg of feed) { M.ingest(msg); M.tick(); const s = M._st;
  minB = Math.min(minB, s.belief.home); maxB = Math.max(maxB, s.belief.home);
  maxGap = Math.max(maxGap, Math.abs(s.belief.home - s.market.home));
  if (firstMarket === null) firstMarket = s.market.home;
  else if (Math.abs(s.market.home - firstMarket) > 0.02) marketMoved = true;
}
assert.ok(marketMoved, 'the feed carries real odds so the market moves (else divergence is meaningless)');
assert.ok(maxB - minB > 0.1, 'belief MOVES over the replay — a no-op model leaves it flat at 0.5 (range ' + (maxB - minB).toFixed(3) + ')');
assert.ok(maxGap > 0.05, 'crowd diverges from the moving market (maxGap ' + maxGap.toFixed(3) + ')');
console.log('OK divergence beliefRange=', (maxB - minB).toFixed(3), 'maxGap=', maxGap.toFixed(3));

const G = createModel();
G.ingest({ type: 'score', ev: { home: 1, away: 0, minute: 10 } });
G.ingest({ type: 'ledger', msg: { type: 'event', ev: { kind: 'goal', side: 'home', confirmed: true } } });
G.tick();
assert.ok(G.snapshot().roar.home > 0.3, 'goal spikes home roar (got ' + G.snapshot().roar.home.toFixed(2) + ')');
assert.equal(G.snapshot().faithSide, 'away', 'trailing end keeps faith');
console.log('OK roar+faith');

const V = createModel();
let moment = null, verdict = null;
V.onMoment = function (f) { V._m = f; };   // model exposes hooks for the harness
V.ingest({ type: 'ledger', msg: { type: 'event', ev: { kind: 'var', side: 'home' } } });
assert.ok(V.pullMoment(), 'VAR opens a moment');
V._st.userPredict = { home: 1, away: 0 };
V.ingest({ type: 'score', ev: { home: 0, away: 0, minute: 120 } });
V.ingest({ type: 'status', ev: { phase: 'FULL_TIME' } });
const vr = V.pullVerdict();
assert.equal(vr.hit, false, 'predicted 1-0, actual 0-0 → miss');
console.log('OK moments+verdict');
