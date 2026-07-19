/**
 * ROOOT bake-esparg — bakes the ESP-ARG (the final) recording into a
 * client-side, serverless demo feed: apps/web/public/plate/demo-esparg.js.
 *
 * Modeled on scripts/bake-engarg.ts (which is itself modeled on the SUI-COL
 * bake, scripts/bake-demo.ts — see that file's header for why a bake script
 * exists at all: odds + scores arrive on separate TxLINE streams and must be
 * merged into one FeedMsg timeline).
 *
 * Two deliberate differences from bake-engarg, both driven by how tonight's
 * capture was taken:
 *
 *  1. INPUT FILES ARE DISCOVERED, NOT HARDCODED. The eng-arg recorder rotated
 *     at the interval break and produced four files, whose paths that script
 *     lists by hand. Tonight's recorders were started at T−74 and are meant to
 *     run unbroken to the whistle — but a live feed WILL drop, and the runbook
 *     says to restart with `-2h` suffixed filenames if it does. So instead of
 *     betting on a file count, this script globs the capture directory for
 *     scores-esparg*.jsonl / odds-esparg*.jsonl and bakes whatever is there.
 *     Every discovered file is logged, so the merge is auditable.
 *
 *  2. THE ROSTER IS RECOVERED FROM THE CAPTURE ITSELF. eng-arg's recording
 *     started AFTER the one-shot `Action:"lineups"` envelope broadcast, so it
 *     needed a separate recovery script and a lineups-*.jsonl side file.
 *     Tonight's capture opened ~74 minutes before kickoff, ahead of the usual
 *     ~T−60 lineups broadcast, so the envelope should be inline in the scores
 *     capture. buildRoster therefore scans every discovered file, and still
 *     honours a lineups-esparg.jsonl side file if one had to be recovered.
 *     If no lineups envelope is found anywhere, the bake still succeeds with
 *     honestly-nameless events — the same degrade-gracefully stance the live
 *     server's seedSnapshot takes. Never fabricates.
 *
 * Home/away: teams.ts pins 18257739 as home ESP / away ARG, and the wire's
 * scores snapshot carries Participant1Id 3021 with Participant1IsHome:true —
 * so Participant1 = ESP = home, and p1IsHome is true for parseSpell, exactly
 * as in the eng-arg bake.
 *
 * Output: apps/web/public/plate/demo-esparg.js —
 *   var __DEMO_ESPARG = [ { atMs, msg }, ... ];  (msg is a contracts/feed.ts FeedMsg)
 *   window.__DEMO_ESPARG = __DEMO_ESPARG;                 (browser)
 *   module.exports = { feed: __DEMO_ESPARG };             (Node)
 *
 * Run: npx tsx scripts/bake-esparg.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseScoreMessage,
  parseStatusMessage,
  parseLedgerMessage,
  parseOddsMessage,
  parseSpell,
  parseLineups,
} from '../contracts/normalize';
import type { FeedMsg } from '../contracts/feed';
import type { FixtureRoster } from '../contracts/normalize';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** ESP-ARG — fixture 18257739, the final (see docs/DATA.md / apps/web/public/fixture.json). */
const FIXTURE_ID = 18257739;
const CAPTURE_DIR = path.join(ROOT, 'fixtures/live-esp-arg');
const OUT_FILE = path.join(ROOT, 'apps/web/public/plate/demo-esparg.js');

/**
 * The real, confirmed result of fixture 18257739 — filled in at full time from
 * the wire's own terminal score, never from a report or a guess. The write is
 * gated on it (see main): a hero feed that settles wrong is worse than none.
 */
// ESP 1–0 ARG — Ferran Torres, 105', in extra time, against ten men. The two
// Spain goals at 95' and 113' were both chalked off by VAR, so the settled
// scoreline moved exactly once all night.
const EXPECTED_FINAL: { home: number; away: number } | null = { home: 1, away: 0 };

