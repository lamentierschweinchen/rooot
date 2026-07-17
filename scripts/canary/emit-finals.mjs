#!/usr/bin/env node
/**
 * ROOOT — finals emitter (coordinator lane).
 *
 * Runs the REAL replay pipeline headless (stadium.html?replay=1 — the same
 * adapters that render the stadium, never a re-derivation) until the baked
 * match settles, then writes the settled truth to
 * apps/web/public/plate/finals/<matchId>.json:
 *
 *   { matchId, finalScore, stats (the settled window.__stats — scorers, cards,
 *     corners, fouls, possession/territory, subs, penalties, VAR),
 *     market: { open, close } (first/last of window.__match.marketSeries) }
 *
 * The sealed stands read this file for the full-time card (goal scorers) and
 * the market plate (pre-game → whistle journey) without loading the whole
 * baked feed. One honest source: the pipeline that already renders the plates.
 *
 *   node scripts/canary/emit-finals.mjs --web http://localhost:5173 --match 18241006
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
function argOf(flag, dflt) { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; }
const WEB = argOf('--web', 'http://localhost:5173');
const MATCH = argOf('--match', '18241006');

const url = `${WEB}/stadium.html?replay=1&match=${MATCH}`;
console.log(`[emit-finals] ${url}`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });

// the replay fast-forwards the whole match in ~30s; done flips at terminal FULL_TIME
await page.waitForFunction(() => window.__match && window.__match.done === true, null, { timeout: 120_000 });
await page.waitForTimeout(2_500); // let the last stats snapshots fold in

const out = await page.evaluate((matchId) => {
  const m = window.__match || {};
  const s = window.__stats || null;
  const series = (m.marketSeries || []).filter(Boolean);
  const clean = (t) => t ? { home: +(+t.home).toFixed(4), draw: +(+t.draw).toFixed(4), away: +(+t.away).toFixed(4) } : null;
  return {
    matchId,
    finalScore: m.score ? { home: m.score.home, away: m.score.away } : null,
    market: {
      open: series.length ? clean(series[0]) : clean(m.market),
      close: series.length ? clean(series[series.length - 1]) : clean(m.market),
      points: series.length
    },
    stats: s
  };
}, MATCH);

await browser.close();

if (!out.finalScore) { console.error('[emit-finals] no final score — refusing to write'); process.exit(1); }
const dir = join(ROOT, 'apps/web/public/plate/finals');
mkdirSync(dir, { recursive: true });
const file = join(dir, `${MATCH}.json`);
writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
const sc = out.stats ? `scorers ${(out.stats.home?.scorers || []).length}+${(out.stats.away?.scorers || []).length}` : 'no stats';
console.log(`[emit-finals] wrote ${file} — final ${out.finalScore.home}–${out.finalScore.away}, ${sc}, market open ${JSON.stringify(out.market.open)} → close ${JSON.stringify(out.market.close)}`);
