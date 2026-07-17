/**
 * Restart continuity: every 30s (STANDS_SNAPSHOT_INTERVAL_MS), dump a small
 * JSON snapshot of match state (rooted anonId->side, room membership,
 * predictions, predictLocked, verdicts, felt-moment history, per-fan night
 * stats) PLUS one registry-global field (THE FAN SERIAL — anonId->fanNo, not
 * per-match) to disk; on boot, reload it if present — volume-ready
 * (STANDS_DATA_DIR / a mounted /data survives restarts/redeploys; /tmp does
 * not). Weekend scale — this is not meant to survive a crash mid-write, just
 * a clean restart/redeploy without losing who-rooted-for-whom, who-predicted-
 * what, who-already-saw-their-verdict, each fan's accumulated card (THE
 * STANDS CARD substrate — write-only tonight, see match-state.ts's FanStats
 * doc comment), and each fan's global first-come serial (design/
 * archive/design-docs-consumed/design/HANDOFF-2026-07-10-fan-serial.md, see MatchRegistry.fanNoFor).
 *
 * Deliberately NOT snapshotting roar/pulse rolling counters — those are
 * seconds-old by nature and honestly should reset to silence on restart
 * rather than resurrect stale decay state. fanStats.watchMs is the one
 * exception to "live/stateful things reset": match-state.ts's snapshot()
 * folds every OPEN watch-time session into watchMs (and checkpoints its
 * start to now) before this module ever serializes it, so the accumulated
 * total survives even though the live session itself — like presence/roar/
 * pulse — is not persisted.
 */