/** Every recorded file for tonight, in a stable order. Rotation-tolerant (see header). */
function captureFiles(): string[] {
  if (!fs.existsSync(CAPTURE_DIR)) {
    console.error(`[bake-esparg] FATAL: no capture directory at ${CAPTURE_DIR}.`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(CAPTURE_DIR)
    .filter((f) => /^(scores|odds|lineups)-esparg.*\.jsonl$/.test(f))
    .sort()
    .map((f) => path.join(CAPTURE_DIR, f));
  if (files.length === 0) {
    console.error(`[bake-esparg] FATAL: no scores/odds capture files in ${CAPTURE_DIR}.`);
    process.exit(1);
  }
  return files;
}

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
 * Read one recorded jsonl file, filter to FIXTURE_ID, and run every surviving
 * line through the same parsers scripts/_tofeed.mjs uses. Unlike the eng-arg
 * capture, tonight's streams are unfiltered (the recorders subscribe to the
 * whole scores/odds firehose), so the FIXTURE_ID filter is load-bearing here,
 * not a no-op safety net — other fixtures' lines are really present and really
 * get dropped. Lines with no FixtureId at all (__meta/__disconnect transport
 * lines) pass the filter harmlessly and fail every parser's own guards.
 */
function bakeFile(file: string, roster?: FixtureRoster): Baked[] {
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
    const led = parseLedgerMessage(raw, at, 'replay', roster);
    if (led) out.push({ atMs: at, msg: { type: 'ledger', msg: led } });
    const od = parseOddsMessage(raw, at, 'replay');
    if (od) out.push({ atMs: at, msg: { type: 'odds', tick: od } });
    // possession spells (the loom's possession cord + the stadium's possessionPct) — derived
    // the same way the live server does. esp-arg: Participant1 = ESP = home (Participant1IsHome
    // is true in the wire snapshot, and teams.ts pins ESP home), so p1IsHome = true.
    const sp = parseSpell(raw, at, 'replay', true);
    if (sp) out.push({ atMs: at, msg: { type: 'spell', fixtureId: String(FIXTURE_ID), spell: sp } });
    // the starting XI (both squads named before kickoff) → the stadium's team-sheet card.
    const lu = parseLineups(raw);
    if (lu && lu.lineup) out.push({ atMs: at, msg: { type: 'lineup', fixtureId: String(lu.fixtureId), lineup: lu.lineup } });
  }
  return out;
}

/**
 * Build the fixture roster — the byPlayerId map that names goal/card/sub/injury
 * rows — from the first parseable `Action:"lineups"` envelope for THIS fixture
 * found anywhere in the capture. Returns undefined if there is none, in which
 * case the bake still succeeds with nameless events (never fabricated).
 */
function buildRoster(files: string[]): FixtureRoster | undefined {
  for (const file of files) {
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
      const roster = parseLineups(raw);
      if (roster && roster.fixtureId === FIXTURE_ID) {
        console.log(`[bake-esparg] roster recovered from ${path.basename(file)}`);
        return roster;
      }
    }
  }
  console.warn('[bake-esparg] no lineups envelope for this fixture in the capture — events stay nameless.');
  return undefined;
}

