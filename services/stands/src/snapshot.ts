/**
 * Restart continuity: every 30s, dump a small JSON snapshot of match state
 * (rooted anonId->side, room membership) to disk; on boot, reload it if
 * present. Weekend scale — this is not meant to survive a crash mid-write,
 * just a clean restart/redeploy without losing who-rooted-for-whom.
 *
 * Deliberately NOT snapshotting roar/pulse rolling counters — those are
 * seconds-old by nature and honestly should reset to silence on restart
 * rather than resurrect stale decay state.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Side } from '@contracts/crowd';
import type { MatchState } from './match-state';

export const SNAPSHOT_PATH = process.env.STANDS_SNAPSHOT_PATH ?? '/tmp/rooot-stands-snapshot.json';
export const SNAPSHOT_INTERVAL_MS = 30_000;

interface SnapshotRoomMember {
  anonId: string;
  name: string;
  side: Side;
}

interface SnapshotMatch {
  matchId: string;
  rooted: Array<[string, Side]>;
  rooms: Array<{ roomId: string; members: SnapshotRoomMember[] }>;
}

interface SnapshotFile {
  savedAtMs: number;
  matches: SnapshotMatch[];
}

export function writeSnapshot(matches: Map<string, MatchState>): void {
  const file: SnapshotFile = {
    savedAtMs: Date.now(),
    matches: Array.from(matches.values()).map((m) => ({
      matchId: m.matchId,
      rooted: m.snapshot().rooted,
      rooms: Array.from(m.rooms.entries()).map(([roomId, room]) => ({
        roomId,
        members: room.toWireMembers().map(({ anonId, name, side }) => ({ anonId, name, side })),
      })),
    })),
  };
  try {
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

/** Rehydrate rooted counts + room membership (not presence — that's live-connection-only). */
export function applySnapshot(snap: SnapshotFile, getOrCreate: (matchId: string) => MatchState): void {
  for (const sm of snap.matches) {
    const match = getOrCreate(sm.matchId);
    for (const [anonId, side] of sm.rooted) match.root(anonId, side);
    for (const sr of sm.rooms) {
      const room = match.getOrCreateRoom(sr.roomId);
      for (const member of sr.members) {
        room.join({ anonId: member.anonId, name: member.name, side: member.side, present: false, ws: null });
      }
    }
  }
}