import { accessSync, constants as fsConstants, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { NextGoalVerdictMsg, PredictVerdictMsg, Side } from '@contracts/crowd';
import type { MomentFeeling, SentimentRecord } from '@contracts/sentiment';
import type { FanStats, MatchState } from './match-state';

/** One resolved NEXT GOAL cycle row (contracts/sentiment.ts nextGoal doc). */
type NextGoalRow = NonNullable<SentimentRecord['nextGoal']>[number];

/**
 * Data dir resolution (Task 3 — volume-ready): STANDS_DATA_DIR env wins
 * outright when set (an explicit operator choice); else /data if it exists
 * AND is writable (the Fly volume mount); else /tmp (ephemeral — a restart
 * will NOT persist, but the process still boots and runs). Exactly one plain
 * log line, no secrets, so a deploy's logs say which mode it's running in.
 */
function resolveDataDir(): string {
  const envDir = process.env.STANDS_DATA_DIR;
  if (envDir) {
    console.log(`[stands:datadir] using ${envDir} (STANDS_DATA_DIR env)`);
    return envDir;
  }
  try {
    accessSync('/data', fsConstants.W_OK);
    console.log('[stands:datadir] using /data (exists + writable — a mounted volume)');
    return '/data';
  } catch {
    console.log('[stands:datadir] using /tmp (no STANDS_DATA_DIR set, /data absent or not writable — restarts will NOT persist)');
    return '/tmp';
  }
}

export const DATA_DIR = resolveDataDir();

export const SNAPSHOT_PATH = process.env.STANDS_SNAPSHOT_PATH ?? path.join(DATA_DIR, 'rooot-stands-snapshot.json');

// Ensure the snapshot's directory exists ONCE at startup (a fresh volume mount
// or a custom STANDS_DATA_DIR may not have it yet) — writeSnapshot used to
// mkdir on every periodic write (every 30s, forever), which is needless
// syscall churn once the dir is known to exist. Best-effort: a failure here
// must not block boot (readSnapshot/writeSnapshot both already tolerate a
// missing/bad dir on their own, logging rather than throwing).
try {
  mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
} catch (err) {
  console.warn(`[stands:snapshot] could not create data dir for ${SNAPSHOT_PATH}: ${String(err)}`);
}

/** Fix 3 (review M1): a malformed/empty STANDS_SNAPSHOT_INTERVAL_MS (e.g. "")
 * makes Number(...) yield NaN, and setInterval coerces NaN to ~1ms — disk
 * hammering. Clamp: non-finite or under 1s falls back to the 30s default;
 * any finite value >= 1000 is trusted as-is (a deliberately fast interval for
 * local dev/testing is still allowed, just not sub-1s). */
function resolveSnapshotIntervalMs(): number {
  const raw = Number(process.env.STANDS_SNAPSHOT_INTERVAL_MS ?? 30_000);
  return Number.isFinite(raw) && raw >= 1000 ? raw : 30_000;
}

export const SNAPSHOT_INTERVAL_MS = resolveSnapshotIntervalMs();

/** Bump when the persisted shape changes. applySnapshot stays tolerant of a
 * file with a lower (or absent = v1) version — every v2+ field is optional on
 * read and defaults rather than fabricates. v3 adds fanStats (THE STANDS CARD
 * substrate) — absent on a v1/v2 file, which defaults to no stats for every
 * fan, never a fabricated zeroed row. v4 adds `fans` (THE FAN SERIAL,
 * archive/design-docs-consumed/design/HANDOFF-2026-07-10-fan-serial.md) — a top-level, REGISTRY-GLOBAL
 * field (not per-match, unlike everything else here) — absent on a v1/v2/v3
 * file, which defaults to an empty registry: numbering then starts fresh at
 * 1, never fabricated retroactively for fans who connected before this
 * shipped. v5 adds `openedTriggerIds` (per match) — post-mortem fix:
 * server.ts's moment-open dedup Set was in-memory-only, so a restart used to
 * re-arm it and let a re-dispatched historical trigger (TxLINE's
 * seedSnapshot on live boot, or a REPLAY_FILE restart replaying from 0)
 * re-open an already-run drama moment — a "ghost window" whose react a
 * connected fan could double-count into their PERSISTED fanStats.reacts.
 * Absent on a v1/v2/v3/v4 file — applySnapshot defaults to none, never
 * fabricates. Same shape/tolerance discipline as `resolved` below. v6 adds
 * `nextGoalOpen` + `nextGoalVerdicts` (per match) — NEXT GOAL, the in-game
 * call (docs/BACKLOG-full-version-and-deferred-ideas.md §2): a fan's open
 * call for the current cycle, and their most recent resolved verdict.
 * Absent on a v1..v5 file — applySnapshot defaults to none, never
 * fabricates. fanStats rows also gain `nextGoalCalls`/`nextGoalCorrect`
 * counters as of v6 — absent on an older row, MatchState.restoreFanStats
 * defaults both to 0 (the feature didn't exist yet when that row was
 * written), same tolerance discipline as `fanStats` itself at v3. v6 (never
 * shipped before the whole family landed on one branch — one version covers
 * it) ALSO adds `nextGoalResolvedIds` (per match; review Critical 2 — the
 * NEXT-GOAL resolution dedup Set, same seedSnapshot/REPLAY-from-line-0
 * re-dispatch bug class as openedTriggerIds at v5) and `nextGoalRows` (per
 * match; the SentimentRecord's resolved-cycle rows riding the accumulator,
 * same reason moments do at v2). All absent on any older file — applySnapshot
 * defaults every one to none, never fabricates.
 * `finalScore` (per match) — the resolution-time final score predictLifecycle
 * graded the verdicts against (review merge-gate fix: `resolvedMatches`
 * restored from the snapshot but the score cache was memory-only, so a fan's
 * FIRST post-restart claim on an already-resolved match minted a false
 * "Full-time 0–0" scarf whose score contradicted its own verdict attribute).
 * Absent on a v1..v5 file — applySnapshot restores none, and a resolved match
 * with no known score REFUSES to mint rather than fabricating 0–0 (server.ts
 * currentScoreSnapshot + handleSeatClaim). */
export const SNAPSHOT_VERSION = 6;

interface SnapshotRoomMember {
  anonId: string;
  name: string;
  side: Side;
}

interface SnapshotMatch {
  matchId: string;
  rooted: Array<[string, Side]>;
  rooms: Array<{ roomId: string; members: SnapshotRoomMember[] }>;
  /** v2+. Absent on a v1 file — applySnapshot defaults to none, never fabricates. */
  predictions?: Array<[string, { home: number; away: number; atMs: number; conv?: number }]>;
  predictLocked?: boolean;
  /** v2+. Present only for fans whose prediction was actually graded at FULL_TIME. */
  verdicts?: Array<[string, PredictVerdictMsg]>;
  /** v2+. The sentiment accumulator's felt-moment history for this match
   * (contracts/sentiment.ts MomentFeeling) — so a full-time crystallization
   * after a mid-match restart still carries moments felt before it. */
  moments?: MomentFeeling[];
  /** v2+. Explicit "this match already resolved (crystallize + anchor already
   * fired in a prior process)" flag — post-mortem fix: resolvedMatches is
   * in-memory-only in server.ts, so a restart used to re-arm it and let a
   * replayed FULL_TIME (live seedSnapshot OR a REPLAY_FILE restart, which
   * always plays from 0) double-fire a REAL devnet anchor tx + a duplicate
   * SentimentRecord for the same match. Absent on an older file, or for a
   * match resolved with zero predictions on THIS field alone — applySnapshot
   * also derives resolved-ness from a non-empty verdicts map as a tolerant
   * fallback. */
  resolved?: boolean;
  /** v3+. Absent on a v1/v2 file — applySnapshot defaults to none for every
   * fan, never fabricates a zeroed row. THE STANDS CARD substrate
   * (match-state.ts's FanStats doc comment) — write-only tonight, no wire
   * message carries this yet. */
  fanStats?: Array<[string, FanStats]>;
  /** v5+. Absent on a v1/v2/v3/v4 file — applySnapshot defaults to none,
   * never fabricates. server.ts's moment-open dedup Set (keyed by ledger/
   * status trigger sourceId — a goal's ledger event id, `${matchId}:ft` for
   * full-time, etc.) for THIS match — see the SNAPSHOT_VERSION doc comment
   * above for the "ghost window" bug this closes. Mirrors `resolved` above:
   * per-match, additive, tolerant. */
  openedTriggerIds?: string[];
  /** v6+. IN-GAME NEXT GOAL (docs/BACKLOG-full-version-and-deferred-ideas.md
   * §2, SNAPSHOT_VERSION doc comment above) — a fan's open call for the
   * current cycle. Absent on a v1..v5 file — applySnapshot defaults to none. */
  nextGoalOpen?: Array<[string, { call: 'home' | 'away' | 'none'; marketAtCall: { home: number; draw: number; away: number } | null; atMs: number; minute?: number | null }]>;
  /** v6+. A fan's most recent resolved NEXT GOAL verdict — mirrors `verdicts`
   * above. Absent on a v1..v5 file — applySnapshot defaults to none. */
  nextGoalVerdicts?: Array<[string, NextGoalVerdictMsg]>;
  /** v6+. server.ts's NEXT-GOAL resolution dedup Set for this match (review
   * Critical 2 — a confirmed goal's ledger event id, plus a
   * `${matchId}:nextgoal:ft` synthetic for full-time). Mirrors
   * `openedTriggerIds` above exactly: per-match, additive, tolerant, restored
   * BEFORE ingest starts so a seedSnapshot/replay re-dispatch of an
   * already-resolved goal can never resolve a fresh cycle's open calls. */
  nextGoalResolvedIds?: string[];
  /** v6+. The SentimentRecord's resolved NEXT GOAL cycle rows for this match
   * (contracts/sentiment.ts nextGoal doc) — ride the snapshot for the same
   * reason `moments` do: a full-time crystallization after a mid-match
   * restart must still carry cycles resolved before it. */
  nextGoalRows?: NextGoalRow[];
  /** v6+. The REAL final score this match resolved with — captured in
   * predictLifecycle's FULL_TIME branch from the same fh/fa the verdicts were
   * graded against, so a restored process's scarf mints can never contradict
   * the restored verdicts. Absent on a v1..v5 file (or a never-resolved
   * match) — applySnapshot restores none, never fabricates; server-side, a
   * resolved match with no known score refuses to mint (SNAPSHOT_VERSION doc
   * comment above). */
  finalScore?: { home: number; away: number };
}

/** v4+. THE FAN SERIAL (archive/design-docs-consumed/design/HANDOFF-2026-07-10-fan-serial.md) — a
 * REGISTRY-GLOBAL counter + map (not per-match; lives at the top level of
 * SnapshotFile, not inside SnapshotMatch — see the field below). `nextFanNo`
 * is persisted explicitly for a human reading the file, but applySnapshot
 * treats it as a tolerant floor, not the sole truth: MatchRegistry.
 * restoreFanSerial always re-derives at least `max(numbers) + 1`, so a
 * corrupt/stale `nextFanNo` on disk can never cause a serial to be reissued. */
interface SnapshotFans {
  nextFanNo: number;
  /** anonId -> fanNo, global first-come ordinal. */
  numbers: Array<[string, number]>;
}

interface SnapshotFile {
  version?: number; // absent = v1
  savedAtMs: number;
  matches: SnapshotMatch[];
  /** v4+. Absent on a v1/v2/v3 file — applySnapshot leaves the registry
   * empty (numbering starts fresh at 1), never fabricates a fan's serial
   * retroactively. */
  fans?: SnapshotFans;
}

/**
 * Atomic write (Critical fix — post-mortem: `writeFileSync(SNAPSHOT_PATH,…)`
 * truncated the file in place, so a SIGKILL mid-write left invalid JSON on
 * disk and the NEXT boot's readSnapshot() silently returned null — losing
 * every previously-good persisted match). Write to `${filePath}.tmp` first,
 * then rename(2) over the target: rename is atomic on POSIX within the same
 * directory/filesystem, so a kill at ANY point can only ever leave the OLD
 * complete file or the NEW complete file at `filePath` — never a torn one.
 * Exported so server.ts's sentiment-record writes use the same pattern.
 */
export function writeFileAtomic(filePath: string, data: string): void {
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, data);
  renameSync(tmpPath, filePath);
}