function main(): void {
  if (!EXPECTED_FINAL) {
    console.error(
      '[bake-esparg] FATAL: EXPECTED_FINAL is unset. Fill it in with the real settled scoreline ' +
        'from the wire before baking — the write is gated on it so the hero feed can never settle wrong.',
    );
    process.exit(1);
  }

  const files = captureFiles();
  console.log(`[bake-esparg] capture files (${files.length}):`);
  for (const f of files) console.log(`  ${path.basename(f)} (${(fs.statSync(f).size / 1_000_000).toFixed(2)} MB)`);

  // Build the roster ONCE, then thread it through every ledger parse so
  // goals/cards/subs/injuries resolve real names from the same wire.
  const roster = buildRoster(files);
  let merged = files.flatMap((f) => bakeFile(f, roster)).sort((a, b) => a.atMs - b.atMs);

  // Capture pre-match head data that must survive the trim: the starting XI (lineups arrive ~1h
  // before kickoff, well outside the trim window below).
  const lineups = merged.filter((m) => m.msg.type === 'lineup').map((m) => m.msg);

  // Trim the long pre-match odds tail: the recording spans hours (odds tick for a long time
  // before kickoff), but the demo should open just before kickoff and PLAY THE MATCH — not sit
  // in dead pre-match odds for a chunk of its runtime. Start ~3 min before the first playing status.
  const LEAD_MS = 3 * 60 * 1000;
  const kickoff =
    merged.find((m) => m.msg.type === 'status' && (m.msg.ev.phase === 'FIRST_HALF' || m.msg.ev.phase === 'SECOND_HALF')) ||
    merged.find((m) => m.msg.type === 'ledger');
  if (kickoff) merged = merged.filter((m) => m.atMs >= kickoff.atMs - LEAD_MS);

  // Re-attach the head just before the first retained message, so they're set pre-kickoff even
  // after the trim: fixtureInfo (→ __match.teams + loom theming) and the starting XI (→ the
  // stadium team-sheet). Ascending negative offsets keep them first + ordered.
  const t0 = merged[0]?.atMs ?? 0;
  const head = [
    {
      atMs: t0 - 1 - lineups.length,
      msg: {
        type: 'fixtureInfo',
        fixture: {
          home: { code: 'ESP', name: 'Spain', colors: ['#AA151B', '#F1BF00'] },
          away: { code: 'ARG', name: 'Argentina', colors: ['#75AADB', '#F6B40E'] },
        },
      },
    },
    ...lineups.map((lu, i) => ({ atMs: t0 - lineups.length + i, msg: lu })),
  ] as typeof merged;
  merged.unshift(...head);

  const counts = { score: 0, status: 0, ledger: 0, odds: 0 } as Record<FeedMsg['type'], number>;
  for (const m of merged) counts[m.msg.type] = (counts[m.msg.type] ?? 0) + 1;

  console.log(
    `[bake-esparg] fixture ${FIXTURE_ID}: score=${counts.score} status=${counts.status} ` +
      `ledger=${counts.ledger} odds=${counts.odds} lineup=${counts.lineup ?? 0} ` +
      `(roster ${roster ? `${roster.byPlayerId.size} players` : 'ABSENT'}) -> ${merged.length} total messages`,
  );

  if (merged.length === 0) {
    console.error('[bake-esparg] FATAL: zero messages baked — check FIXTURE_ID / capture paths.');
    process.exit(1);
  }
  if (counts.odds === 0) {
    console.error('[bake-esparg] FATAL: zero odds messages baked — the market would never move. Aborting write.');
    process.exit(1);
  }
  // The replay's whole purpose is to reach full time and SEAL into the keepsake. Parse errors above
  // are skipped silently, so a truncated/corrupt source file could quietly drop the terminal
  // FULL_TIME or the winning goal and still pass the counts above. Gate the write on the two facts
  // that make the hero a real sealed match: a terminal FULL_TIME status, and the real settled
  // scoreline (never publish a hero feed that can't seal or settles wrong).
  const hasFullTime = merged.some((m) => m.msg.type === 'status' && m.msg.ev.phase === 'FULL_TIME');
  if (!hasFullTime) {
    console.error('[bake-esparg] FATAL: no FULL_TIME status baked — the loom would never seal. Truncated source? Aborting write.');
    process.exit(1);
  }
  const confirmedScores = merged.filter((m) => m.msg.type === 'score' && m.msg.ev.confirmed);
  const finalScore = confirmedScores[confirmedScores.length - 1];
  const fev = finalScore && finalScore.msg.type === 'score' ? finalScore.msg.ev : null;
  if (!fev || fev.home !== EXPECTED_FINAL.home || fev.away !== EXPECTED_FINAL.away) {
    const got = fev ? `${fev.home}-${fev.away}` : 'none';
    console.error(
      `[bake-esparg] FATAL: final confirmed score ${got} != expected ${EXPECTED_FINAL.home}-${EXPECTED_FINAL.away} (ESP-ARG). Truncated source? Aborting write.`,
    );
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const body =
    `// AUTO-GENERATED by scripts/bake-esparg.ts — do not hand-edit.\n` +
    `// ESP-ARG (fixture ${FIXTURE_ID}, the final) replay, merged from ${files.map((f) => path.basename(f)).join(' + ')},\n` +
    `// baked ${new Date().toISOString()}.\n` +
    `// ${merged.length} messages (score=${counts.score} status=${counts.status} ledger=${counts.ledger} ` +
    `odds=${counts.odds} lineup=${counts.lineup ?? 0}), sorted by receivedAtMs.\n` +
    `var __DEMO_ESPARG = ${JSON.stringify(merged)};\n` +
    `if (typeof window !== 'undefined') window.__DEMO_ESPARG = __DEMO_ESPARG;\n` +
    `if (typeof module !== 'undefined' && module.exports) module.exports = { feed: __DEMO_ESPARG };\n`;
  fs.writeFileSync(OUT_FILE, body, 'utf8');
  console.log(`[bake-esparg] wrote ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / 1_000_000).toFixed(2)} MB)`);
}

main();
