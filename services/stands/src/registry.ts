/**
 * Owns every active MatchState, the 4 Hz StandsStateMsg broadcast tick, and
 * periodic GC/snapshot. Transport-agnostic: takes a `broadcast(matchId, msg)`
 * callback from server.ts rather than knowing about WebSocket directly.
 */
import type { ServerMsg, StandsStateMsg } from '@contracts/crowd';
import { MatchState } from './match-state';
import { applySnapshot, readSnapshot, writeSnapshot, SNAPSHOT_INTERVAL_MS } from './snapshot';

export const STANDS_TICK_HZ = 4;
export const STANDS_TICK_MS = 1000 / STANDS_TICK_HZ;

export class MatchRegistry {
  private readonly matches = new Map<string, MatchState>();
  private tickTimer: NodeJS.Timeout | null = null;
  private snapshotTimer: NodeJS.Timeout | null = null;

  constructor(private readonly broadcast: (matchId: string, msg: ServerMsg) => void) {}

  getOrCreate(matchId: string): MatchState {
    let m = this.matches.get(matchId);
    if (!m) {
      m = new MatchState(matchId);
      this.matches.set(matchId, m);
    }
    return m;
  }

  get(matchId: string): MatchState | undefined {
    return this.matches.get(matchId);
  }

  activeMatchCount(): number {
    let n = 0;
    for (const m of this.matches.values()) if (m.isActive()) n++;
    return n;
  }

  totalClientCount(): number {
    let n = 0;
    for (const m of this.matches.values()) n += m.presenceCount();
    return n;
  }

  loadSnapshot(): void {
    const snap = readSnapshot();
    if (!snap) return;
    applySnapshot(snap, (matchId) => this.getOrCreate(matchId));
    console.log(`[stands:registry] restored ${snap.matches.length} match(es) from snapshot`);
  }

  start(): void {
    this.tickTimer = setInterval(() => this.tick(), STANDS_TICK_MS);
    this.snapshotTimer = setInterval(() => writeSnapshot(this.matches), SNAPSHOT_INTERVAL_MS);
  }

  stop(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
  }

  private tick(): void {
    const now = Date.now();
    for (const [matchId, match] of this.matches) {
      if (!match.isActive()) continue; // skip idle matches, per task spec
      const msg: StandsStateMsg = {
        type: 'stands',
        matchId,
        ts: now,
        counts: match.counts(),
        roar: match.roarRate(),
        pulse: match.pulseCounts(),
        presence: match.presenceCount(),
      };
      this.broadcast(matchId, msg);
      match.gc(now);
    }
  }
}
