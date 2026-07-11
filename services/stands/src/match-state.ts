/**
 * Per-match aggregation: presence, rooted counts, decayed roar, pulse counts,
 * per-fan night stats, and rooms (rows) nested inside a match. One MatchState
 * per active matchId; MatchRegistry (registry.ts) owns the map and the 4 Hz
 * broadcast tick.
 *
 * Honesty mechanics (contracts/crowd.ts, AGENTS.md law #1):
 *  - counts: ROOT is once-per-anonId — a Set, not a counter that can be spammed.
 *  - roar: cheer intake clamped to CHEER_MAX_BATCH, then drawn from a per-anonId
 *    TokenBucket (sustained ~3/s, burst 8) before landing in a 3s RollingCounter.
 *    A macro'd thumb gets throttled at the bucket; the roar reflects granted
 *    tokens only, never raw taps.
 *  - pulse: reacts are 1/sec/user/kind (checked via lastReactAtMs), counted in
 *    a 60s RollingCounter per side+kind.
 *  - fanStats (THE STANDS CARD substrate, write-only tonight — see the
 *    FanStats interface below): every field is driven by a real,
 *    server-ACCEPTED action only, same discipline as roar/pulse above.
 */
import type { ConsensusMsg, MomentEndHist, MomentKind, NextGoalStateMsg, NextGoalVerdictMsg, PredictGroup, PredictVerdictMsg, ReactKind, Side } from '@contracts/crowd';
import { FEELING_PALETTES } from '@contracts/crowd';

/** A de-vigged 1X2 probability triple, inline (matches CallMsg.marketP /
 * PredictMsg.marketAtPredict's own inline shape in contracts/crowd.ts —
 * no import of contracts/sentiment.ts's Triple needed for this). */
type MarketTriple = { home: number; draw: number; away: number };

/** IN-GAME: one fan's open NEXT GOAL call for the CURRENT cycle (docs/
 * BACKLOG-full-version-and-deferred-ideas.md §2). */
interface NextGoalOpenCall {
  call: 'home' | 'away' | 'none';
  marketAtCall: MarketTriple | null;
  atMs: number;
}

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
  MOMENT_COOLDOWN_MS,
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

/**
 * THE STANDS CARD substrate (write-only tonight — no wire message carries this
 * yet, no surface reads it): one fan's accumulated night in THIS match.
 * Honesty (AGENTS.md law #1): every field increments ONLY from a real,
 * server-ACCEPTED action — never synthesized, never double-counted across a
 * restart (see MatchState's cheer/react/momentReact/markConnected/
 * markDisconnected and snapshot()'s session fold, below).
 */
export interface FanStats {
  /** Sum of GRANTED cheer tokens (post-throttle) — never the raw tapped/sent
   * count. A fully-throttled cheer (granted 0) adds nothing. */
  cheers: number;
  /** Presence-time: total ms across every open-connection session for this
   * anonId, folded in on disconnect and checkpointed (not closed) on every
   * snapshot write. This is presence (an open socket), not proven attention —
   * record the truth, leave interpretation to a future surface. */
  watchMs: number;
  /** Count of DISTINCT drama moments this fan reacted to (the momentReact
   * accept path) — a re-pick/replacement within the same open moment adds
   * nothing. */
  reacts: number;
  /** First-ever touch (any accepted action) for this anonId in this match. */
  firstSeenMs: number;
  /** Most recent touch (connect, cheer, react, predict). */
  lastSeenMs: number;
  /** IN-GAME (docs/BACKLOG-full-version-and-deferred-ideas.md §2): count of
   * NEXT GOAL calls that reached RESOLUTION — the denominator. A call that
   * gets replaced before it resolves is never counted (only the open call AT
   * resolution time is graded) — accumulates at resolution, not at call time. */
  nextGoalCalls: number;
  /** Of nextGoalCalls, how many resolved 'correct' — the card's "in-game
   * prediction accuracy" slot = nextGoalCorrect / nextGoalCalls. */
  nextGoalCorrect: number;
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
  /** anonId -> this fan's resolved verdict, set once at FULL_TIME (docs/MECHANISMS.md
   * §2 → FORESIGHT). Populated by resolvePredictions; snapshotted (services/stands/src/
   * snapshot.ts) so a verdict survives a restart, and replayed into a fan's hello once
   * it exists (server.ts handleHello) — a verdict is personal, never broadcast. */
  private readonly verdicts = new Map<string, PredictVerdictMsg>();
  /** presence refcount: anonId -> number of open sockets that have adopted it.
   * A ground visit can open several sockets for one fan (tabs/iframes); this
   * must survive any ONE of them closing (post-mortem: a Set-based presence
   * erased the fan — and could stop stands broadcasts — the moment ANY one of
   * their sockets closed, even with others still open). `presenceCount()` /
   * StandsStateMsg.presence stay the map SIZE (distinct anonIds), unaffected
   * by how many sockets each fan has open — only markConnected/markDisconnected
   * pairing (one call per socket-adoption) changes. */
  private readonly connected = new Map<string, number>();
  /** anonId -> wall-clock ms an open presence session started (refcount
   * 0→1). Deleted when presence really ends (refcount→0, markDisconnected);
   * checkpointed but kept OPEN by snapshot()'s fold (see FanStats.watchMs doc
   * + snapshot() below) — never itself persisted (sockets die; deliberately
   * absent from snapshot(), matching connected/roar/pulse). */
  private readonly sessionStart = new Map<string, number>();
  /** anonId -> THE STANDS CARD substrate for this match. Write-only tonight —
   * see the FanStats interface doc above. */
  private readonly fanStats = new Map<string, FanStats>();
  /** anonId -> token bucket, cheer throttle. */
  private readonly cheerBuckets = new Map<string, TokenBucket>();
  /** anonId -> kind -> last accepted react ms, react throttle. */
  private readonly lastReactMs = new Map<string, Map<ReactKind, number>>();

