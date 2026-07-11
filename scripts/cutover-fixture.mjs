#!/usr/bin/env node
/**
 * ROOOT — fixture cutover (autopilot brick #1, coordinator lane).
 *
 * `node scripts/cutover-fixture.mjs <fixtureId>` rewrites the two data-side
 * fixture pins from ONE source of truth (services/stands/src/sentiment/teams.ts):
 *   - apps/web/public/fixture.json   (the manifest surfaces + adapters read)
 *   - vercel.json                    (the /live rewrite pin)
 * Then you review the diff, commit, and deploy. It never touches surfaces
 * (Design's lane) — with T16 landed they follow the manifest by themselves.
 *
 * Honesty: refuses ids that teams.ts doesn't know (no fixture is ever invented).
 * Kickoff must be passed for a new fixture the first time or edited in KICKOFFS.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(new URL('.', import.meta.url).pathname, '..');
const id = process.argv[2];
if (!id || !/^\d+$/.test(id)) {
  console.error('usage: node scripts/cutover-fixture.mjs <fixtureId>');
  process.exit(1);
}

// kickoffs (UTC) — extend per matchday; the wire's fixtures snapshot is the source
const KICKOFFS = {
  '18218149': '2026-07-10T19:00:00Z',
  '18213979': '2026-07-11T21:00:00Z',
  '18222446': '2026-07-12T01:00:00Z',
};

const teamsTs = readFileSync(path.join(ROOT, 'services/stands/src/sentiment/teams.ts'), 'utf8');
const entryRe = new RegExp(
  `'${id}':\\s*\\{\\s*home:\\s*C\\('([A-Z]+)',\\s*'([^']+)',\\s*'([^']+)',\\s*'([^']+)'\\),\\s*away:\\s*C\\('([A-Z]+)',\\s*'([^']+)',\\s*'([^']+)',\\s*'([^']+)'\\),\\s*competition:\\s*'([^']+)',\\s*dateISO:\\s*'([^']+)'`
);
const m = teamsTs.match(entryRe);
if (!m) {
  console.error(`fixture ${id} not in teams.ts FIXTURE_INFO — add it there first (one source of truth).`);
  process.exit(1);
}
const kickoff = KICKOFFS[id];
if (!kickoff) {
  console.error(`fixture ${id} has no kickoff in KICKOFFS — add it (from the TxLINE fixtures snapshot).`);
  process.exit(1);
}
const [, hCode, hName, hC1, hC2, aCode, aName, aC1, aC2, comp, dateISO] = m;

const manifest = {
  matchId: id,
  home: { code: hCode, name: hName, colors: [hC1, hC2] },
  away: { code: aCode, name: aName, colors: [aC1, aC2] },
  kickoffUtc: kickoff,
  competition: comp,
  dateISO,
};
writeFileSync(path.join(ROOT, 'apps/web/public/fixture.json'), JSON.stringify(manifest, null, 2) + '\n');

const vercelPath = path.join(ROOT, 'vercel.json');
const vercel = JSON.parse(readFileSync(vercelPath, 'utf8'));
for (const rw of vercel.rewrites ?? []) {
  if (rw.source === '/live') rw.destination = `/woven-loom?match=${id}`;
}
writeFileSync(vercelPath, JSON.stringify(vercel, null, 2) + '\n');

console.log(`cutover staged: ${hCode} v ${aCode} (${id}), kickoff ${kickoff}`);
console.log('  wrote apps/web/public/fixture.json + vercel.json /live pin');
console.log('  next: git diff -> commit -> deploy (vercel; fly only if service code changed)');
