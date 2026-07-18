/**
 * Live SentimentAccumulator — captures a match's streams as FeedMsgs flow, and
 * crystallizes a SentimentRecord at full time (combining with the crowd data
 * from MatchState). One per match; fed from the server's broadcast path.
 *
 * Note: the service drops SUSPENDED odds (empty Pct) before broadcast, so live
 * records undercount suspensions vs the offline crystallizer (which reads raw).
 * Acceptable — the belief path/swings/volatility are all captured; flagged.
 */
import type { FeedMsg } from '@contracts/feed';
import type { ConsensusMsg, ServerMsg, Side } from '@contracts/crowd';
import type { MatchPhase } from '@contracts/match';
import type { LedgerEvent } from '@contracts/ledger';
import type { MomentFeeling, SentimentRecord } from '@contracts/sentiment';
import { summarizeMarket, assembleSentimentRecord, type MarketPoint } from './builder';

const MATERIAL = new Set(['goal', 'yellow-card', 'red-card', 'var', 'shot', 'corner', 'penalty-kick']);

/**
 * How much the crowd's FEELING swung across the match — the mean total-variation
 * distance between consecutive moments' whole-crowd feeling distributions (0 =
 * every moment felt the same, →1 = the mood lurched each time). <2 moments = 0.
 */
function computeFeelVolatility(moments: MomentFeeling[]): number {
  if (moments.length < 2) return 0;
  const dist = (m: MomentFeeling): Record<string, number> => {
    const h: Record<string, number> = {};
    let n = 0;
    for (const end of [m.byEnd.home, m.byEnd.away]) {
      for (const [tok, v] of Object.entries(end.hist)) {
        h[tok] = (h[tok] ?? 0) + v;
        n += v;
      }
    }
    if (n > 0) for (const tok of Object.keys(h)) h[tok] = (h[tok] ?? 0) / n;
    return h;
  };
  let sum = 0;
  let pairs = 0;
  let prev: Record<string, number> | null = null;
  for (const m of moments) {
    const cur = dist(m);
    if (prev) {
      let tv = 0;
      for (const tok of new Set([...Object.keys(prev), ...Object.keys(cur)])) tv += Math.abs((prev[tok] ?? 0) - (cur[tok] ?? 0));
      sum += tv / 2;
      pairs++;
    }
    prev = cur;
  }
  return pairs > 0 ? sum / pairs : 0;
}

export interface CrowdInputs {
  consensus: ConsensusMsg | null;
  rooted: { home: number; away: number };
  /** the harvest (2026-07-18) — computed by the caller from per-fan server
   * tallies; pass-throughs into the record's fans/points fields. */
  scorelines?: NonNullable<import('@contracts/sentiment').FanSentiment['scorelines']>;
  engagement?: NonNullable<import('@contracts/sentiment').FanSentiment['engagement']>;
  nerveDrift?: NonNullable<import('@contracts/sentiment').FanSentiment['nerveDrift']>;
  points?: SentimentRecord['points'];
}

/** One resolved, CALLED next-goal cycle (contracts/sentiment.ts
 * SentimentRecord['nextGoal'] rows — §1.4 Courage-Adjusted Calls' substrate). */
export type NextGoalRow = NonNullable<SentimentRecord['nextGoal']>[number];

export class SentimentAccumulator {
  private full: MarketPoint[] = [];
  private et: MarketPoint[] = [];
  private phases: MatchPhase[] = [];
  private phaseSnaps: Array<{ phase: MatchPhase; belief: { home: number; draw: number; away: number } }> = [];
  /** MATERIAL ledger events, deduped by wire event id — a goal/card/etc.
   * re-emits on the wire as it gets confirmed (Confirmed:false → true, scorer
   * names filled in later); a Map keyed by ev.id keeps only the LAST
   * emission per id (the most complete one) while preserving first-seen
   * chronological order (JS Map semantics: re-setting an EXISTING key
   * updates its value in place without moving its iteration position — only
   * a genuinely NEW id is appended at the end). Folded fix: the record was
   * storing each goal 3× — one entry per re-emission of the SAME ev.id, a
   * fabricated-looking inflation of a match's real event count. */
  private readonly eventsById = new Map<string, LedgerEvent>();
  /** the FELT drama moments (REACT reveals) — the feel.moments layer. */
  private readonly moments: MomentFeeling[] = [];
  /** resolved NEXT GOAL cycles (docs/BACKLOG-full-version-and-deferred-ideas.md
   * §2) — appended ONLY at real resolutions with at least one open call
   * (server.ts's nextGoalLifecycle calls nextGoalResolved below); never
   * synthesized. The record's nextGoal layer. */
  private readonly nextGoalRows: NextGoalRow[] = [];
  private minute: number | null = null;
  private lastBelief: { home: number; draw: number; away: number } | null = null;
  private final = { home: 0, away: 0 };
  /** roar captured live off the 4 Hz stands tick — the record's loudness layer. */
  private roarTotal = { home: 0, away: 0 };
  private roarPeak: { minute: number | null; side: Side; value: number } | null = null;
  /** the roar's shape — one sample per ~30s off the same 4 Hz tick (contracts/
   * sentiment.ts roarSeries; the harvest, 2026-07-18). Capped defensively. */
  private roarSeries: Array<{ minute: number | null; home: number; away: number }> = [];
  private lastRoarSampleMs = 0;
  private lastRoarMs: number | null = null;
  private fromMs = Infinity;
  private toMs = 0;