  /** IN-GAME NEXT GOAL (docs/BACKLOG-full-version-and-deferred-ideas.md §2):
   * anonId -> the fan's open call for the CURRENT cycle. A new call REPLACES
   * the prior one (Map semantics); cleared to empty at every resolution — a
   * fresh open-call cycle begins for the next goal. */
  private readonly nextGoalOpen = new Map<string, NextGoalOpenCall>();
  /** anonId -> this fan's most recent NEXT GOAL verdict — overwritten at each
   * resolution (mirrors `verdicts` above), so this is always "the CURRENT
   * cycle's" verdict for a fan who has one. */
  private readonly nextGoalVerdicts = new Map<string, NextGoalVerdictMsg>();

  private readonly roar: PerSide<RollingCounter> = perSide(() => new RollingCounter(ROAR_WINDOW_MS));
  private readonly pulse: PerSide<Record<ReactKind, RollingCounter>> = perSide(() => ({
    belief: new RollingCounter(PULSE_WINDOW_MS),
    nerves: new RollingCounter(PULSE_WINDOW_MS),
    rage: new RollingCounter(PULSE_WINDOW_MS),
  }));

  /** The single open drama window (docs/MECHANISMS.md §4). One at a time: the
   * server supersedes a soft window with a hard event by ending it first. Each
   * fan's react is last-write-wins until close. Null between moments. */
  private activeMoment: {
    momentId: string;
    kind: MomentKind;
    side: Side | null;
    minute: number | null;
    openedMs: number;
    reacts: Map<string, { token: string; side: Side }>;
  } | null = null;
  /** wall-clock of the last window close — SOFT triggers honour a cooldown. */
  private lastMomentClosedMs = 0;

  readonly rooms = new Map<string, RoomState>();

  constructor(matchId: string) {
    this.matchId = matchId;
  }

  /* ── presence + root ─────────────────────────────────────────────── */

  /** The caller (server.ts) must call this exactly once per SOCKET adoption of
   * anonId — not once per hello message — so a re-hello from the same socket
   * with the same anonId doesn't inflate the refcount. Also touches this
   * fan's card (a connect is activity) and, ONLY on a genuine 0→1 transition,
   * opens a watch-time session — a second socket adopting an already-present
   * anonId must NOT start a second, overlapping session (FanStats.watchMs
   * doc: one continuous session per anonId, not one per socket). */
  markConnected(anonId: string, nowMs = Date.now()): void {
    const n = (this.connected.get(anonId) ?? 0) + 1;
    this.connected.set(anonId, n);
    this.touchFanStats(anonId, nowMs);
    if (n === 1) this.sessionStart.set(anonId, nowMs);
  }

