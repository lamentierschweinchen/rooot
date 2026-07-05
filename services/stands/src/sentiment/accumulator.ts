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
import type { ConsensusMsg, ServerMsg } from '@contracts/crowd';
import type { MatchPhase } from '@contracts/match';
import type { LedgerEvent } from '@contracts/ledger';
import type { SentimentRecord } from '@contracts/sentiment';
import { summarizeMarket, assembleSentimentRecord, type MarketPoint } from './builder';

const MATERIAL = new Set(['goal', 'yellow-card', 'red-card', 'var', 'shot', 'corner', 'penalty-kick']);

export interface CrowdInputs {
  consensus: ConsensusMsg | null;
  rooted: { home: number; away: number };
  roarTotal: { home: number; away: number };
}

export class SentimentAccumulator {
  private full: MarketPoint[] = [];
  private et: MarketPoint[] = [];
  private phases: MatchPhase[] = [];
  private phaseSnaps: Array<{ phase: MatchPhase; belief: { home: number; draw: number; away: number } }> = [];
  private events: LedgerEvent[] = [];
  private minute: number | null = null;
  private lastBelief: { home: number; draw: number; away: number } | null = null;
  private final = { home: 0, away: 0 };
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
      moments: [], // per-moment reaction histograms: wired with REACT
      roar: { peak: null, total: crowd.roarTotal },
      volatility: 0,
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
