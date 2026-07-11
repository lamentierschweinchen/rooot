/**
 * Owns every active MatchState, the 4 Hz StandsStateMsg broadcast tick, and
 * periodic GC/snapshot. Transport-agnostic: takes a `broadcast(matchId, msg)`
 * callback from server.ts rather than knowing about WebSocket directly.
 */
import type { ServerMsg, StandsStateMsg } from '@contracts/crowd';
import type { MomentFeeling, SentimentRecord } from '@contracts/sentiment';
import { MatchState } from './match-state';
import { applySnapshot, readSnapshot, writeSnapshot, SNAPSHOT_INTERVAL_MS } from './snapshot';

/** One resolved NEXT GOAL cycle row (contracts/sentiment.ts nextGoal doc). */
type NextGoalRow = NonNullable<SentimentRecord['nextGoal']>[number];

export const STANDS_TICK_HZ = 4;
export const STANDS_TICK_MS = 1000 / STANDS_TICK_HZ;

/** Hooks into server.ts's sentiment accumulators (registry.ts doesn't own them
 * — server.ts constructs them lazily, keyed by matchId, from fixture identity).
 * Optional: a registry with no hooks just skips the moments field (harmless —
 * applySnapshot/writeSnapshot both treat it as "none"). */
export interface MomentsPersistenceHooks {
  get(matchId: string): MomentFeeling[];
  restore(matchId: string, moments: MomentFeeling[]): void;
}

/** Hooks into server.ts's `resolvedMatches` guard (Critical fix — post-mortem:
 * a match already resolved — FULL_TIME crystallize+anchor already fired —
 * must never re-fire after a restart; resolvedMatches is in-memory-only, so
 * without this it re-arms on every boot). Mirrors MomentsPersistenceHooks:
 * registry.ts doesn't know what "resolved" MEANS (that's server.ts's
 * crystallize/anchor pipeline) — it only ferries the flag through snapshot
 * write/restore via these two callbacks. `get` lets writeSnapshot persist
 * which matches THIS process has already resolved; `restore` re-arms the
 * guard for a match restored with prior resolution. */
export interface ResolvedPersistenceHooks {
  get(matchId: string): boolean;
  restore(matchId: string): void;
}

/** Hooks into server.ts's `openedTriggerIds` moment-open dedup Set (post-
 * mortem fix — fanStats review follow-up: openedTriggerIds is in-memory-only,
 * keyed by matchId -> Set<trigger sourceId>, so a restart used to re-arm it
 * and let a re-dispatched historical trigger — TxLINE's seedSnapshot on live
 * boot, or a REPLAY_FILE restart, which always plays from line 0 — reopen an
 * already-run drama moment (a "ghost window"); a fan reacting to it corrupts
 * their PERSISTED fanStats.reacts through a fully "legitimate" accept path).
 * Mirrors ResolvedPersistenceHooks exactly, except the payload is the per-
 * match array of trigger ids rather than a single boolean — same shape
 * MomentsPersistenceHooks uses for its per-match array. `restore` runs during
 * registry.loadSnapshot(), BEFORE index.ts starts TXLINE/REPLAY ingest — same
 * boot-ordering guarantee ResolvedPersistenceHooks relies on. */
export interface OpenedTriggersPersistenceHooks {
  get(matchId: string): string[];
  restore(matchId: string, triggerIds: string[]): void;
}

/** Hooks into server.ts's `nextGoalResolvedIds` NEXT-GOAL resolution dedup Set
 * (review Critical 2 — same bug class as OpenedTriggersPersistenceHooks above,
 * same mechanism: TxLINE's seedSnapshot replays the full historical action
 * list through the live dispatch on every ingest boot, and a REPLAY_FILE
 * restart always plays from line 0 — an in-memory-only Set re-arms empty and
 * lets a re-dispatched historical CONFIRMED goal resolve a fresh cycle's open
 * calls against stale history). Mirrors OpenedTriggersPersistenceHooks
 * exactly; `restore` runs during registry.loadSnapshot(), BEFORE ingest
 * starts — the identical boot-ordering guarantee. */
export interface NextGoalResolvedPersistenceHooks {
  get(matchId: string): string[];
  restore(matchId: string, resolvedIds: string[]): void;
}

/** Hooks into server.ts's sentiment accumulators for the resolved NEXT GOAL
 * cycle rows (the SentimentRecord's nextGoal layer, contracts/sentiment.ts) —
 * mirrors MomentsPersistenceHooks exactly and exists for the same reason: the
 * rows live on the accumulator, and a full-time crystallization after a
 * mid-match restart must still carry cycles resolved before it. */
