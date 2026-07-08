import assert from 'node:assert';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// crowd-sim.js, match-read.js, and the baked apps/web/public/plate/demo-suicol.js are
// all browser-facing files with a CommonJS `module.exports` tail, living under apps/web's
// "type":"module" package.json boundary. A plain import/require would run them as real
// ESM (top-level `this` undefined, no `module`/`exports` locals), which breaks every one
// of those tails — see scripts/_crowd-backtest.mjs's header for the full rationale.
// Module._compile forces genuine CJS compilation regardless of the ambient package.json
// "type" — the same shim scripts/_crowd-backtest.mjs and scripts/_matchread-test.mjs use.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadCjs(relPath) {
  const p = path.resolve(__dirname, relPath);
  const source = fs.readFileSync(p, 'utf8');
  const mod = new Module(p);
  mod.filename = p;
  mod.paths = Module._nodeModulePaths(path.dirname(p));
  mod._compile(source, p);
  return mod.exports;
}

const { createModel } = loadCjs('../apps/web/public/crowd-sim.js');
const { reduceMatch } = loadCjs('../apps/web/public/match-read.js');
const { feed } = loadCjs('../apps/web/public/plate/demo-suicol.js');

assert.ok(Array.isArray(feed) && feed.length > 0, 'the baked demo feed (plate/demo-suicol.js) has entries');
assert.ok(feed.every((f, i) => i === 0 || f.atMs >= feed[i - 1].atMs), 'the baked feed is sorted by atMs');
const oddsCount = feed.filter((f) => f.msg.type === 'odds').length;
assert.ok(oddsCount > 0, 'the baked feed carries odds messages (THE fix — the scores-only recording had none)');
console.log('OK baked feed loaded —', feed.length, 'entries,', oddsCount, 'odds ticks');

// Drive BOTH engines off the exact same merged timeline: crowd-sim's model (belief vs.
// market divergence) and match-read's reduceMatch (the __match read-model), same as the
// server-replay/WS path would in the browser — just without the transport.
const M = createModel();
let matchState;
let minB = 1,
  maxB = 0,
  firstMarket = null,
  marketMoved = false;
for (const { msg } of feed) {
  M.ingest(msg);
  M.tick();
  matchState = reduceMatch(matchState, msg);
  const s = M._st;
  minB = Math.min(minB, s.belief.home);
  maxB = Math.max(maxB, s.belief.home);
  if (firstMarket === null) firstMarket = s.market.home;
  else if (Math.abs(s.market.home - firstMarket) > 0.02) marketMoved = true;
}

assert.ok(
  marketMoved,
  'the market MOVES across the replay now that odds are merged in (this failed before the odds-file merge — the scores-only feed left it flat)',
);
assert.ok(maxB - minB > 0.1, 'crowd-sim belief moves over the baked replay (range ' + (maxB - minB).toFixed(3) + ')');
assert.equal(matchState.done, true, 'match-read reaches done===true by the end of the baked replay (the recording plays through to full-time)');
console.log(
  'OK bake drives both engines — beliefRange=',
  (maxB - minB).toFixed(3),
  'marketMoved=',
  marketMoved,
  'done=',
  matchState.done,
);