export function writeSnapshot(
  matches: Map<string, MatchState>,
  getMoments?: (matchId: string) => MomentFeeling[],
  isResolved?: (matchId: string) => boolean,
  fanSerial?: { nextFanNo: number; numbers: Array<[string, number]> },
  /** v5 — server.ts's moment-open dedup Set for this match (SNAPSHOT_VERSION
   * doc comment above: the "ghost window" fix). Optional/undefined-tolerant,
   * same as getMoments/isResolved above. */
  getOpenedTriggerIds?: (matchId: string) => string[],
  /** v6 — server.ts's NEXT-GOAL resolution dedup Set (review Critical 2).
   * Optional/undefined-tolerant, mirrors getOpenedTriggerIds exactly. */
  getNextGoalResolvedIds?: (matchId: string) => string[],
  /** v6 — the accumulator's resolved NEXT GOAL cycle rows (the record's
   * nextGoal layer). Optional/undefined-tolerant, mirrors getMoments. */
  getNextGoalRows?: (matchId: string) => NextGoalRow[],
  /** v6 — the resolution-time final score for this match, or null when it
   * never resolved (the field is then omitted, never zero-filled). Same
   * optional-hook discipline as the rest. */
  getFinalScore?: (matchId: string) => { home: number; away: number } | null,
): void {
  const file: SnapshotFile = {
    version: SNAPSHOT_VERSION,
    savedAtMs: Date.now(),
    matches: Array.from(matches.values()).map((m) => {
      const snap = m.snapshot();
      return {
        matchId: m.matchId,
        rooted: snap.rooted,
        rooms: Array.from(m.rooms.entries()).map(([roomId, room]) => ({
          roomId,
          members: room.toWireMembers().map(({ anonId, name, side }) => ({ anonId, name, side })),
        })),
        predictions: snap.predictions,
        predictLocked: snap.predictLocked,
        verdicts: snap.verdicts,
        moments: getMoments ? getMoments(m.matchId) : [],
        resolved: isResolved ? isResolved(m.matchId) : undefined,
        fanStats: snap.fanStats,
        openedTriggerIds: getOpenedTriggerIds ? getOpenedTriggerIds(m.matchId) : [],
        nextGoalOpen: snap.nextGoalOpen,
        nextGoalVerdicts: snap.nextGoalVerdicts,
        nextGoalResolvedIds: getNextGoalResolvedIds ? getNextGoalResolvedIds(m.matchId) : [],
        nextGoalRows: getNextGoalRows ? getNextGoalRows(m.matchId) : [],
        finalScore: getFinalScore ? getFinalScore(m.matchId) ?? undefined : undefined,
      };
    }),
    fans: fanSerial,
  };
  try {
    writeFileAtomic(SNAPSHOT_PATH, JSON.stringify(file));
  } catch (err) {
    console.warn(`[stands:snapshot] write failed: ${String(err)}`);
  }
}