export interface NextGoalRowsPersistenceHooks {
  get(matchId: string): NextGoalRow[];
  restore(matchId: string, rows: NextGoalRow[]): void;
}

/** Hooks into server.ts's `finalScores` map (review merge-gate fix: the
 * resolved flag persisted but the RESOLUTION-TIME FINAL SCORE did not — it
 * lived only in the memory-only join-snapshot cache — so a fan's first
 * post-restart claim on an already-resolved match minted a false "Full-time
 * 0–0" scarf contradicting its own restored verdict). Mirrors
 * ResolvedPersistenceHooks exactly: registry.ts doesn't know what the score
 * MEANS (that's server.ts's mint path), it only ferries the pair through
 * snapshot write/restore. `get` returns null for a never-resolved match (the
 * snapshot field is then omitted, never zero-filled); `restore` runs during
 * registry.loadSnapshot(), BEFORE index.ts starts TXLINE/REPLAY ingest — the
 * same boot-ordering guarantee the other hooks rely on. */
export interface FinalScorePersistenceHooks {
  get(matchId: string): { home: number; away: number } | null;
  restore(matchId: string, score: { home: number; away: number }): void;
}

export class MatchRegistry {
  private readonly matches = new Map<string, MatchState>();
  private tickTimer: NodeJS.Timeout | null = null;
  private snapshotTimer: NodeJS.Timeout | null = null;

  /** THE FAN SERIAL (design/HANDOFF-2026-07-10-fan-serial.md, the
   * coordinator's accepted MARGIN amendment) — a GLOBAL (registry-level, NOT
   * per-match), persistent, first-come ordinal per fan (anonId). Nº 1 = the
   * first hello this service EVER received that carried a side. Owned here
   * directly (unlike moments/resolved below, which are hooks into
   * server.ts-owned objects) because this class already is the one global
   * object in the process — there is no other module to hook into. Never
   * reassigned; survives restarts via the snapshot (fanNoFor/restoreFanSerial). */
  private nextFanNo = 1;
  private readonly fanNumbers = new Map<string, number>(); // anonId -> fanNo

  constructor(
    private readonly broadcast: (matchId: string, msg: ServerMsg) => void,
    private readonly moments?: MomentsPersistenceHooks,
    private readonly resolved?: ResolvedPersistenceHooks,
    private readonly openedTriggers?: OpenedTriggersPersistenceHooks,
    private readonly nextGoalResolved?: NextGoalResolvedPersistenceHooks,
    private readonly nextGoalRows?: NextGoalRowsPersistenceHooks,
    private readonly finalScore?: FinalScorePersistenceHooks,
  ) {}

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

  /* ── THE FAN SERIAL — global, first-come, persistent (registry.ts doc
   * comment above) ────────────────────────────────────────────────────── */

  /** Mint-if-absent, else return the SAME number forever — never reassigned.
   * Server RECEIPT ORDER (the order this is first CALLED for a given anonId)
   * is the ordering truth; Node's single-threaded message handling naturally
   * serializes this across concurrent connections, so no lock is needed.
   * Callers decide WHO reaches this (server.ts only calls it for a
   * side-carrying hello, per the coordinator's amendment) — this method
   * itself has no opinion on that, it only mints-or-returns for whatever
   * anonId it's given. */
  fanNoFor(anonId: string): number {
    let n = this.fanNumbers.get(anonId);
    if (n === undefined) {
      n = this.nextFanNo++;
      this.fanNumbers.set(anonId, n);
    }
    return n;
  }

  /** Snapshot restore only: reinstall a persisted anonId->fanNo map and
   * counter directly — never mints a NEW number here. Tolerant of a
   * `nextFanNo` that undercounts the restored entries (belt-and-braces,
   * mirrors applySnapshot's resolved-flag fallback below): the live counter
   * always ends up at least one past the highest restored serial, so a
   * corrupt/stale `nextFanNo` on disk can never cause a number to be
   * reissued. */
  restoreFanSerial(nextFanNo: number, numbers: Array<[string, number]>): void {
    for (const [anonId, fanNo] of numbers) this.fanNumbers.set(anonId, fanNo);
    let maxSeen = 0;
    for (const fanNo of this.fanNumbers.values()) if (fanNo > maxSeen) maxSeen = fanNo;
    this.nextFanNo = Math.max(nextFanNo, maxSeen + 1, 1);
  }

  /** For snapshot writing — a plain-value read, not a hook (this class owns
   * the fan-serial data directly; see the doc comment on the fields above). */
  fanSerialSnapshot(): { nextFanNo: number; numbers: Array<[string, number]> } {
    return { nextFanNo: this.nextFanNo, numbers: Array.from(this.fanNumbers.entries()) };
  }

