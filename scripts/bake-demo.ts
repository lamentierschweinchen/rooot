/**
 * ROOOT bake-demo — bakes the SUI-COL recording into a client-side,
 * serverless demo feed: apps/web/public/plate/demo-suicol.js.
 *
 * THE FIX this script exists for: the sui-col SCORES recording
 * (fixtures/sui-col-scores-20260707.jsonl) carries NO odds messages — the
 * odds stream was captured to a SEPARATE file
 * (fixtures/sui-col-odds-20260707.jsonl). Baking scores alone (as a naive
 * single-file toFeed() would) ships a demo whose market never moves — the
 * whole point of a "beside the crowd, a real market" honesty story falls
 * flat. This script reads BOTH files, runs every line through the same
 * contracts/normalize.ts parsers scripts/_tofeed.mjs uses
 * (parseScoreMessage/parseStatusMessage/parseLedgerMessage/parseOddsMessage),
 * and merges the result into one FeedMsg timeline sorted by receivedAtMs.
 *
 * Fixture scoping: both raw captures were recorded during a multi-match
 * window and carry OTHER fixtures' lines interleaved — the odds file alone
 * spans 5 distinct FixtureIds, the scores file 3. Every surface in this repo
 * already defaults `?match=18202783` for SUI-COL (crowd-sim.js,
 * match-read.js, loom-adapter.js, stats-adapter.js all hardcode it — see
 * design/STADIUM-GAPS.md's "SUI-COL* (FIX default 18202783)"), so this bake
 * filters to FixtureId 18202783 before parsing — otherwise the baked demo
 * would be a cross-talk mess of up to five simultaneous fixtures instead of
 * one coherent match.
 *
 * Output: apps/web/public/plate/demo-suicol.js —
 *   var __DEMO_SUICOL = [ { atMs, msg }, ... ];  (msg is a contracts/feed.ts FeedMsg)
 *   window.__DEMO_SUICOL = __DEMO_SUICOL;                 (browser)
 *   module.exports = { feed: __DEMO_SUICOL };             (Node — scripts/_bake-test.mjs,
 *     loaded with the same Module._compile CJS-force shim crowd-sim.js/match-read.js use)
 *
 * Run: npx tsx scripts/bake-demo.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseScoreMessage,
  parseStatusMessage,
  parseLedgerMessage,
  parseOddsMessage,
} from '../contracts/normalize';
import type { FeedMsg } from '../contracts/feed';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** SUI-COL — the repo-wide demo default fixture (see file header). */
const FIXTURE_ID = 18202783;
const SCORES_FILE = path.join(ROOT, 'fixtures/sui-col-scores-20260707.jsonl');
const ODDS_FILE = path.join(ROOT, 'fixtures/sui-col-odds-20260707.jsonl');
const OUT_FILE = path.join(ROOT, 'apps/web/public/plate/demo-suicol.js');

interface RawLine {
  receivedAtMs: number;
  event: string;
  data: unknown;
}

interface Baked {
  atMs: number;
  msg: FeedMsg;
}

/** Peek a raw envelope's FixtureId without committing to a full parse. */
function peekFixtureId(raw: string): number | null {
  try {
    const o = JSON.parse(raw) as { FixtureId?: unknown };
    return typeof o.FixtureId === 'number' ? o.FixtureId : null;
  } catch {
    return null;
  }
}

/**
 * Read one recorded jsonl file, filter to FIXTURE_ID, and run every
 * surviving line through the same four parsers scripts/_tofeed.mjs uses.
 * Lines with no FixtureId at all (heartbeats already dropped; __meta/
 * __disconnect transport lines) pass the filter harmlessly — they simply
 * fail every parser's own guards and contribute nothing.
 */