  constructor(
    readonly matchId: string,
    private readonly fixture: SentimentRecord['fixture'],
  ) {}

  onFeed(msg: ServerMsg | FeedMsg): void {
    switch (msg.type) {
      case 'status': {
        if (typeof msg.ev.minute === 'number') this.minute = msg.ev.minute;
        if (this.phases[this.phases.length - 1] !== msg.ev.phase) {
          this.phases.push(msg.ev.phase);
          if (this.lastBelief) this.phaseSnaps.push({ phase: msg.ev.phase, belief: this.lastBelief });
        }
        break;
      }
      case 'score':
        this.final = { home: msg.ev.home, away: msg.ev.away };
        if (typeof msg.ev.minute === 'number') this.minute = msg.ev.minute;
        break;
      case 'stands': {
        // roar is a decayed cheers/sec rate off the 4 Hz tick; integrate it for a
        // ~total and remember the single loudest instant (either end) as the peak.
        // dt is clamped so a reconnect/idle gap can't inflate the total.
        const dt = this.lastRoarMs != null ? Math.max(0, Math.min(2000, msg.ts - this.lastRoarMs)) / 1000 : 0;
        this.lastRoarMs = msg.ts;
        this.roarTotal.home += msg.roar.home * dt;
        this.roarTotal.away += msg.roar.away * dt;
        if (msg.roar.home > (this.roarPeak?.value ?? 0)) this.roarPeak = { minute: this.minute, side: 'home', value: msg.roar.home };
        if (msg.roar.away > (this.roarPeak?.value ?? 0)) this.roarPeak = { minute: this.minute, side: 'away', value: msg.roar.away };
        if (msg.ts - this.lastRoarSampleMs >= 30_000 && this.roarSeries.length < 400) {
          this.lastRoarSampleMs = msg.ts;   // the tick's own clock — same source dt integrates on
          this.roarSeries.push({ minute: this.minute, home: +msg.roar.home.toFixed(3), away: +msg.roar.away.toFixed(3) });
        }
        break;
      }
      case 'odds': {
        const t = msg.tick;
        const b = { home: t.pHome, draw: t.pDraw, away: t.pAway };
        if (t.period === 'et') this.et.push({ minute: this.minute, triple: b });
        else { this.lastBelief = b; this.full.push({ minute: this.minute, triple: b }); }
        this.toMs = Math.max(this.toMs, t.tMs);
        this.fromMs = Math.min(this.fromMs, t.tMs);
        break;
      }
      case 'ledger': {
        if (msg.msg.type !== 'event') break;
        const ev = msg.msg.ev;
        if (typeof ev.minute === 'number') this.minute = ev.minute;
        if (MATERIAL.has(ev.kind)) this.eventsById.set(ev.id, ev); // last emission wins — see eventsById doc
        break;
      }
      case 'momentResult': {
        // a FELT moment (docs/MECHANISMS.md §4). Store only when at least one end
        // reacted — an unwatched drama is already in events[]; feel.moments is for
        // what was actually FELT, never synthesized from an empty window.
        const { home, away } = msg.byEnd;
        if (home.n > 0 || away.n > 0) {
          this.moments.push({
            momentId: msg.momentId,
            kind: msg.kind,
            minute: msg.minute,
            byEnd: {
              home: { top: home.top, pct: home.pct, hist: home.hist },
              away: { top: away.top, pct: away.pct, hist: away.hist },
            },
          });
        }
        break;
      }
      default:
        break;
    }
  }

  /** Snapshot persistence only (services/stands/src/snapshot.ts): the felt-moment
   * history accumulated so far, so a mid-match restart doesn't silently drop
   * moments felt before it from the eventual full-time record. Returns a copy —
   * callers must not mutate the live accumulator through it. */
  getMoments(): MomentFeeling[] {
    return [...this.moments];
  }

  /** The market's per-minute belief PATH so far (minute-stamped de-vigged 1X2 triples) — the
   * substrate the mint's cloth-record assembler weaves into the scarf's belief bands. Present only
   * while this accumulator is warm (it's rebuilt by feed replay on boot and evicted with the
   * match), so the assembler treats an empty/absent return as "reconstruct coarsely from the
   * on-disk record's swings instead." Returns a copy — callers must not mutate the live path. */
  getBeliefPath(): MarketPoint[] {
    return this.full.filter((p) => p.minute != null && p.triple != null).map((p) => ({ ...p }));
  }

  /** Snapshot restore only: reinstate moments felt before a restart. Call once,
   * right after construction (boot time) — appends, does not dedupe. */
  restoreMoments(moments: MomentFeeling[]): void {
    this.moments.push(...moments);
  }

