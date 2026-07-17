#!/usr/bin/env node
/**
 * ROOOT — decision captures (owner review sheet, 17 Jul).
 * Real pages, real data, pinned clock; variants injected page-side only for
 * the mock frames (never shipped). PNGs → design/reviews/2026-07-17-decisions/.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT = join(ROOT, 'design/reviews/2026-07-17-decisions');
mkdirSync(OUT, { recursive: true });
const WEB = 'http://localhost:5173';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

async function shot(name) {
  await page.screenshot({ path: join(OUT, name + '.png') });
  console.log('  ✓', name);
}

// seed the fan record every page sees (the real walk state: ARG call on a lean, lived match)
async function seed() {
  await page.evaluate(() => {
    localStorage.setItem('rooot.pass', JSON.stringify({ matchId: '18241006', home: 'ENG', away: 'ARG', side: 'h', call: { h: 0, a: 2 }, conv: 2, ts: 1784300000000, live: true }));
    localStorage.setItem('rooot.cloth.18241006', JSON.stringify({ fx: '18241006', home: { tri: 'ENG' }, away: { tri: 'ARG' }, score: { h: 1, a: 2 }, at: 1784310000000 }));
  });
}

console.log('[capture] A — cabinet tile');
await page.goto(WEB + '/cabinet.html?live=1&match=18241006', { waitUntil: 'domcontentloaded' });
await seed();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);
await shot('A1-cabinet-current');
await page.evaluate(() => {
  const tiles = document.getElementById('record').children;
  const t = tiles[3]; // LOUDEST NIGHT — the dead tile
  const pts = window.__myRecord ? window.__myRecord.pointsFor('18241006') : 0;
  t.querySelector('b').textContent = pts;
  t.querySelector('.l').textContent = 'POINTS';
  t.classList.add('gold');
});
await shot('A2-cabinet-points');

console.log('[capture] B — stadium hotspot labels');
await page.goto(WEB + '/stadium.html?replay=1&match=18241006', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__demoFeed && window.__demoFeed.finish(), null, { timeout: 30000 });
await page.waitForTimeout(1800);
await shot('B1-stadium-unlabeled');
await page.addStyleTag({ content: `.hot .cap{display:block!important;position:absolute;top:calc(100% + 5px);left:50%;transform:translateX(-50%);
  font:800 6.5px/1 'Anybody','Arial Black',sans-serif;letter-spacing:.14em;color:#F3ECDB;background:rgba(26,24,21,.88);
  padding:3px 5px;white-space:nowrap;border-radius:1px}` });
await page.evaluate(() => { // mock: give the unlabeled twins their captions too
  document.querySelectorAll('.hot').forEach(h => {
    if (!h.querySelector('.cap')) { const c = document.createElement('span'); c.className = 'cap';
      c.textContent = ({goal:'GOAL',arc:'SET PIECES',bench:'TEAM SHEET',odds:'THE MARKET',control:'CONTROL',book:'THE BOOK'})[h.dataset.place] || ''; h.appendChild(c); }
  });
});
await shot('B2-stadium-labeled-mock');

console.log('[capture] C — Saturday states (pinned clock)');
const states = [
  ['C1-landing-gates-open', '/?mdnow=2026-07-18T20:45:00Z'],
  ['C2-gate-gates-open', '/gate.html?live=1&mdnow=2026-07-18T20:45:00Z'],
  ['C3-landing-live', '/?mdnow=2026-07-18T21:30:00Z'],
  ['C4-gate-live', '/gate.html?live=1&mdnow=2026-07-18T21:30:00Z'],
];
for (const [name, path] of states) {
  await page.goto(WEB + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1600);
  await shot(name);
}

await browser.close();
console.log('[capture] done →', OUT);
