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
import { accessSync, constants as fsConstants, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
export const SNAPSHOT_INTERVAL_MS = Number(process.env.STANDS_SNAPSHOT_INTERVAL_MS ?? 30_000);

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
}

interface SnapshotFile {
  version?: number; // absent = v1
  savedAtMs: number;
  matches: SnapshotMatch[];
}

export function writeSnapshot(matches: Map<string, MatchState>, getMoments?: (matchId: string) => MomentFeeling[]): void {
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
      };
    }),
  };
  try {
    // volume-ready: make sure the target dir exists before the first write
    // (a fresh mount / a custom STANDS_DATA_DIR may not have it yet).
    mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(file));
  } catch (err) {
    console.warn(`[stands:snapshot] write failed: ${String(err)}`);
  }
}

/** Best-effort read; returns null if absent/corrupt (never throws — a bad snapshot must not block boot). */
export function readSnapshot(): SnapshotFile | null {
  try {
    const raw = readFileSync(SNAPSHOT_PATH, 'utf8');
    return JSON.parse(raw) as SnapshotFile;
  } catch {
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
 */
export function applySnapshot(
  snap: SnapshotFile,
  getOrCreate: (matchId: string) => MatchState,
  restoreMoments?: (matchId: string, moments: MomentFeeling[]) => void,
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
  }
}
