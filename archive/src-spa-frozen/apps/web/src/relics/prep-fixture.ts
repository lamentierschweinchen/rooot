/// <reference types="node" />
/**
 * ROOOT relics — DEV FIXTURE PREP (Node/tsx; owned by the relics lane).
 *
 * Runs the REAL builder (buildMatchArc → parses fixtures through contracts/normalize)
 * over the (huge, gitignored) AUS–EGY capture ONCE and writes a COMPACT JSON asset
 * (aus-egy.arc.json, a few KB) the browser harness imports. This is NOT a second data
 * path — it is buildMatchArc's exact output cached to disk, so the harness renders the
 * same real market data without Vite having to serve 24 MB of raw JSONL from outside
 * its root. Re-run when the capture changes:
 *
 *   npx tsx apps/web/src/relics/prep-fixture.ts
 *
 * The written asset carries the downsampled odds path, the goals, the final score, the
 * capture window, and the raw tick count — all REAL. The synthetic fan/crowd is layered
 * on at render time by buildRelicData, never baked here.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { buildMatchArc } from './buildRelicData';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../../');

const scoresPath = resolve(repoRoot, 'fixtures/scores-night-20260703.jsonl');
const oddsPath = resolve(repoRoot, 'fixtures/odds-night-20260703.jsonl');

console.log('[prep] reading', scoresPath);
const scoresText = readFileSync(scoresPath, 'utf8');
console.log('[prep] reading', oddsPath);
const oddsText = readFileSync(oddsPath, 'utf8');

console.log('[prep] parsing through contracts/normalize …');
const arc = buildMatchArc(scoresText, oddsText);

const outPath = resolve(here, 'aus-egy.arc.json');
writeFileSync(outPath, JSON.stringify(arc));
console.log('[prep] wrote', outPath);
console.log('[prep] tickCount:', arc.tickCount);
console.log('[prep] oddsPath points:', arc.oddsPath.length);
console.log('[prep] goals:', JSON.stringify(arc.goals));
console.log('[prep] finalScore:', JSON.stringify(arc.finalScore));
console.log(
  '[prep] window:',
  new Date(arc.windowFromMs).toISOString(),
  '→',
  new Date(arc.windowToMs).toISOString(),
);
console.log('[prep] first odds point:', JSON.stringify(arc.oddsPath[0]));
console.log('[prep] last  odds point:', JSON.stringify(arc.oddsPath[arc.oddsPath.length - 1]));