  loadSnapshot(): void {
    const snap = readSnapshot();
    if (!snap) return;
    const restoreMoments = this.moments ? (matchId: string, moments: MomentFeeling[]) => this.moments!.restore(matchId, moments) : undefined;
    // pre-arm the resolved guard for every match restored already-resolved —
    // this runs BEFORE start() and BEFORE index.ts wires up TXLINE/REPLAY
    // ingest, so the very first re-delivered FULL_TIME (live seedSnapshot
    // replay, or a REPLAY_FILE restart replaying from 0) is already a no-op.
    const markResolved = this.resolved ? (matchId: string) => this.resolved!.restore(matchId) : undefined;
    // same pre-arm, same boot-ordering guarantee, for the moment-open dedup
    // Set — the very first re-dispatched historical trigger must already be
    // deduped, not just the first re-delivered FULL_TIME.
    const restoreOpenedTriggers = this.openedTriggers
      ? (matchId: string, triggerIds: string[]) => this.openedTriggers!.restore(matchId, triggerIds)
      : undefined;
    // same pre-arm again for the NEXT GOAL resolution dedup Set (review
    // Critical 2) — the very first re-dispatched historical CONFIRMED goal
    // must already be deduped, or it would resolve a fresh cycle's restored
    // open calls against stale history.
    const restoreNextGoalResolved = this.nextGoalResolved
      ? (matchId: string, ids: string[]) => this.nextGoalResolved!.restore(matchId, ids)
      : undefined;
    const restoreNextGoalRows = this.nextGoalRows
      ? (matchId: string, rows: NextGoalRow[]) => this.nextGoalRows!.restore(matchId, rows)
      : undefined;
    // same pre-arm again for the resolution-time final score — so the very
    // first post-restart claim on an already-resolved match mints against the
    // TRUE score the verdicts were graded with, never a fabricated 0–0.
    const restoreFinalScore = this.finalScore
      ? (matchId: string, score: { home: number; away: number }) => this.finalScore!.restore(matchId, score)
      : undefined;
    applySnapshot(
      snap,
      (matchId) => this.getOrCreate(matchId),
      restoreMoments,
      markResolved,
      (nextFanNo, numbers) => this.restoreFanSerial(nextFanNo, numbers),
      restoreOpenedTriggers,
      restoreNextGoalResolved,
      restoreNextGoalRows,
      restoreFinalScore,
    );
    console.log(`[stands:registry] restored ${snap.matches.length} match(es) from snapshot (v${snap.version ?? 1})`);
  }

  start(): void {
    this.tickTimer = setInterval(() => this.tick(), STANDS_TICK_MS);
    this.snapshotTimer = setInterval(() => this.snapshotNow(), SNAPSHOT_INTERVAL_MS);
  }

  /** Immediate, out-of-band snapshot write — reuses the EXACT SAME write path
   * + hooks the periodic interval uses (writeSnapshot + the moments/resolved
   * hooks), so there is only ever one persistence code path. Fix 1 (review
   * I1): server.ts's predictLifecycle calls this right after a match resolves
   * + crystallizes at FULL_TIME, instead of waiting up to SNAPSHOT_INTERVAL_MS
   * for the next periodic tick — a machine death within that window used to
   * restore a snapshot with predictions but no verdicts/resolved flag, so a
   * re-delivered FULL_TIME on boot could double-fire crystallize+anchor (the
   * exact class of bug the resolved-snapshot guard above closes). writeSnapshot
   * never throws on its own (it catches internally and logs); this is still a
   * best-effort, fire-and-forget write, same as the interval's — callers on a
   * critical path should guard the call anyway rather than assume that. */
  snapshotNow(): void {
    const getMoments = this.moments ? (matchId: string) => this.moments!.get(matchId) : undefined;
    const isResolved = this.resolved ? (matchId: string) => this.resolved!.get(matchId) : undefined;
    const getOpenedTriggerIds = this.openedTriggers ? (matchId: string) => this.openedTriggers!.get(matchId) : undefined;
    const getNextGoalResolvedIds = this.nextGoalResolved ? (matchId: string) => this.nextGoalResolved!.get(matchId) : undefined;
    const getNextGoalRows = this.nextGoalRows ? (matchId: string) => this.nextGoalRows!.get(matchId) : undefined;
    const getFinalScore = this.finalScore ? (matchId: string) => this.finalScore!.get(matchId) : undefined;
    writeSnapshot(this.matches, getMoments, isResolved, this.fanSerialSnapshot(), getOpenedTriggerIds, getNextGoalResolvedIds, getNextGoalRows, getFinalScore);
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
