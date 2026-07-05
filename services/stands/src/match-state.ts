/**
 * Per-match aggregation: presence, rooted counts, decayed roar, pulse counts,
 * and rooms (rows) nested inside a match. One MatchState per active matchId;
 * MatchRegistry (registry.ts) owns the map and the 4 Hz broadcast tick.
 *
 * Honesty mechanics (contracts/crowd.ts, AGENTS.md law #1):
 *  - counts: ROOT is once-per-anonId — a Set, not a counter that can be spammed.
 *  - roar: cheer intake clamped to CHEER_MAX_BATCH, then drawn from a per-anonId
 *    TokenBucket (sustained ~3/s, burst 8) before landing in a 3s RollingCounter.
 *    A macro'd thumb gets throttled at the bucket; the roar reflects granted
 *    tokens only, never raw taps.
 *  - pulse: reacts are 1/sec/user/kind (checked via lastReactAtMs), counted in
 *    a 60s RollingCounter per side+kind.
 */
import type { ConsensusMsg, PredictGroup, PredictVerdictMsg, ReactKind, Side } from '@contracts/crowd';

/** Summarize a cohort's predictions into mean / outcome-split / modal scoreline. */
function summarize(preds: Array<{ home: number; away: number }>): PredictGroup {
  const n = preds.length;
  if (n === 0) {
    return { n: 0, mean: { home: 0, away: 0 }, outcome: { homeWin: 0, draw: 0, awayWin: 0 }, modal: { home: 0, away: 0, pct: 0 } };
  }
  let sh = 0, sa = 0, hw = 0, d = 0, aw = 0;
  const tally = new Map<string, number>();
  for (const p of preds) {
    sh += p.home;
    sa += p.away;
    const s = Math.sign(p.home - p.away);
    if (s > 0) hw++; else if (s < 0) aw++; else d++;
    const key = p.home + '-' + p.away;
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  let modalKey = '0-0', modalN = 0;
  for (const [k, c] of tally) if (c > modalN) { modalN = c; modalKey = k; }
  const [mh, ma] = modalKey.split('-').map(Number);
  return {
    n,
    mean: { home: sh / n, away: sa / n },
    outcome: { homeWin: hw / n, draw: d / n, awayWin: aw / n },
    modal: { home: mh ?? 0, away: ma ?? 0, pct: modalN / n },
  };
}
import {
  CHEER_MAX_BATCH,
  PULSE_WINDOW_MS,
  REACT_MIN_INTERVAL_MS,
  ROAR_WINDOW_MS,
  RollingCounter,
  TokenBucket,
} from './decay';

export interface Member {
  anonId: string;
  name: string;
  side: Side;
  present: boolean;
  ws: unknown; // WebSocket — kept opaque here to keep this module transport-free
}

const ROOM_MAX_MEMBERS = 11;

interface PerSide<T> {
  home: T;
  away: T;
}

function perSide<T>(make: () => T): PerSide<T> {
  return { home: make(), away: make() };
}

export class RoomState {
  readonly members = new Map<string, Member>(); // anonId -> member

  /** Returns 'ok' | 'full' | 'already-in'. */
  join(member: Member): 'ok' | 'full' | 'already-in' {
    if (this.members.has(member.anonId)) {
      this.members.set(member.anonId, member); // update name/side/ws, still "already-in"
      return 'already-in';
    }
    if (this.members.size >= ROOM_MAX_MEMBERS) return 'full';
    this.members.set(member.anonId, member);
    return 'ok';
  }

  leave(anonId: string): void {
    this.members.delete(anonId);
  }

  setPresent(anonId: string, present: boolean): void {
    const m = this.members.get(anonId);
    if (m) m.present = present;
  }

  toWireMembers() {
    return Array.from(this.members.values()).map((m) => ({
      anonId: m.anonId,
      name: m.name,
      side: m.side,
      present: m.present,
    }));
  }
}

export class MatchState {
  readonly matchId: string;

  /** anonId -> side, for the once-per-fan rooted counter. */
  private readonly rooted = new Map<string, Side>();
  /** anonId -> prediction (docs/MECHANISMS.md §2). Editable until kickoff. */
  private readonly predictions = new Map<string, { home: number; away: number; atMs: number }>();
  /** predictions lock at kickoff — a claim on the future locks when it starts. */
  private predictLocked = false;
  /** connected clients (presence), keyed by anonId — last-hello-wins per anonId. */
  private readonly connected = new Set<string>();
  /** anonId -> token bucket, cheer throttle. */
  private readonly cheerBuckets = new Map<string, TokenBucket>();
  /** anonId -> kind -> last accepted react ms, react throttle. */
  private readonly lastReactMs = new Map<string, Map<ReactKind, number>>();

  private readonly roar: PerSide<RollingCounter> = perSide(() => new RollingCounter(ROAR_WINDOW_MS));
  private readonly pulse: PerSide<Record<ReactKind, RollingCounter>> = perSide(() => ({
    belief: new RollingCounter(PULSE_WINDOW_MS),
    nerves: new RollingCounter(PULSE_WINDOW_MS),
    rage: new RollingCounter(PULSE_WINDOW_MS),
  }));

  readonly rooms = new Map<string, RoomState>();

  constructor(matchId: string) {
    this.matchId = matchId;
  }

  /* ── presence + root ─────────────────────────────────────────────── */

  markConnected(anonId: string): void {
    this.connected.add(anonId);
  }

  markDisconnected(anonId: string): void {
    this.connected.delete(anonId);
  }

  presenceCount(): number {
    return this.connected.size;
  }

  root(anonId: string, side: Side): void {
    this.rooted.set(anonId, side);
  }

  counts(): { home: number; away: number } {
    let home = 0;
    let away = 0;
    for (const side of this.rooted.values()) {
      if (side === 'home') home++;
      else away++;
    }
    return { home, away };
  }

  /* ── predict (the retention spine, docs/MECHANISMS.md §2) ──────────── */

  /** Record/replace a fan's predicted scoreline. Ignored once locked (KO).
   * Clamped to a sane range. Returns false if rejected (locked/invalid). */
  predict(anonId: string, home: number, away: number, atMs: number): boolean {
    if (this.predictLocked) return false;
    if (!Number.isFinite(home) || !Number.isFinite(away)) return false;
    const h = Math.max(0, Math.min(19, Math.floor(home)));
    const a = Math.max(0, Math.min(19, Math.floor(away)));
    this.predictions.set(anonId, { home: h, away: a, atMs });
    return true;
  }

  /** Lock predictions (call at kickoff — FIRST_HALF). Idempotent. */
  lockPredictions(): void {
    this.predictLocked = true;
  }

  predictionsLocked(): boolean {
    return this.predictLocked;
  }

  /** Aggregate the crowd's predicted scoreline, whole + sliced by rooted end.
   * The THIRD belief signal (market/crowd/result) — never blended with market. */
  consensus(): ConsensusMsg {
    const groups = {
      all: [] as Array<{ home: number; away: number }>,
      home: [] as Array<{ home: number; away: number }>,
      away: [] as Array<{ home: number; away: number }>,
      neutral: [] as Array<{ home: number; away: number }>,
    };
    for (const [anonId, p] of this.predictions) {
      groups.all.push(p);
      const side = this.rooted.get(anonId);
      if (side === 'home') groups.home.push(p);
      else if (side === 'away') groups.away.push(p);
      else groups.neutral.push(p);
    }
    return {
      type: 'consensus',
      matchId: this.matchId,
      ts: Date.now(),
      locked: this.predictLocked,
      all: summarize(groups.all),
      byRoot: { home: summarize(groups.home), away: summarize(groups.away), neutral: summarize(groups.neutral) },
    };
  }

  /** Resolve every prediction against the final score → verdicts. */
  resolvePredictions(finalHome: number, finalAway: number): PredictVerdictMsg[] {
    const out: PredictVerdictMsg[] = [];
    const finalOutcome = Math.sign(finalHome - finalAway);
    for (const [anonId, p] of this.predictions) {
      const exact = p.home === finalHome && p.away === finalAway;
      const outcome = Math.sign(p.home - p.away) === finalOutcome;
      out.push({
        type: 'predictVerdict',
        matchId: this.matchId,
        anonId,
        predicted: { home: p.home, away: p.away },
        final: { home: finalHome, away: finalAway },
        verdict: exact ? 'exact' : outcome ? 'outcome' : 'wrong',
      });
    }
    return out;
  }

  predictionCount(): number {
    return this.predictions.size;
  }

  /* ── cheer / roar ─────────────────────────────────────────────────── */

  /**
   * Clamp the batch to CHEER_MAX_BATCH, draw from the anonId's token bucket,
   * and add whatever was granted to that side's rolling roar counter. Returns
   * the number of cheers actually counted (for diagnostics/tests).
   */
  cheer(anonId: string, side: Side, n: number, nowMs = Date.now()): number {
    const clamped = Math.max(0, Math.min(n, CHEER_MAX_BATCH));
    if (clamped <= 0) return 0;
    let bucket = this.cheerBuckets.get(anonId);
    if (!bucket) {
      bucket = new TokenBucket();
      this.cheerBuckets.set(anonId, bucket);
    }
    const granted = bucket.take(clamped, nowMs);
    if (granted > 0) this.roar[side].add(granted, nowMs);
    return granted;
  }

  roarRate(): { home: number; away: number } {
    return { home: this.roar.home.rate(), away: this.roar.away.rate() };
  }

  /* ── react / pulse ────────────────────────────────────────────────── */

  /** Returns true if the react was accepted (not throttled). */
  react(anonId: string, side: Side, kind: ReactKind, nowMs = Date.now()): boolean {
    let perKind = this.lastReactMs.get(anonId);
    if (!perKind) {
      perKind = new Map();
      this.lastReactMs.set(anonId, perKind);
    }
    const last = perKind.get(kind) ?? 0;
    if (nowMs - last < REACT_MIN_INTERVAL_MS) return false;
    perKind.set(kind, nowMs);
    this.pulse[side][kind].add(1, nowMs);
    return true;
  }

  pulseCounts(): { home: Record<ReactKind, number>; away: Record<ReactKind, number> } {
    const sum = (r: Record<ReactKind, RollingCounter>) => ({
      belief: r.belief.sum(),
      nerves: r.nerves.sum(),
      rage: r.rage.sum(),
    });
    return { home: sum(this.pulse.home), away: sum(this.pulse.away) };
  }

  /* ── rooms (rows) ─────────────────────────────────────────────────── */

  getOrCreateRoom(roomId: string): RoomState {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = new RoomState();
      this.rooms.set(roomId, room);
    }
    return room;
  }

  findRoomOf(anonId: string): { roomId: string; room: RoomState } | null {
    for (const [roomId, room] of this.rooms) {
      if (room.members.has(anonId)) return { roomId, room };
    }
    return null;
  }

  /** Garbage-collect empty rooms and idle rolling counters. Call periodically. */
  gc(nowMs = Date.now()): void {
    for (const [roomId, room] of this.rooms) {
      if (room.members.size === 0) this.rooms.delete(roomId);
    }
    // roar/pulse counters self-empty; nothing to explicitly free (Map-of-buckets
    // is small and bounded by wall-clock seconds within the window).
    void nowMs;
  }

  /** True if there's been any activity worth a broadcast tick (skip idle matches). */
  isActive(): boolean {
    return this.connected.size > 0;
  }

  snapshot() {
    return {
      matchId: this.matchId,
      rooted: Array.from(this.rooted.entries()),
      connectedCount: this.connected.size,
      roomCount: this.rooms.size,
    };
  }
}