function bakeFile(file: string): Baked[] {
  const out: Baked[] = [];
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let o: RawLine;
    try {
      o = JSON.parse(t) as RawLine;
    } catch {
      continue;
    }
    if (o.event === 'heartbeat') continue;
    const raw = typeof o.data === 'string' ? o.data : JSON.stringify(o.data);
    const fid = peekFixtureId(raw);
    if (fid !== null && fid !== FIXTURE_ID) continue; // another fixture's line — drop (see header)
    const at = o.receivedAtMs || 0;

    const sc = parseScoreMessage(raw, at, 'replay');
    if (sc) out.push({ atMs: at, msg: { type: 'score', ev: sc } });
    const stt = parseStatusMessage(raw, at, 'replay');
    if (stt) out.push({ atMs: at, msg: { type: 'status', ev: stt } });
    const led = parseLedgerMessage(raw, at, 'replay');
    if (led) out.push({ atMs: at, msg: { type: 'ledger', msg: led } });
    const od = parseOddsMessage(raw, at, 'replay');
    if (od) out.push({ atMs: at, msg: { type: 'odds', tick: od } });
  }
  return out;
}

function main(): void {
  const scores = bakeFile(SCORES_FILE);
  const odds = bakeFile(ODDS_FILE);
  let merged = [...scores, ...odds].sort((a, b) => a.atMs - b.atMs);

  // Trim the long pre-match odds tail: the recording spans ~4.7h (odds tick for hours before
  // kickoff), but the demo should open just before kickoff and PLAY THE MATCH — not sit in dead
  // pre-match odds for a third of its runtime. Start ~3 min before the first playing status.
  const LEAD_MS = 3 * 60 * 1000;
  const kickoff =
    merged.find((m) => m.msg.type === 'status' && (m.msg.ev.phase === 'FIRST_HALF' || m.msg.ev.phase === 'SECOND_HALF')) ||
    merged.find((m) => m.msg.type === 'ledger');
  if (kickoff) merged = merged.filter((m) => m.atMs >= kickoff.atMs - LEAD_MS);

  // fixtureInfo at the head (AFTER the trim, so it survives) so __match.teams populates and the
  // loom themes SUI-COL instead of falling back to its ARG-CPV seed.
  merged.unshift({
    atMs: (merged.length ? merged[0].atMs : 0) - 1,
    msg: {
      type: 'fixtureInfo',
      fixture: {
        home: { code: 'SUI', name: 'Switzerland', colors: ['#D52B1E', '#FFFFFF'] },
        away: { code: 'COL', name: 'Colombia', colors: ['#FCD116', '#003893'] },
      },
    },
  } as (typeof merged)[number]);

  const counts = { score: 0, status: 0, ledger: 0, odds: 0 } as Record<FeedMsg['type'], number>;
  for (const m of merged) counts[m.msg.type] = (counts[m.msg.type] ?? 0) + 1;

  console.log(
    `[bake-demo] fixture ${FIXTURE_ID}: score=${counts.score} status=${counts.status} ` +
      `ledger=${counts.ledger} odds=${counts.odds} -> ${merged.length} total messages`,
  );

  if (merged.length === 0) {
    console.error('[bake-demo] FATAL: zero messages baked — check FIXTURE_ID / fixture paths.');
    process.exit(1);
  }
  if (counts.odds === 0) {
    console.error('[bake-demo] FATAL: zero odds messages baked — the market would never move. Aborting write.');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const body =
    `// AUTO-GENERATED by scripts/bake-demo.ts — do not hand-edit.\n` +
    `// SUI-COL (fixture ${FIXTURE_ID}) replay, merged from fixtures/sui-col-scores-20260707.jsonl\n` +
    `// + fixtures/sui-col-odds-20260707.jsonl, baked ${new Date().toISOString()}.\n` +
    `// ${merged.length} messages (score=${counts.score} status=${counts.status} ledger=${counts.ledger} ` +
    `odds=${counts.odds}), sorted by receivedAtMs.\n` +
    `var __DEMO_SUICOL = ${JSON.stringify(merged)};\n` +
    `if (typeof window !== 'undefined') window.__DEMO_SUICOL = __DEMO_SUICOL;\n` +
    `if (typeof module !== 'undefined' && module.exports) module.exports = { feed: __DEMO_SUICOL };\n`;
  fs.writeFileSync(OUT_FILE, body, 'utf8');
  console.log(`[bake-demo] wrote ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / 1_000_000).toFixed(2)} MB)`);
}

main();