/**
 * Best-effort read; returns null if absent/corrupt (never throws — a bad
 * snapshot must not block boot). Logs which case it was — an operator
 * watching Fly logs must be able to tell "first-ever boot, nothing to
 * restore" apart from "there WAS state and we couldn't read it" (Important
 * fix — this used to be silent for both, e.g. a torn write from the old
 * non-atomic writeFileSync looked identical to a fresh volume).
 */
export function readSnapshot(): SnapshotFile | null {
  let raw: string;
  try {
    raw = readFileSync(SNAPSHOT_PATH, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log(`[stands:snapshot] no snapshot file at ${SNAPSHOT_PATH} — fresh start`);
    } else {
      console.warn(`[stands:snapshot] could not read ${SNAPSHOT_PATH}: ${String(err)} — starting fresh`);
    }
    return null;
  }
  try {
    return JSON.parse(raw) as SnapshotFile;
  } catch (err) {
    // never log `raw` (could be arbitrarily large / in principle carry stray
    // secrets if something else ever wrote to this path) — the path alone is
    // enough for an operator to go look.
    console.warn(`[stands:snapshot] CORRUPT snapshot at ${SNAPSHOT_PATH} (${String(err)}) — starting fresh; previously persisted state is lost`);
    return null;
  }
}

/**
 * Rehydrate rooted counts, room membership, predictions, the predict lock,
 * verdicts, and each fan's accumulated card (not presence/roar/pulse/live
 * watch-time sessions — those are live-connection-only; a restored fan's
 * watchMs is exactly the persisted total, with no session fabricated until a
 * real new connect happens post-restart — see match-state.ts's FanStats doc).
 * Tolerant of a v1 file (or a v2/v3 file with a match entry missing some of
 * the newer fields): every v2+ field defaults to its honest empty state
 * rather than being fabricated. `restoreMoments`, if given, is called once per match
 * that actually has moment history to restore (the caller — server.ts — owns
 * the sentiment accumulators, snapshot.ts doesn't).
 *
 * `markResolved`, if given, is called once per match that was already
 * resolved (FULL_TIME crystallize + anchor already fired) in a PRIOR process
 * — so the caller (server.ts, via registry.ts) can pre-arm its resolvedMatches
 * guard BEFORE any live/replay ingest starts, and a re-delivered FULL_TIME
 * after a restart becomes a no-op instead of double-firing a real devnet
 * anchor tx + a duplicate SentimentRecord (Critical fix — post-mortem).
 * Prefers the explicit v2+ `resolved` flag; tolerant fallback for an older
 * file (or the rare match that reached FULL_TIME with zero predictions, so
 * `resolved` may be absent on a pre-this-fix snapshot) is "restored with any
 * verdicts at all".
 *
 * `restoreFanSerial`, if given, is called ONCE (not per-match — THE FAN
 * SERIAL is registry-global, archive/design-docs-consumed/design/HANDOFF-2026-07-10-fan-serial.md) when
 * `snap.fans` is present. Absent on a v1/v2/v3 file — the registry stays at
 * its default empty state (numbering starts fresh at 1), never fabricated.
 *
 * `restoreOpenedTriggers`, if given, is called once per match that has
 * persisted trigger ids (v5+ — SNAPSHOT_VERSION doc comment above) — so the
 * caller (server.ts, via registry.ts) can pre-arm its openedTriggerIds dedup
 * guard for THAT match BEFORE any live/replay ingest starts, exactly the same
 * boot-ordering guarantee `markResolved` relies on above: registry.loadSnapshot()
 * runs synchronously, before index.ts wires up TXLINE/REPLAY ingest, so the
 * very first re-dispatched historical trigger is already deduped. Absent on
 * an older file (or a match with no persisted triggers) — never fabricated.
 *
 * `restoreNextGoalResolved` (v6+, review Critical 2) mirrors
 * `restoreOpenedTriggers` exactly for the NEXT-GOAL resolution dedup Set;
 * `restoreNextGoalRows` (v6+) mirrors `restoreMoments` exactly for the
 * record's resolved-cycle rows. Both absent on any older file — no-ops,
 * never fabricated.
 */