  /** Snapshot persistence: the roar samples so far (mirrors getMoments). */
  getRoarSeries(): Array<{ minute: number | null; home: number; away: number }> {
    return [...this.roarSeries];
  }
  /** Snapshot restore only: reinstate samples taken before a restart. */
  restoreRoarSeries(rows: Array<{ minute: number | null; home: number; away: number }>): void {
    this.roarSeries.push(...rows);
  }

  /** Append one resolved NEXT GOAL cycle — called by server.ts's
   * nextGoalLifecycle at a REAL resolution only (a goal CONFIRMING on the
   * wire, or FULL_TIME), and only when the cycle had at least one open call
   * (an uncalled cycle appends nothing — its ordinal is skipped, the honest
   * gap; mirrors feel.moments' "only what was actually FELT" discipline). */
  nextGoalResolved(row: NextGoalRow): void {
    this.nextGoalRows.push(row);
  }

  /** Snapshot persistence only (services/stands/src/snapshot.ts): the resolved
   * next-goal cycles so far, so a mid-match restart doesn't silently drop
   * cycles resolved before it from the eventual full-time record — the exact
   * guarantee getMoments() above provides for felt moments. Returns a copy. */
  getNextGoalRows(): NextGoalRow[] {
    return [...this.nextGoalRows];
  }

  /** Snapshot restore only: reinstate cycles resolved before a restart. Call
   * once, right after construction (boot time) — appends, does not dedupe. */
  restoreNextGoalRows(rows: NextGoalRow[]): void {
    this.nextGoalRows.push(...rows);
  }

  /** crystallize the record (call at FULL_TIME with the crowd data).
   * `finalScoreOverride`, when given, wins over the live-tracked `this.final`
   * (folded fix: the record's finalScore came out empty despite a real FT
   * 2-1 on the wire — server.ts's predictLifecycle already has a proven-
   * reliable final score, sourced from the SAME joinSnapshots cache the
   * resolved-verdict path depends on, so the live call site now passes it
   * straight through instead of trusting this class's own separate 'score'
   * tracking to have landed it. Optional so existing callers with no
   * override — the offline crystallizer never calls this class at all, and
   * the dev-check/dry-run callers — keep working unchanged off `this.final`.
   *
   * `txlineRefs` (docs/DATA-ARCHITECTURE.md §4 item 2 — "relics carry their
   * own provenance"): the caller's already-fetched, already-compacted TxLINE
   * validation proofs (ingest/txline.ts's fetchProvenanceRefs), populated
   * BEFORE this call so assembleSentimentRecord hashes them in — the record's
   * recordHash then covers its own provenance for free. Optional, defaults to
   * an honest [] so every existing caller (offline crystallizer, dev-check/
   * dry-run callers, and a live match with no significant swing yet or a
   * failed proof fetch) keeps working exactly as before. */
  crystallize(crowd: CrowdInputs, edition: SentimentRecord['edition'], finalScoreOverride?: { home: number; away: number }, txlineRefs: string[] = []): SentimentRecord {
    const market = summarizeMarket(this.full, this.phaseSnaps, this.et);
    const con = crowd.consensus;
    // optimism = a fanbase's own-win prediction rate − the market's implied
    // win-prob for them at kickoff (the honest BELIEVE − BET gap).
    const mktHome = market.open ? market.open.home : 0;
    const mktAway = market.open ? market.open.away : 0;
    const optimismGap = {
      home: con && con.byRoot.home.n > 0 ? con.byRoot.home.outcome.homeWin - mktHome : 0,
      away: con && con.byRoot.away.n > 0 ? con.byRoot.away.outcome.awayWin - mktAway : 0,
    };
    const doubters = {
      home: con && con.byRoot.home.n > 0 ? 1 - con.byRoot.home.outcome.homeWin : 0,
      away: con && con.byRoot.away.n > 0 ? 1 - con.byRoot.away.outcome.awayWin : 0,
    };
    const fans = {
      rootedAtLock: crowd.rooted,
      consensus: con,
      optimismGap,
      doubters,
      calls: { total: 0, proved: 0, failed: 0, bravestProved: null }, // call accounting: follow-up
      faith: { home: 0, away: 0 }, // faith accumulation: follow-up
      ...(crowd.scorelines ? { scorelines: crowd.scorelines } : {}),
      ...(crowd.engagement ? { engagement: crowd.engagement } : {}),
      ...(crowd.nerveDrift ? { nerveDrift: crowd.nerveDrift } : {}),
    };
    const feel = {
      moments: this.moments,
      roar: { peak: this.roarPeak, total: this.roarTotal },
      ...(this.roarSeries.length ? { roarSeries: [...this.roarSeries] } : {}),
      volatility: computeFeelVolatility(this.moments),
    };
    return assembleSentimentRecord({
      matchId: this.matchId,
      fixture: this.fixture,
      finalScore: finalScoreOverride ?? this.final,
      phasePath: this.phases,
      market, fans, feel, events: Array.from(this.eventsById.values()),
      nextGoal: [...this.nextGoalRows],
      points: crowd.points,
      edition,
      capture: { fromMs: this.fromMs === Infinity ? this.toMs : this.fromMs, toMs: this.toMs },
      network: 'devnet',
      txlineRefs,
      attendeeRoot: null,
    });
  }
}
