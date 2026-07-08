import assert from 'node:assert';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// match-read.js is a browser IIFE with a CommonJS `module.exports` tail, same shape
// as crowd-sim.js (see scripts/_crowd-backtest.mjs for the full rationale). Short
// version: apps/web/package.json sets "type": "module", so Node's loader treats this
// .js as ESM for both `import` and `require()`; the IIFE has no `export` statements,
// so a plain import can't find a named `reduceMatch` export, and even require(esm)
// runs with real ESM semantics (top-level `this` undefined) which breaks the file's
// `module.exports = {...}` tail. Module._compile forces genuine CJS compilation
// (module/exports/require locals) regardless of the ambient package.json "type" —
// exactly what the IIFE's CJS tail expects — so we use it instead of import/require.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const matchReadPath = path.resolve(__dirname, '../apps/web/public/match-read.js');
const source = fs.readFileSync(matchReadPath, 'utf8');
const matchReadModule = new Module(matchReadPath);
matchReadModule.filename = matchReadPath;
matchReadModule.paths = Module._nodeModulePaths(path.dirname(matchReadPath));
matchReadModule._compile(source, matchReadPath);
const { reduceMatch } = matchReadModule.exports;

// fresh state (no prior msg): defaults, and teams are null until fixtureInfo arrives
let s = reduceMatch(undefined, { type: 'score', ev: { tMs: 0, minute: 0, home: 0, away: 0, source: 'replay' } });
assert.equal(s.teams.home, null, 'teams.home is null before any fixtureInfo arrives');
assert.equal(s.teams.away, null, 'teams.away is null before any fixtureInfo arrives');
assert.equal(s.done, false, 'not done at kickoff');
console.log('OK fresh-state defaults');

// odds tick -> market
s = reduceMatch(s, { type: 'odds', tick: { tMs: 0, minute: null, pHome: 0.55, pDraw: 0.25, pAway: 0.20, source: 'replay' } });
assert.ok(Math.abs(s.market.home - 0.55) < 1e-9, 'odds tick sets market.home');
assert.ok(Math.abs(s.market.draw - 0.25) < 1e-9, 'odds tick sets market.draw');
assert.ok(Math.abs(s.market.away - 0.20) < 1e-9, 'odds tick sets market.away');
console.log('OK odds -> market');

// fixtureInfo -> teams (tri/name from TeamRef.code/name)
s = reduceMatch(s, { type: 'fixtureInfo', fixture: {
  id: 'x', kickoffISO: '2026-07-07T00:00:00Z',
  home: { code: 'SUI', name: 'Switzerland', colors: ['#c8102e', '#ffffff'], flag: '🇨🇭' },
  away: { code: 'COL', name: 'Colombia', colors: ['#ffcd00', '#003893'], flag: '🇨🇴' }
} });
assert.deepEqual(s.teams.home, { tri: 'SUI', name: 'Switzerland' }, 'fixtureInfo maps home -> {tri,name}');
assert.deepEqual(s.teams.away, { tri: 'COL', name: 'Colombia' }, 'fixtureInfo maps away -> {tri,name}');
console.log('OK fixtureInfo -> teams');

// score -> score + clock.min
s = reduceMatch(s, { type: 'score', ev: { tMs: 0, minute: 57, home: 2, away: 1, source: 'replay' } });
assert.equal(s.score.home, 2, 'score.home updates');
assert.equal(s.score.away, 1, 'score.away updates');
assert.equal(s.clock.min, 57, 'clock.min follows the score event minute');
console.log('OK score -> score + clock.min');

// status(SECOND_HALF) -> phase + running, market/score/teams untouched
s = reduceMatch(s, { type: 'status', ev: { tMs: 0, phase: 'SECOND_HALF', minute: 57, source: 'replay' } });
assert.equal(s.clock.phase, 'SECOND_HALF', 'clock.phase follows status');
assert.equal(s.clock.running, true, 'SECOND_HALF is a running phase');
assert.equal(s.done, false, 'not done mid-second-half');
assert.ok(Math.abs(s.market.home - 0.55) < 1e-9, 'market untouched by a status update');
assert.equal(s.score.home, 2, 'score untouched by a status update');
assert.deepEqual(s.teams.home, { tri: 'SUI', name: 'Switzerland' }, 'teams untouched by a status update');
console.log('OK status(SECOND_HALF) -> running, other slices untouched');

// status(FULL_TIME) -> done, clock stops
s = reduceMatch(s, { type: 'status', ev: { tMs: 0, phase: 'FULL_TIME', minute: 90, source: 'replay' } });
assert.equal(s.clock.phase, 'FULL_TIME');
assert.equal(s.clock.running, false, 'FULL_TIME stops the clock');
assert.equal(s.done, true, 'FULL_TIME marks the match done');
console.log('OK status(FULL_TIME) -> done===true, running===false');

// done is monotonic: a later non-final status must not un-done the match
s = reduceMatch(s, { type: 'status', ev: { tMs: 0, phase: 'PENALTIES', minute: 120, source: 'replay' } });
assert.equal(s.done, true, 'done stays true once the match has ended');
assert.equal(s.clock.running, false, 'PENALTIES does not run the clock');
console.log('OK done is monotonic across PENALTIES');

// malformed/unknown messages are no-ops (defensive — never throw on a bad wire msg)
const before = s;
s = reduceMatch(s, { type: 'spell', fixtureId: 'x', spell: {} });
assert.strictEqual(s, before, 'unrecognized FeedMsg type is a no-op');
s = reduceMatch(s, null);
assert.strictEqual(s, before, 'null msg is a no-op');
s = reduceMatch(s, { type: 'odds' }); // odds without a tick payload
assert.strictEqual(s, before, 'odds msg missing tick is a no-op');
console.log('OK unknown/malformed messages are no-ops');

// marketSeries accumulates one point per odds update (Task 9data — feeds a later
// odds-chart card). Exactly one odds tick has landed so far (the "odds -> market" test
// above) — confirm it appended a point, then confirm a second tick grows the series
// without touching the first (reduceMatch stays a pure append, never an in-place mutate).
assert.equal(s.marketSeries.length, 1, 'the one odds tick applied so far appended exactly one marketSeries point');
const seriesBefore = s.marketSeries;
s = reduceMatch(s, { type: 'odds', tick: { tMs: 0, minute: null, pHome: 0.6, pDraw: 0.22, pAway: 0.18, source: 'replay' } });
assert.equal(s.marketSeries.length, 2, 'a second odds tick appends another point — the series grows');
assert.strictEqual(s.marketSeries[0], seriesBefore[0], 'earlier marketSeries points are never mutated, only appended');
assert.ok(Math.abs(s.marketSeries[1].home - 0.6) < 1e-9, 'the newest point carries the latest pHome');
console.log('OK odds -> marketSeries grows (pure append, earlier points untouched)');

console.log('OK match-read reduceMatch — final state', JSON.stringify(s));