export function applySnapshot(
  snap: SnapshotFile,
  getOrCreate: (matchId: string) => MatchState,
  restoreMoments?: (matchId: string, moments: MomentFeeling[]) => void,
  markResolved?: (matchId: string) => void,
  restoreFanSerial?: (nextFanNo: number, numbers: Array<[string, number]>) => void,
  restoreOpenedTriggers?: (matchId: string, triggerIds: string[]) => void,
  restoreNextGoalResolved?: (matchId: string, resolvedIds: string[]) => void,
  restoreNextGoalRows?: (matchId: string, rows: NextGoalRow[]) => void,
  /** v6 — re-arm the resolution-time final score for a match restored with one
   * (SNAPSHOT_VERSION doc comment above). Only called for a genuinely numeric
   * persisted pair — an older file (or a never-resolved match) restores
   * nothing, and the mint path then refuses rather than fabricating 0–0. */
  restoreFinalScore?: (matchId: string, score: { home: number; away: number }) => void,
): void {
  for (const sm of snap.matches) {
    const match = getOrCreate(sm.matchId);
    for (const [anonId, side] of sm.rooted ?? []) match.root(anonId, side);
    for (const sr of sm.rooms ?? []) {
      const room = match.getOrCreateRoom(sr.roomId);
      for (const member of sr.members ?? []) {
        room.join({ anonId: member.anonId, name: member.name, side: member.side, present: false, ws: null });
      }
    }
    for (const [anonId, p] of sm.predictions ?? []) match.restorePrediction(anonId, p.home, p.away, p.atMs, (p as { conv?: number }).conv);
    if (sm.predictLocked) match.lockPredictions();
    for (const [anonId, v] of sm.verdicts ?? []) match.restoreVerdict(anonId, v);
    for (const [anonId, fs] of sm.fanStats ?? []) match.restoreFanStats(anonId, fs);
    // NEXT GOAL (in-game, v6+) — a fan's open call for the current cycle +
    // their most recent resolved verdict. Absent on a v1..v5 file — both
    // loops are simply no-ops, never fabricating either.
    for (const [anonId, oc] of sm.nextGoalOpen ?? []) match.restoreNextGoalOpen(anonId, oc.call, oc.marketAtCall, oc.atMs, oc.minute ?? null);
    for (const [anonId, v] of sm.nextGoalVerdicts ?? []) match.restoreNextGoalVerdict(anonId, v);
    if (restoreMoments && sm.moments && sm.moments.length > 0) restoreMoments(sm.matchId, sm.moments);
    if (restoreOpenedTriggers && sm.openedTriggerIds && sm.openedTriggerIds.length > 0) restoreOpenedTriggers(sm.matchId, sm.openedTriggerIds);
    if (restoreNextGoalResolved && sm.nextGoalResolvedIds && sm.nextGoalResolvedIds.length > 0) restoreNextGoalResolved(sm.matchId, sm.nextGoalResolvedIds);
    if (restoreNextGoalRows && sm.nextGoalRows && sm.nextGoalRows.length > 0) restoreNextGoalRows(sm.matchId, sm.nextGoalRows);
    // finalScore BEFORE resolved (order matters, docs/DATA-ARCHITECTURE.md §4
    // item 2's provenance-fetch crash-window guard, server.ts's `resolved`
    // hook): that hook distinguishes "genuinely crashed mid-crystallize"
    // (finalScore WAS captured — predictLifecycle sets it synchronously,
    // same tick as resolved — but no sentiment record landed) from an old/
    // doctored snapshot with no finalScore at all (trust resolved as-is,
    // unrelated case) — it can only tell them apart if finalScores is
    // already populated by the time markResolved runs.
    if (restoreFinalScore && sm.finalScore && typeof sm.finalScore.home === 'number' && typeof sm.finalScore.away === 'number') {
      restoreFinalScore(sm.matchId, { home: sm.finalScore.home, away: sm.finalScore.away });
    }
    const hadVerdicts = (sm.verdicts?.length ?? 0) > 0;
    if (markResolved && (sm.resolved === true || hadVerdicts)) markResolved(sm.matchId);
  }
  if (restoreFanSerial && snap.fans) restoreFanSerial(snap.fans.nextFanNo ?? 1, snap.fans.numbers ?? []);
}
