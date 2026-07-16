/**
 * ROOOT bake-engarg — bakes the ENG-ARG recording into a client-side,
 * serverless demo feed: apps/web/public/plate/demo-engarg.js.
 *
 * Modeled EXACTLY on scripts/bake-demo.ts (the SUI-COL bake) — see that
 * file's header for the full rationale on why a bake script exists at all
 * (odds + scores arrive on separate TxLINE streams and must be merged into
 * one FeedMsg timeline). The one structural difference: this match's capture
 * was recorded across FOUR files, not two — the recorder appears to have
 * reconnected/rotated at the interval break, splitting both the odds stream
 * and the scores stream into a first-half file and a second-half ("-2h")
 * file. All four get the same bakeFile() treatment and are merged + sorted
 * by receivedAtMs before anything else happens:
 *   fixtures/live-eng-arg/odds-engarg.jsonl      (odds, ~18:54–19:51Z)
 *   fixtures/live-eng-arg/odds-engarg-2h.jsonl    (odds, ~19:54–21:05Z)
 *   fixtures/live-eng-arg/scores-engarg.jsonl     (scores, ~18:54–19:51Z)
 *   fixtures/live-eng-arg/scores-engarg-2h.jsonl  (scores, ~19:54–21:05Z)
 *
 * Verified (see the data lane's investigation before writing this script):
 * every line across all four files already carries FixtureId 18241006 only
 * (no cross-talk from other matches, unlike the SUI-COL capture) — the
 * FIXTURE_ID filter in bakeFile() is therefore a no-op safety net here, kept
 * for parity with the template. Participant1IsHome is true throughout (ENG
 * is Participant1 = home), matching fixture.json's home/away assignment.
 * The scores-2h file's tail carries the match's only `status` action with
 * StatusId 5 (mapLiveStatusId → FULL_TIME) at receivedAtMs 1784149378210,
 * followed only by two harmless `clock_adjustment` actions (not a
 * status/kickoff action — parseStatusMessage returns null for it) and then
 * heartbeats to the end of the recording — so FULL_TIME is expected to be
 * both present and the LAST status message in the merged timeline.
 *
 * Output: apps/web/public/plate/demo-engarg.js —
 *   var __DEMO_ENGARG = [ { atMs, msg }, ... ];  (msg is a contracts/feed.ts FeedMsg)
 *   window.__DEMO_ENGARG = __DEMO_ENGARG;                 (browser)
 *   module.exports = { feed: __DEMO_ENGARG };             (Node)
 *
 * Run: npx tsx scripts/bake-engarg.ts
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

/** ENG-ARG — fixture 18241006 (see docs/DATA.md / apps/web/public/fixture.json). */
const FIXTURE_ID = 18241006;
const SCORES_FILE = path.join(ROOT, 'fixtures/live-eng-arg/scores-engarg.jsonl');
const SCORES_FILE_2H = path.join(ROOT, 'fixtures/live-eng-arg/scores-engarg-2h.jsonl');
const ODDS_FILE = path.join(ROOT, 'fixtures/live-eng-arg/odds-engarg.jsonl');
const ODDS_FILE_2H = path.join(ROOT, 'fixtures/live-eng-arg/odds-engarg-2h.jsonl');
// The one-shot `Action:"lineups"` envelope, recovered from the scores snapshot by
// scripts/recover-engarg-lineups.ts (the recording started after it broadcast). Fills
// the stadium TEAM SHEET and names the whistle/bench events. Gitignored like the rest.
const LINEUPS_FILE = path.join(ROOT, 'fixtures/live-eng-arg/lineups-engarg.jsonl');
const OUT_FILE = path.join(ROOT, 'apps/web/public/plate/demo-engarg.js');

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
    // the same way the live server does. eng-arg: Participant1 = ENG = home (confirmed via
    // Participant1IsHome:true in the raw capture), so p1IsHome = true.
    const sp = parseSpell(raw, at, 'replay', true);
    if (sp) out.push({ atMs: at, msg: { type: 'spell', fixtureId: String(FIXTURE_ID), spell: sp } });
    // the starting XI (both squads named before kickoff) → the stadium's team-sheet card.
    const lu = parseLineups(raw);
    if (lu && lu.lineup) out.push({ atMs: at, msg: { type: 'lineup', fixtureId: String(lu.fixtureId), lineup: lu.lineup } });
  }
  return out;
}

/**
 * Build the fixture roster from the recovered lineups file — the byPlayerId map
 * that names goal/card/sub/injury rows. Returns undefined if the file is absent
 * (recovery not run) or carries no parseable lineups, in which case the bake still
 * succeeds with honestly-nameless events (the same degrade-gracefully stance the
 * live server's seedSnapshot takes). Never fabricates — the roster is only ever
 * the real wire's `Action:"lineups"` envelope run through parseLineups.
 */
