/**
 * REPROJECT CHECK (eventstore-shadow's proof) — src/dev/, NEVER imported by
 * index.ts.
 *
 * Proves services/stands/src/eventstore/{load,project}.ts's offline batch
 * re-projection of a recorded capture matches the semantics of what the LIVE
 * pipeline produces for the same capture — the actual "shadow prototype
 * re-projects a recorded match" deliverable (scratchpad/research-event-
 * sourcing.md §3).
 *
 * Two independent paths over the SAME file (apps/web/public/replay/
 * arg-cpv-20260703.jsonl, fixture 18175918 — ARG–CPV, decided in extra time,
 * 3–2, chosen because it exercises goals/cards/VAR/shots/corners/subs/
 * injuries/the ET market hand-off in one capture):
 *
 *   PATH A (new, offline, what this check exists to prove): eventstore/
 *     load.ts parses the file synchronously → eventstore/project.ts folds it
 *     through a FRESH SentimentAccumulator → .crystallize() with an honest
 *     zero-fan crowd (no fans watched an offline re-projection).
 *   PATH B (ground truth): "if present, a sealed record; else drive the real
 *     server on the same file" — this check looks for a sealed record at
 *     SEALED_RECORD_PATH first (none exists yet for this fixture — see the
 *     note below on why data/sentiment/18175918.json is NOT used as one),
 *     and falls back to booting the REAL createStandsServer() (services/
 *     stands/src/server.ts, untouched) and playing the file through the
 *     REAL services/stands/src/ingest/replay.ts's startReplayIngest — the
 *     exact mechanism index.ts's REPLAY_FILE production mode uses (routeFeedMsg
 *     there IS broadcastToMatch) — then reads the resulting on-disk
 *     DATA_DIR/sentiment/<fixtureId>-*.json record. Path B never imports or
 *     calls eventstore/load.ts — an independent code path is the whole point
 *     of the proof; if Path A had a parsing bug, reusing its own output as
 *     "ground truth" would hide it.
 *
 * Why data/sentiment/18175918.json (the checked-in "crystallized vault",
 * services/stands/src/sentiment/crystallize.ts's output) is NOT treated as
 * the sealed record: it is a SEPARATE, independently-implemented offline
 * fold (crystallize.ts), not the live pipeline, and it demonstrably drifted
 * from SentimentAccumulator's current semantics — it pushes every ledger
 * re-emission unconditionally (`events.push(lm.ev)`, no id-keyed dedup),
 * where accumulator.ts's `eventsById` Map was fixed specifically to collapse
 * re-emissions ("Folded fix: the record was storing each goal 3×...").
 * Checked empirically: that file's `events` carries 14 goal-kind rows across
 * only 5 distinct goal ids (3+3+3+3+2) — the exact bug the Map dedup exists
 * to prevent. Comparing against it and excluding `events` to make the diff
 * pass would be dishonest (excluding a substantive field to paper over a
 * real discrepancy, not a legitimately-runtime one) — so this check treats
 * it as informative background, not ground truth, and drives the real
 * server instead.
 *
 * EXCLUDED FIELDS (the only ones NOT required to match, and why):
 *   · provenance.capture (fromMs/toMs) — the capture window is a property of
 *     WHEN each path happened to run this check, not of the feed's content.
 *   · provenance.recordHash — sha256 of the record minus {recordHash,
 *     anchorTxSig} (builder.ts's hashRecord) — downstream of capture/edition
 *     below, so it cannot legitimately match once those are excluded.
 *   · edition.{serial,editionSize,caption} — collectible-numbering
 *     bookkeeping, not a projection of the feed (the task names "serial").
 *   · fans.consensus.ts — MatchState.consensus() (services/stands/src/
 *     match-state.ts) stamps `ts: Date.now()` at call time; both paths
 *     construct a real (fan-less) MatchState and call .consensus() on it
 *     independently, so this is a wall-clock timestamp like the others, not
 *     feed-derived data.
 * provenance.anchorTxSig is NOT excluded — both records are asserted null
 * (below), a stronger and more honest claim than silently ignoring it: this
 * check performs ZERO real devnet transactions on either path (env below).
 * Everything else — finalScore, phasePath, decidedIn, headline, fixture,
 * market, fans, feel, events (content AND order), divergence, fingerprint,
 * nextGoal, provenance.{txlineRefs,attendeeRoot,network} — must match
 * exactly. Red/green is not the frame (this is new code, not a regression
 * gate) — the check FAILS if the two projections drift.
 *
 * Usage: tsx src/dev/reproject-check.ts (or: npm run check:reproject)
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SentimentRecord } from '@contracts/sentiment';
import { MatchState } from '../match-state';
import { fixtureInfo } from '../sentiment/teams';
import { loadMatchEvents } from '../eventstore/load';
import { projectSentiment } from '../eventstore/project';

// ── env FIRST, before any dynamic import of the server (snapshot.ts resolves
// DATA_DIR at import time — same idiom as mem-evict-check.ts / seal-consume-
// check.ts / verdict-replay-check.ts). ──────────────────────────────────────
const CHECK_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rooot-reproject-check-'));
process.env.STANDS_DATA_DIR = CHECK_DATA_DIR;
process.env.STANDS_SNAPSHOT_INTERVAL_MS = String(60 * 60_000); // no periodic churn during the check
process.env.STANDS_EVICT_SWEEP_MS = String(60 * 60_000);
process.env.SELF_PROBE_DISABLE = '1';
// Devnet isolation (same convention as mem-evict-check.ts / seal-consume-
// check.ts / next-goal-check.ts / restart-persistence-check.ts): strip
// RELAYER_KEYPAIR and point RELAYER_KEYPAIR_FILE at a nonexistent path
// BEFORE the server module loads, so crystallizeSentiment's fire-and-forget
// anchor can NEVER attempt a real devnet tx from this check (AGENTS.md — no
// real transactions from dev checks; asserted explicitly below too).
delete process.env.RELAYER_KEYPAIR;
process.env.RELAYER_KEYPAIR_FILE = path.join(CHECK_DATA_DIR, 'no-such-keypair.json');

const FIXTURE_ID = '18175918';
const STANDS_ROOT = fileURLToPath(new URL('../../', import.meta.url)); // services/stands/
const CAPTURE_FILE = path.join(STANDS_ROOT, '../../apps/web/public/replay/arg-cpv-20260703.jsonl');
const SEALED_RECORD_PATH = path.join(STANDS_ROOT, 'captures', `reproject-sealed-${FIXTURE_ID}.json`);

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? '✓' : '✗ FAIL';
  if (!cond) failures++;
  console.log(`  ${mark}  ${label}${detail ? `  — ${detail}` : ''}`);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Delete exactly the excluded fields (see file header) — never rewrite them
 * to a sentinel, so a coincidental sentinel match can never masquerade as
 * "excluded and equal." */
