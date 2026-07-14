#!/usr/bin/env node
// ROOOT · loom→scarf KEEPSAKE capture (the mint image).
// Re-renders the SEALED loom a fan watched and screenshots it, headless & deterministic.
//
//   node loom-keepsake-capture.mjs --out scarf.png [--record cloth.json] [--match <id>] [--base http://localhost:4199]
//
// The record is the sealed "cloth seed" (same shape woven-loom.html's writeCloth() stores as
// rooot.cloth.<id>). In production the stands service produces it from the match's events and
// passes it with --record. With no --record we self-test by lifting the bundled demo (window.MATCH).
//
// How it works (the two spec gotchas both vanish because we screenshot the SERVED page):
//   1. inject the record on window.__loomKeepsakeRecord BEFORE boot (addInitScript);
//   2. open woven-loom.html?keepsake=1&export=1 — export mode settles instantly, unclips the
//      scroll so the whole cloth lays out, neutralises the seal's 1.35s print animation, and
//      sets <html data-loom="sealed"> when the cloth is drawn;
//   3. await fonts, screenshot #loomsvg (the cloth + its seal) at 2x. That element IS the scarf.
import { chromium } from 'file:///Users/ls/Documents/rooot/scripts/footage/node_modules/playwright/index.mjs';
import { readFileSync } from 'node:fs';

const A = process.argv.slice(2);
const opt = (f, d) => { const i = A.indexOf(f); return i >= 0 ? A[i + 1] : d; };
const OUT = opt('--out'); if (!OUT) { console.error('need --out <png>'); process.exit(1); }
const BASE = opt('--base', 'http://localhost:4199');
const MATCH = opt('--match', 'demo');
const RECFILE = opt('--record');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });

// The record: from --record (production), else built from the served demo match (self-test).
let record;
if (RECFILE) {
  record = JSON.parse(readFileSync(RECFILE, 'utf8'));
} else {
  const p0 = await ctx.newPage();
  await p0.goto(BASE + '/woven-loom.html', { waitUntil: 'domcontentloaded' });
  record = await p0.evaluate(() => {
    const R = window.MATCH; if (!R) return null;
    return { v: 1, at: 0, fx: 'demo',
      home: { tri: R.home.tri, ink: R.home.ink }, away: { tri: R.away.tri, ink: R.away.ink },
      score: R.score, dur: R.durationMin, src: 'replay',
      belief: R.belief, danger: R.danger, poss: R.poss,
      events: (R.events || []).map(e => [e.m, e.s || '', e.t, e.n || '']),
      pens: null, ks: { editionNo: 7, owner: 'lukas.sol', call: { label: 'CALLED ' + R.home.tri + ' · WON', hit: true } } };
  });
  await p0.close();
  if (!record) { console.error('no --record and no window.MATCH to build one'); process.exit(1); }
}

const page = await ctx.newPage();
const errs = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', e => errs.push(`[pageerror] ${e.message}`));

await page.addInitScript(r => { window.__loomKeepsakeRecord = r; }, record);
await page.goto(`${BASE}/woven-loom.html?keepsake=1&export=1&match=${encodeURIComponent(MATCH)}`, { waitUntil: 'load', timeout: 20000 });

let state = 'timeout';
try { await page.waitForSelector('html[data-loom]', { timeout: 8000 }); state = await page.getAttribute('html', 'data-loom'); } catch {}
if (state === 'empty') { console.error('record missing/invalid — loom rendered EMPTY; refusing to mint a blank cloth'); await browser.close(); process.exit(2); }
await page.evaluate(async () => { await document.fonts.ready; });   // gotcha 1: fonts loaded before shot
await page.waitForTimeout(500);                                      // gotcha 2: weave-tile PNGs settle

const svg = await page.$('#loomsvg');
const box = svg ? await svg.boundingBox() : null;
await svg.screenshot({ path: OUT });
console.log(`SHOT ${OUT} | ${record.home.tri} ${record.score[0]}–${record.score[1]} ${record.away.tri}` +
  ` | data-loom=${state} | ${box ? Math.round(box.width) + '×' + Math.round(box.height) : '?'}` +
  ` | ${errs.length ? 'CONSOLE:\n' + errs.join('\n') : 'CONSOLE CLEAN'}`);
await browser.close();