function buildRoster(file: string): FixtureRoster | undefined {
  if (!fs.existsSync(file)) {
    console.warn(`[bake-engarg] no lineups file at ${file} — events stay nameless (run scripts/recover-engarg-lineups.ts).`);
    return undefined;
  }
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
    const raw = typeof o.data === 'string' ? o.data : JSON.stringify(o.data);
    const roster = parseLineups(raw);
    if (roster && roster.fixtureId === FIXTURE_ID) return roster;
  }
  console.warn(`[bake-engarg] lineups file ${file} carried no parseable lineups envelope — events stay nameless.`);
  return undefined;
}

function main(): void {
  // Build the roster ONCE from the recovered lineups, then thread it through every
  // ledger parse so goals/cards/subs/injuries resolve real names from the same wire.
  const roster = buildRoster(LINEUPS_FILE);
  const scores = bakeFile(SCORES_FILE, roster);
  const scores2h = bakeFile(SCORES_FILE_2H, roster);
  const odds = bakeFile(ODDS_FILE, roster);
  const odds2h = bakeFile(ODDS_FILE_2H, roster);
  // Bake the lineups file too so a {type:'lineup'} message exists for the head to
  // re-attach → the stadium TEAM SHEET fills. (roster passed for parity; no ledger there.)
  const lineupMsgs = bakeFile(LINEUPS_FILE, roster);
  let merged = [...scores, ...scores2h, ...odds, ...odds2h, ...lineupMsgs].sort((a, b) => a.atMs - b.atMs);

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
          home: { code: 'ENG', name: 'England', colors: ['#FFFFFF', '#CF081F'] },
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
    `[bake-engarg] fixture ${FIXTURE_ID}: score=${counts.score} status=${counts.status} ` +
      `ledger=${counts.ledger} odds=${counts.odds} lineup=${counts.lineup ?? 0} ` +
      `(roster ${roster ? `${roster.byPlayerId.size} players` : 'ABSENT'}) -> ${merged.length} total messages`,
  );

  if (merged.length === 0) {
    console.error('[bake-engarg] FATAL: zero messages baked — check FIXTURE_ID / fixture paths.');
    process.exit(1);
  }
  if (counts.odds === 0) {
    console.error('[bake-engarg] FATAL: zero odds messages baked — the market would never move. Aborting write.');
    process.exit(1);
  }
  // The replay's whole purpose is to reach full time and SEAL into the keepsake. Parse errors above
  // are skipped silently, so a truncated/corrupt source file could quietly drop the terminal
  // FULL_TIME or the winning goal and still pass the counts above. Gate the write on the two facts
  // that make the hero a real sealed match: a terminal FULL_TIME status, and the real settled
  // scoreline (Codex review — never publish a hero feed that can't seal or settles wrong).
  const hasFullTime = merged.some((m) => m.msg.type === 'status' && m.msg.ev.phase === 'FULL_TIME');
  if (!hasFullTime) {
    console.error('[bake-engarg] FATAL: no FULL_TIME status baked — the loom would never seal. Truncated source? Aborting write.');
    process.exit(1);
  }
  const EXPECTED_FINAL = { home: 1, away: 2 }; // ENG 1–2 ARG — the real, confirmed result of fixture 18241006
  const confirmedScores = merged.filter((m) => m.msg.type === 'score' && m.msg.ev.confirmed);
  const finalScore = confirmedScores[confirmedScores.length - 1];
  const fev = finalScore && finalScore.msg.type === 'score' ? finalScore.msg.ev : null;
  if (!fev || fev.home !== EXPECTED_FINAL.home || fev.away !== EXPECTED_FINAL.away) {
    const got = fev ? `${fev.home}-${fev.away}` : 'none';
    console.error(`[bake-engarg] FATAL: final confirmed score ${got} != expected ${EXPECTED_FINAL.home}-${EXPECTED_FINAL.away} (ENG-ARG). Truncated source? Aborting write.`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const body =
    `// AUTO-GENERATED by scripts/bake-engarg.ts — do not hand-edit.\n` +
    `// ENG-ARG (fixture ${FIXTURE_ID}) replay, merged from fixtures/live-eng-arg/scores-engarg.jsonl\n` +
    `// + scores-engarg-2h.jsonl + odds-engarg.jsonl + odds-engarg-2h.jsonl + lineups-engarg.jsonl, baked ${new Date().toISOString()}.\n` +
    `// ${merged.length} messages (score=${counts.score} status=${counts.status} ledger=${counts.ledger} ` +
    `odds=${counts.odds} lineup=${counts.lineup ?? 0}), sorted by receivedAtMs.\n` +
    `var __DEMO_ENGARG = ${JSON.stringify(merged)};\n` +
    `if (typeof window !== 'undefined') window.__DEMO_ENGARG = __DEMO_ENGARG;\n` +
    `if (typeof module !== 'undefined' && module.exports) module.exports = { feed: __DEMO_ENGARG };\n`;
  fs.writeFileSync(OUT_FILE, body, 'utf8');
  console.log(`[bake-engarg] wrote ${OUT_FILE} (${(fs.statSync(OUT_FILE).size / 1_000_000).toFixed(2)} MB)`);
}

main();
