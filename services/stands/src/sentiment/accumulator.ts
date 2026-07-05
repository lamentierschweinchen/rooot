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
}

export class SentimentAccumulator {
  private full: MarketPoint[] = [];
  private et: MarketPoint[] = [];
  private phases: MatchPhase[] = [];
  private phaseSnaps: Array<{ phase: MatchPhase; belief: { home: number; draw: number; away: number } }> = [];
  private events: LedgerEvent[] = [];
  /** the FELT drama moments (REACT reveals) — the feel.moments layer. */
  private readonly moments: MomentFeeling[] = [];
  private minute: number | null = null;
  private lastBelief: { home: number; draw: number; away: number } | null = null;
  private final = { home: 0, away: 0 };
  /** roar captured live off the 4 Hz stands tick — the record's loudness layer. */
  private roarTotal = { home: 0, away: 0 };
  private roarPeak: { minute: number | null; side: Side; value: number } | null = null;
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
        if (MATERIAL.has(ev.kind)) this.events.push(ev);
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

  /** crystallize the record (call at FULL_TIME with the crowd data). */
  crystallize(crowd: CrowdInputs, edition: SentimentRecord['edition']): SentimentRecord {
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
    };
    const feel = {
      moments: this.moments,
      roar: { peak: this.roarPeak, total: this.roarTotal },
      volatility: computeFeelVolatility(this.moments),
    };
    return assembleSentimentRecord({
      matchId: this.matchId,
      fixture: this.fixture,
      finalScore: this.final,
      phasePath: this.phases,
      market, fans, feel, events: this.events,
      edition,
      capture: { fromMs: this.fromMs === Infinity ? this.toMs : this.fromMs, toMs: this.toMs },
      network: 'devnet',
      txlineRefs: [],
      attendeeRoot: null,
    });
  }
}