function scrub(rec: SentimentRecord): unknown {
  const clone = JSON.parse(JSON.stringify(rec)) as Record<string, unknown>;
  const provenance = clone.provenance as Record<string, unknown> | undefined;
  if (provenance) {
    delete provenance.capture;
    delete provenance.recordHash;
  }
  delete clone.edition;
  const fans = clone.fans as Record<string, unknown> | undefined;
  const consensus = fans?.consensus as Record<string, unknown> | undefined;
  if (consensus) delete consensus.ts;
  // THE HARVEST (2026-07-18) is CROWD-derived, not feed-derived: the scoreline
  // histogram, the night's engagement totals, nerve drift, and points are
  // folded from per-fan server tallies at the whistle. The event store this
  // re-projection replays holds the FEED only — no roots, no cheers, no
  // predictions — so these fields cannot exist on a re-projected record by
  // construction. Excluded for the same reason as the runtime fields above:
  // their absence is correct, not a drift. The feed-derived record — market,
  // moments, phases, the final score, the story — still has to match exactly.
  if (fans) {
    delete fans.scorelines;
    delete fans.engagement;
    delete fans.nerveDrift;
  }
  delete clone.points;
  return clone;
}

/** Order-independent (objects) / order-sensitive (arrays) structural diff. */
function diff(a: unknown, b: unknown, at: string, out: string[]): void {
  if (a === b) return;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    out.push(`${at}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    const aArr = Array.isArray(a) ? a : [];
    const bArr = Array.isArray(b) ? b : [];
    if (aArr.length !== bArr.length) out.push(`${at}: length ${aArr.length} !== ${bArr.length}`);
    for (let i = 0; i < Math.max(aArr.length, bArr.length); i++) diff(aArr[i], bArr[i], `${at}[${i}]`, out);
    return;
  }
  const aKeys = a as Record<string, unknown>;
  const bKeys = b as Record<string, unknown>;
  for (const k of new Set([...Object.keys(aKeys), ...Object.keys(bKeys)])) {
    diff(aKeys[k], bKeys[k], at ? `${at}.${k}` : k, out);
  }
}

function loadSealedRecord(): SentimentRecord | null {
  if (!existsSync(SEALED_RECORD_PATH)) return null;
  try {
    return JSON.parse(readFileSync(SEALED_RECORD_PATH, 'utf8')) as SentimentRecord;
  } catch {
    return null;
  }
}

/** Path B, fallback branch: drive the REAL server over the REAL replay
 * ingest (not this feature's own load.ts) and read the record it
 * crystallizes to disk — the "pattern from other checks" (full-replay-
 * check.ts / verdict-replay-check.ts: dynamic-import after env, boot
 * in-process, no httpServer.listen() needed since broadcastToMatch's
 * side effects don't depend on an open port). */
async function driveRealServer(): Promise<SentimentRecord> {
  const { createStandsServer } = await import('../server');
  const { startReplayIngest } = await import('../ingest/replay');
  const { broadcastToMatch, registry } = createStandsServer();

  await new Promise<void>((resolve) => {
    startReplayIngest({
      file: CAPTURE_FILE,
      fixtureId: FIXTURE_ID,
      // the file spans ~8.6h of real inter-message deltas (max single gap
      // ~36min); at this speed every delay collapses to low-single-digit ms,
      // well under playFrom's 5s cap, so the whole replay finishes in
      // roughly the time it takes Node to run ~2100 chained setTimeouts.
      speed: 1_000_000,
      onFeedMsg: (msg) => broadcastToMatch(FIXTURE_ID, msg),
      onDone: () => resolve(),
    });
  });
  // THE SEAL is deferred (Codex pre-match review, findings 1+3): crystallize
  // fires once the full-time reaction window (25s) closes, so the record lands
  // ~28s after the replay's whistle rather than inside its dispatch tick.
  const dir = path.join(CHECK_DATA_DIR, 'sentiment');
  const prefix = `${FIXTURE_ID}-`;
  const sealed = (): boolean => {
    try {
      return readdirSync(dir).some((f) => f.startsWith(prefix) && f.endsWith('.json'));
    } catch {
      return false;
    }
  };
  const sealBy = Date.now() + 60_000;
  while (!sealed() && Date.now() < sealBy) await sleep(500);
  await sleep(200); // settle margin
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.json'));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    throw new Error(`live server never crystallized a sentiment record for ${FIXTURE_ID} — the replay never reached FULL_TIME`);
  }
  files.sort((f1, f2) => Number(f2.slice(prefix.length, -'.json'.length)) - Number(f1.slice(prefix.length, -'.json'.length)));
  const record = JSON.parse(readFileSync(path.join(dir, files[0]!), 'utf8')) as SentimentRecord;
  registry.stop();
  return record;
}

async function main(): Promise<void> {
  console.log(`[reproject-check] fixture ${FIXTURE_ID} — ${path.basename(CAPTURE_FILE)}`);

  /* ── Path A: the new offline event-store path ──────────────────────── */
  const fixture = fixtureInfo(FIXTURE_ID);
  check('fixture identity known (services/stands/src/sentiment/teams.ts)', !!fixture, JSON.stringify(fixture));
  if (!fixture) {
    console.log('\nFATAL — cannot proceed without fixture identity\n');
    process.exit(1);
    return;
  }
  const events = loadMatchEvents(CAPTURE_FILE, FIXTURE_ID);
  check('eventstore/load.ts loaded a non-trivial event stream', events.length > 100, `events=${events.length}`);
  const accA = projectSentiment(events, FIXTURE_ID, fixture);
  // a real (fan-less) MatchState, reused exactly — see eventstore/reproject.ts's
  // identical construction and its doc comment for why this isn't `consensus: null`.
  const crowdA = new MatchState(FIXTURE_ID);
  crowdA.lockPredictions();
  const recordA = JSON.parse(
    JSON.stringify(
      accA.crystallize(
        { consensus: crowdA.consensus(), rooted: crowdA.counts() },
        { serial: 1, editionSize: null, caption: FIXTURE_ID },
      ),
    ),
  ) as SentimentRecord;

  /* ── Path B: ground truth (sealed record if present, else the real server) ── */
  const sealed = loadSealedRecord();
  const recordB = sealed ?? (await driveRealServer());
  console.log(`[reproject-check] ground truth source: ${sealed ? `sealed record (${SEALED_RECORD_PATH})` : 'drove the real server (no sealed record on disk yet)'}`);

  check('finalScore is non-trivial on both records (the replay actually played goals)', recordA.finalScore.home + recordA.finalScore.away > 0 && recordB.finalScore.home + recordB.finalScore.away > 0, `A=${JSON.stringify(recordA.finalScore)} B=${JSON.stringify(recordB.finalScore)}`);
  check('provenance.anchorTxSig is null on the offline (Path A) record — no anchoring/minting/broadcasting, per the task fence', recordA.provenance.anchorTxSig === null);
  check('provenance.anchorTxSig is null on the ground-truth (Path B) record — devnet isolation held, zero real tx leaked', recordB.provenance.anchorTxSig === null);

  const diffs: string[] = [];
  diff(scrub(recordA), scrub(recordB), '', diffs);
  check(
    're-projected record MATCHES the live pipeline, modulo the runtime fields {provenance.capture, provenance.recordHash, edition} and the CROWD-derived harvest {fans.scorelines, fans.engagement, fans.nerveDrift, points} (see scrub()) — every feed-derived field must match exactly',
    diffs.length === 0,
    diffs.length ? `${diffs.length} diff(s), first 10:\n      ${diffs.slice(0, 10).join('\n      ')}` : 'exact match on every other field',
  );

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  try {
    rmSync(CHECK_DATA_DIR, { recursive: true, force: true });
  } catch {
    /* best-effort cleanup */
  }
  process.exit(failures === 0 ? 0 : 1);
}

const watchdog = setTimeout(() => {
  console.error('[reproject-check] watchdog: hung for 60s, forcing exit');
  process.exit(1);
}, 60_000);

main()
  .then(() => clearTimeout(watchdog))
  .catch((err) => {
    clearTimeout(watchdog);
    console.error('[reproject-check] FATAL', err);
    process.exit(1);
  });
