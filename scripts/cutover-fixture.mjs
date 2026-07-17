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
  '18237038': '2026-07-14T19:00:00Z',
  '18241006': '2026-07-15T19:00:00Z',
  '18257865': '2026-07-18T21:00:00Z', // FRA v ENG, third place (wire snapshot 2026-07-17)
  '18257739': '2026-07-19T19:00:00Z', // ESP v ARG, the final (wire snapshot 2026-07-17)
};

// the matchday schedule the manifest carries (fixtures[]) — kickoff order.
// sealed = full time + baked replay shipped; finalScore is the feed's own
// (bake-engarg gates enforce it). Extend/flip per matchday, then rerun cutover.
const MATCHDAY = [
  { id: '18241006', stage: 'SEMIFINAL', status: 'sealed', finalScore: { home: 1, away: 2 }, replay: true },
  { id: '18257865', stage: 'THIRD PLACE', status: 'upcoming' },
  { id: '18257739', stage: 'THE FINAL', status: 'upcoming' },
];

// flag art filenames that differ from the team code (apps/web/public/plate/gens/flags/)
const FLAG_FILES = { ESP: 'SPA', MAR: 'MOR' };

const teamsTs = readFileSync(path.join(ROOT, 'services/stands/src/sentiment/teams.ts'), 'utf8');
function teamsEntry(fid) {
  const entryRe = new RegExp(
    `'${fid}':\\s*\\{\\s*home:\\s*C\\('([A-Z]+)',\\s*'([^']+)',\\s*'([^']+)',\\s*'([^']+)'\\),\\s*away:\\s*C\\('([A-Z]+)',\\s*'([^']+)',\\s*'([^']+)',\\s*'([^']+)'\\),\\s*competition:\\s*'([^']+)',\\s*dateISO:\\s*'([^']+)'`
  );
  const m = teamsTs.match(entryRe);
  if (!m) {
    console.error(`fixture ${fid} not in teams.ts FIXTURE_INFO — add it there first (one source of truth).`);
    process.exit(1);
  }
  const kickoff = KICKOFFS[fid];
  if (!kickoff) {
    console.error(`fixture ${fid} has no kickoff in KICKOFFS — add it (from the TxLINE fixtures snapshot).`);
    process.exit(1);
  }
  const [, hCode, hName, hC1, hC2, aCode, aName, aC1, aC2, comp, dateISO] = m;
  const team = (code, name, c1, c2) => ({ code, name, colors: [c1, c2], flag: FLAG_FILES[code] ?? code });
  return {
    matchId: fid,
    home: team(hCode, hName, hC1, hC2),
    away: team(aCode, aName, aC1, aC2),
    kickoffUtc: kickoff,
    competition: comp,
    dateISO,
  };
}

const featured = teamsEntry(id);
const fixtures = MATCHDAY.map((d) => {
  const e = teamsEntry(d.id);
  const fx = { matchId: e.matchId, stage: d.stage, status: d.status, home: e.home, away: e.away, kickoffUtc: e.kickoffUtc, competition: e.competition, dateISO: e.dateISO };
  if (d.finalScore) fx.finalScore = d.finalScore;
  if (d.replay) fx.replay = true;
  return fx;
});

const manifest = {
  ...featured,
  gatesOpenMinutes: 30,
  fixtures,
};
writeFileSync(path.join(ROOT, 'apps/web/public/fixture.json'), JSON.stringify(manifest, null, 2) + '\n');

const vercelPath = path.join(ROOT, 'vercel.json');
const vercel = JSON.parse(readFileSync(vercelPath, 'utf8'));
for (const rw of vercel.rewrites ?? []) {
  if (rw.source === '/live') rw.destination = `/woven-loom?match=${id}`;
}
writeFileSync(vercelPath, JSON.stringify(vercel, null, 2) + '\n');

console.log(`cutover staged: featured ${featured.home.code} v ${featured.away.code} (${id}), kickoff ${featured.kickoffUtc}`);
console.log(`  schedule: ${fixtures.map((f) => `${f.home.code}-${f.away.code} ${f.status}`).join(' · ')}`);
console.log('  wrote apps/web/public/fixture.json + vercel.json /live pin');
console.log('  next: git diff -> commit -> deploy (vercel; fly only if service code changed)');
