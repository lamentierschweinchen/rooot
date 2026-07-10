/**
 * Restart continuity: every 30s (STANDS_SNAPSHOT_INTERVAL_MS), dump a small
 * JSON snapshot of match state (rooted anonId->side, room membership,
 * predictions, predictLocked, verdicts, felt-moment history) to disk; on boot,
 * reload it if present — volume-ready (STANDS_DATA_DIR / a mounted /data
 * survives restarts/redeploys; /tmp does not). Weekend scale — this is not
 * meant to survive a crash mid-write, just a clean restart/redeploy without
 * losing who-rooted-for-whom, who-predicted-what, and who-already-saw-their-
 * verdict.
 *
 * Deliberately NOT snapshotting roar/pulse rolling counters — those are
 * seconds-old by nature and honestly should reset to silence on restart
 * rather than resurrect stale decay state.
 */
import { accessSync, constants as fsConstants, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { PredictVerdictMsg, Side } from '@contracts/crowd';
import type { MomentFeeling } from '@contracts/sentiment';
import type { MatchState } from './match-state';

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
 * read and defaults rather than fabricates. */
export const SNAPSHOT_VERSION = 2;

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
  predictions?: Array<[string, { home: number; away: number; atMs: number }]>;
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
}

interface SnapshotFile {
  version?: number; // absent = v1
  savedAtMs: number;
  matches: SnapshotMatch[];
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
      };
    }),
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
 * and verdicts (not presence/roar/pulse — those are live-connection-only).
 * Tolerant of a v1 file (or a v2 file with a match entry missing some of the
 * newer fields): every v2+ field defaults to its honest empty state rather
 * than being fabricated. `restoreMoments`, if given, is called once per match
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
 */
export function applySnapshot(
  snap: SnapshotFile,
  getOrCreate: (matchId: string) => MatchState,
  restoreMoments?: (matchId: string, moments: MomentFeeling[]) => void,
  markResolved?: (matchId: string) => void,
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
    for (const [anonId, p] of sm.predictions ?? []) match.restorePrediction(anonId, p.home, p.away, p.atMs);
    if (sm.predictLocked) match.lockPredictions();
    for (const [anonId, v] of sm.verdicts ?? []) match.restoreVerdict(anonId, v);
    if (restoreMoments && sm.moments && sm.moments.length > 0) restoreMoments(sm.matchId, sm.moments);
    const hadVerdicts = (sm.verdicts?.length ?? 0) > 0;
    if (markResolved && (sm.resolved === true || hadVerdicts)) markResolved(sm.matchId);
  }
}