  /** The mirror of markConnected: one call per prior adoption (an anonId
   * switch on the same socket, or that socket closing). Decrements the
   * refcount and deletes the entry at 0, so presence (map size) only drops
   * once every socket for that anonId is gone. ONLY on that real refcount→0
   * does the open watch-time session fold into FanStats.watchMs — a socket
   * closing while a SIBLING socket for the same anonId is still open must
   * leave the session (and watchMs) untouched. */
  markDisconnected(anonId: string, nowMs = Date.now()): void {
    const n = this.connected.get(anonId);
    if (n === undefined) return;
    if (n <= 1) {
      this.connected.delete(anonId);
      this.closeSession(anonId, nowMs);
    } else {
      this.connected.set(anonId, n - 1);
    }
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

  /* ── fan stats — THE STANDS CARD substrate (write-only tonight) ────── */

  /** Create-if-absent (stamping firstSeenMs) and bump lastSeenMs for a real,
   * accepted touch. Returns the live row so the caller can add to a counter
   * on top of it. Every call here IS an accepted action — a rejected/
   * throttled/invalid attempt must never reach this. */
  private touchFanStats(anonId: string, nowMs: number): FanStats {
    let fs = this.fanStats.get(anonId);
    if (!fs) {
      fs = { cheers: 0, watchMs: 0, reacts: 0, firstSeenMs: nowMs, lastSeenMs: nowMs, nextGoalCalls: 0, nextGoalCorrect: 0 };
      this.fanStats.set(anonId, fs);
    } else {
      fs.lastSeenMs = nowMs;
    }
    return fs;
  }

  /** Real end of presence (refcount 0): fold the open session into watchMs
   * and clear it — there is no session left to checkpoint later. A no-op if
   * this anonId never had an open session tracked here (e.g., a
   * restored-only fan who never held a live socket in THIS process). */
  private closeSession(anonId: string, nowMs: number): void {
    const start = this.sessionStart.get(anonId);
    if (start === undefined) return;
    this.sessionStart.delete(anonId);
    const fs = this.fanStats.get(anonId);
    if (fs) fs.watchMs += Math.max(0, nowMs - start);
  }

  /** Checkpoint every OPEN session into watchMs and advance its start to now,
   * WITHOUT closing it (the socket is still connected) — called from
   * snapshot() so a hard-killed process loses at most one interval's worth of
   * watch time, and a restore (which never carries sessionStart, only the
   * folded watchMs total) can never double-count the part already folded in
   * here. */
  private foldOpenSessions(nowMs: number): void {
    for (const [anonId, start] of this.sessionStart) {
      const fs = this.fanStats.get(anonId);
      if (fs) fs.watchMs += Math.max(0, nowMs - start);
      this.sessionStart.set(anonId, nowMs);
    }
  }

  /** THE STANDS CARD substrate for one fan, to date, in this match. A
   * defensive copy (the live row keeps mutating). Undefined if this anonId
   * has never had an accepted action recorded. No wire message exposes this
   * yet — dev-check / future-surface use only. */
  fanStatsFor(anonId: string): FanStats | undefined {
    const fs = this.fanStats.get(anonId);
    return fs ? { ...fs } : undefined;
  }

  /** Snapshot restore only: install a fan's persisted card directly. No live
   * session is fabricated — sessionStart stays untouched (empty for this
   * anonId until a real new connect happens post-restart), matching the
   * "restore returns only the persisted total" rule (FanStats.watchMs doc).
   * nextGoalCalls/nextGoalCorrect default to 0 — absent on a pre-NEXT-GOAL
   * snapshot (the feature didn't exist yet when it was written), never
   * fabricated as anything but honest zero. */
  restoreFanStats(anonId: string, stats: FanStats): void {
    this.fanStats.set(anonId, { ...stats, nextGoalCalls: stats.nextGoalCalls ?? 0, nextGoalCorrect: stats.nextGoalCorrect ?? 0 });
  }

  /* ── predict (the retention spine, docs/MECHANISMS.md §2) ──────────── */

  /** Record/replace a fan's predicted scoreline. Ignored once locked (KO).
   * Clamped to a sane range. Returns false if rejected (locked/invalid).
   * `atMs` is the client-asserted moment of the prediction (stored as-is, a
   * pre-existing field); `nowMs` is the server's own clock, used only to
   * touch this fan's card (FanStats.lastSeenMs) — kept separate so a fan's
   * card timeline is never driven by a client-supplied timestamp. */
  predict(anonId: string, home: number, away: number, atMs: number, nowMs = Date.now()): boolean {
    if (this.predictLocked) return false;
    if (!Number.isFinite(home) || !Number.isFinite(away)) return false;
    const h = Math.max(0, Math.min(19, Math.floor(home)));
    const a = Math.max(0, Math.min(19, Math.floor(away)));
    this.predictions.set(anonId, { home: h, away: a, atMs });
    this.touchFanStats(anonId, nowMs);
    return true;
  }

  /** Snapshot restore only (services/stands/src/snapshot.ts): install a fan's
   * prior prediction directly, bypassing the lock check — the lock itself is
   * restored separately via lockPredictions() so restore order doesn't matter. */
  restorePrediction(anonId: string, home: number, away: number, atMs: number): void {
    this.predictions.set(anonId, { home, away, atMs });
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

  /** Resolve every prediction against the final score → verdicts. Also stores
   * each one (anonId -> verdict) so a late joiner/reconnect can be caught up
   * later via verdictFor — see handleHello in server.ts. */
  resolvePredictions(finalHome: number, finalAway: number): PredictVerdictMsg[] {
    const out: PredictVerdictMsg[] = [];
    const finalOutcome = Math.sign(finalHome - finalAway);
    for (const [anonId, p] of this.predictions) {
      const exact = p.home === finalHome && p.away === finalAway;
      const outcome = Math.sign(p.home - p.away) === finalOutcome;
      const v: PredictVerdictMsg = {
        type: 'predictVerdict',
        matchId: this.matchId,
        anonId,
        predicted: { home: p.home, away: p.away },
        final: { home: finalHome, away: finalAway },
        verdict: exact ? 'exact' : outcome ? 'outcome' : 'wrong',
      };
      this.verdicts.set(anonId, v);
      out.push(v);
    }
    return out;
  }

  /** A fan's resolved verdict, if their prediction has been graded — present
   * only after FULL_TIME AND only for a fan who actually predicted (a fan with
   * no prediction gets undefined here, never a synthesized verdict). */
  verdictFor(anonId: string): PredictVerdictMsg | undefined {
    return this.verdicts.get(anonId);
  }

  /** Snapshot restore only: install an already-computed verdict directly — the
   * final score isn't known again at restore time, only the prior result is. */
  restoreVerdict(anonId: string, v: PredictVerdictMsg): void {
    this.verdicts.set(anonId, v);
  }

  verdictCount(): number {
    return this.verdicts.size;
  }

  predictionCount(): number {
    return this.predictions.size;
  }

  /* ── NEXT GOAL — in-game (docs/BACKLOG-full-version-and-deferred-ideas.md
   * §2). The live-play phase gate is owned by the caller (server.ts, via its
   * own cached feed state) — this class stays feed-agnostic, same split of
   * responsibility as predict()'s self-owned lock vs. this. ───────────── */

  /** Record/replace a fan's open call for the current cycle. Unconditional —
   * the caller has already gated on live play. Touches the fan's card (an
   * accepted action); the nextGoalCalls/nextGoalCorrect COUNTERS themselves
   * only move at resolution (see resolveNextGoalOnGoal/AtFullTime below) — a
   * call replaced before it resolves is never counted. */
  nextGoalCall(anonId: string, call: 'home' | 'away' | 'none', marketAtCall: MarketTriple | null, atMs: number, nowMs = Date.now()): void {
    this.nextGoalOpen.set(anonId, { call, marketAtCall, atMs });
    this.touchFanStats(anonId, nowMs);
  }

  /** Snapshot restore only: reinstall a fan's open call directly — mirrors restorePrediction. */
  restoreNextGoalOpen(anonId: string, call: 'home' | 'away' | 'none', marketAtCall: MarketTriple | null, atMs: number): void {
    this.nextGoalOpen.set(anonId, { call, marketAtCall, atMs });
  }

  nextGoalOpenCount(): number {
    return this.nextGoalOpen.size;
  }

  /** The crowd's LIVE next-goal belief (contracts/crowd.ts NextGoalStateMsg) —
   * broadcast on every accepted call + on resolution. `marketAtTs` is supplied
   * by the caller (server.ts stamps it from the same cached latest triple used
   * at call receipt) — null until the first odds tick for this match arrives. */
  nextGoalState(marketAtTs: MarketTriple | null): NextGoalStateMsg {
    let home = 0, away = 0, none = 0;
    for (const { call } of this.nextGoalOpen.values()) {
      if (call === 'home') home++;
      else if (call === 'away') away++;
      else none++;
    }
    return {
      type: 'nextGoalState',
      matchId: this.matchId,
      ts: Date.now(),
      open: { n: this.nextGoalOpen.size, home, away, none },
      marketAtTs,
    };
  }

  /** Resolve every open call against what actually happened, empty the book
   * (a new open-call cycle begins for the next goal), and return the per-fan
   * verdicts for personal delivery (server.ts's sendToAnon, like predict
   * verdicts). Shared by both resolution triggers below — the ONLY difference
   * between a goal and a full-time-with-no-more-goals is what `happened` is. */
  private resolveNextGoal(happened: 'home' | 'away' | 'none', nowMs = Date.now()): NextGoalVerdictMsg[] {
    const out: NextGoalVerdictMsg[] = [];
    for (const [anonId, open] of this.nextGoalOpen) {
      const outcome: 'correct' | 'wrong' = open.call === happened ? 'correct' : 'wrong';
      const v: NextGoalVerdictMsg = {
        type: 'nextGoalVerdict',
        matchId: this.matchId,
        anonId,
        call: open.call,
        outcome,
        happened,
        marketAtCall: open.marketAtCall,
        atMs: nowMs,
      };
      this.nextGoalVerdicts.set(anonId, v);
      const fs = this.touchFanStats(anonId, nowMs);
      fs.nextGoalCalls += 1; // the denominator — moves at resolution, never at call time
      if (outcome === 'correct') fs.nextGoalCorrect += 1;
      out.push(v);
    }
    this.nextGoalOpen.clear();
    return out;
  }

  /** A real goal scored: calls for the scoring side resolve correct; the
   * opposite side AND 'none' resolve wrong. */
  resolveNextGoalOnGoal(side: Side, nowMs = Date.now()): NextGoalVerdictMsg[] {
    return this.resolveNextGoal(side, nowMs);
  }

  /** FULL_TIME with no further goal this cycle: 'none' calls resolve correct;
   * side calls resolve wrong. */
  resolveNextGoalAtFullTime(nowMs = Date.now()): NextGoalVerdictMsg[] {
    return this.resolveNextGoal('none', nowMs);
  }

  /** A fan's most recent NEXT GOAL verdict, if they have one yet — present
   * only once at least one of their calls has resolved (never synthesized). */
  nextGoalVerdictFor(anonId: string): NextGoalVerdictMsg | undefined {
    return this.nextGoalVerdicts.get(anonId);
  }

  /** Snapshot restore only: reinstall a fan's last verdict directly — mirrors restoreVerdict. */
  restoreNextGoalVerdict(anonId: string, v: NextGoalVerdictMsg): void {
    this.nextGoalVerdicts.set(anonId, v);
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
    if (granted > 0) {
      this.roar[side].add(granted, nowMs);
      this.touchFanStats(anonId, nowMs).cheers += granted; // GRANTED only — a zero-grant tap accumulates nothing
    }
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
    // accepted activity — touches lastSeenMs only; FanStats.reacts counts
    // DISTINCT drama moments (momentReact, below), not pulse taps.
    this.touchFanStats(anonId, nowMs);
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

  /* ── REACT / the Pulse — drama moments (docs/MECHANISMS.md §4) ─────────── */

  /** The open window's id, or null. The server uses this to supersede. */
  activeMomentId(): string | null {
    return this.activeMoment?.momentId ?? null;
  }

  /** True when a SOFT trigger (swing/near-miss) may open a window: none active
   * and past the cooldown since the last close. Hard events bypass this. */
  canOpenSoft(nowMs = Date.now()): boolean {
    return this.activeMoment === null && nowMs - this.lastMomentClosedMs >= MOMENT_COOLDOWN_MS;
  }

  /** Open a drama window. The caller owns the open/supersede policy (and ends
   * any prior window first); this just installs the window and returns its
   * feeling palette. Returns null if one is already open (defensive). */
  beginMoment(momentId: string, kind: MomentKind, side: Side | null, minute: number | null, nowMs = Date.now()): readonly string[] | null {
    if (this.activeMoment) return null;
    this.activeMoment = { momentId, kind, side, minute, openedMs: nowMs, reacts: new Map() };
    return FEELING_PALETTES[kind];
  }

  /**
   * Record one fan's feeling at the open moment. One per fan (last-write-wins
   * until close). Rejected (false) if there's no open window, the momentId is
   * stale, or the token isn't in this kind's palette — expression stays inside
   * the curated set, and nothing is ever scored for correctness.
   */
  momentReact(anonId: string, momentId: string, side: Side, token: string, nowMs = Date.now()): boolean {
    const m = this.activeMoment;
    if (!m || m.momentId !== momentId) return false;
    if (!FEELING_PALETTES[m.kind].includes(token)) return false;
    const fs = this.touchFanStats(anonId, nowMs);
    if (!m.reacts.has(anonId)) fs.reacts += 1; // DISTINCT moments only — a re-pick in the same open moment adds nothing
    m.reacts.set(anonId, { token, side });
    return true;
  }

  /**
   * Close the open window and aggregate each end's feeling histogram. Returns
   * null if the id doesn't match the open window (already closed / superseded).
   * An end with no reactors returns honestly empty (top '' / pct 0 / {} / n 0).
   */
  endMoment(momentId: string, nowMs = Date.now()): {
    kind: MomentKind;
    side: Side | null;
    minute: number | null;
    byEnd: { home: MomentEndHist; away: MomentEndHist };
  } | null {
    const m = this.activeMoment;
    if (!m || m.momentId !== momentId) return null;
    const tally: { home: Record<string, number>; away: Record<string, number> } = { home: {}, away: {} };
    for (const { token, side } of m.reacts.values()) {
      tally[side][token] = (tally[side][token] ?? 0) + 1;
    }
    const fold = (h: Record<string, number>): MomentEndHist => {
      let top = '';
      let topN = 0;
      let n = 0;
      for (const [tok, c] of Object.entries(h)) {
        n += c;
        if (c > topN) {
          topN = c;
          top = tok;
        }
      }
      return { top, pct: n > 0 ? topN / n : 0, hist: h, n };
    };
    this.activeMoment = null;
    this.lastMomentClosedMs = nowMs;
    return { kind: m.kind, side: m.side, minute: m.minute, byEnd: { home: fold(tally.home), away: fold(tally.away) } };
  }

  /** The open window as an OPEN message payload, for catching up mid-window
   * joiners (server fills matchId/opensAt/closesAt/palette). Null when none. */
  activeMomentSnapshot(): { momentId: string; kind: MomentKind; side: Side | null; minute: number | null; openedMs: number } | null {
    const m = this.activeMoment;
    return m ? { momentId: m.momentId, kind: m.kind, side: m.side, minute: m.minute, openedMs: m.openedMs } : null;
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

  /** Everything snapshot.ts persists for restart continuity. Deliberately
   * excludes roar/pulse rolling counters (snapshot.ts doc comment) and the
   * activeMoment window (a live drama window shouldn't resurrect mid-air).
   * fanStats IS included — but first, every OPEN watch-time session is
   * checkpointed (folded into watchMs, start advanced to nowMs) WITHOUT being
   * closed: the socket is still connected, so a crash right after this call
   * loses at most one interval's worth of watch time, and — because
   * sessionStart itself is never persisted — a restore can never fabricate or
   * double-count the part already folded in here (FanStats.watchMs doc). */
  snapshot(nowMs = Date.now()) {
    this.foldOpenSessions(nowMs);
    return {
      matchId: this.matchId,
      rooted: Array.from(this.rooted.entries()),
      connectedCount: this.connected.size,
      roomCount: this.rooms.size,
      predictions: Array.from(this.predictions.entries()),
      predictLocked: this.predictLocked,
      verdicts: Array.from(this.verdicts.entries()),
      fanStats: Array.from(this.fanStats.entries()),
      nextGoalOpen: Array.from(this.nextGoalOpen.entries()),
      nextGoalVerdicts: Array.from(this.nextGoalVerdicts.entries()),
    };
  }
}
