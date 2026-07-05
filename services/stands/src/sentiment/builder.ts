/**
 * SENTIMENT BUILDER — crystallizes a SentimentRecord (contracts/sentiment.ts).
 *
 * Pure functions over TYPED inputs, so the same code produces a record BOTH
 * offline (a script parses a captured match) and live (the service accumulates
 * the streams at full time). Every number traces to the wire or real crowd
 * counts; nothing is synthesized.
 */
import { createHash } from 'node:crypto';
import type {
  Divergence,
  FanbaseSentiment,
  FanSentiment,
  InGameSentiment,
  MarketSentiment,
  MarketSwing,
  SentimentRecord,
  Triple,
} from '@contracts/sentiment';
import type { LedgerEvent } from '@contracts/ledger';
import type { MatchPhase } from '@contracts/match';
import type { Side } from '@contracts/crowd';

const SWING_FLOOR = 0.06; // a leg must move ≥6 pts to count as a swing (not drift)

/** one point on the market's belief path (minute latched from the wire clock). */
export interface MarketPoint {
  minute: number | null;
  triple: Triple | null; // null = SUSPENDED (empty Pct — a held breath)
}

function favored(t: Triple): Side | 'draw' {
  if (t.home >= t.draw && t.home >= t.away) return 'home';
  if (t.away >= t.home && t.away >= t.draw) return 'away';
  return 'draw';
}
function dist2(a: Triple, b: Triple): number {
  return Math.max(Math.abs(a.home - b.home), Math.abs(a.draw - b.draw), Math.abs(a.away - b.away));
}

/** summarize the market's belief path into the BET sentiment. `etPoints` = the
 * ET-scoped 1X2 (period 'et'); its close is the honest read for ET-decided games. */
export function summarizeMarket(points: MarketPoint[], perPhase: Array<{ phase: MatchPhase; belief: Triple }>, etPoints: MarketPoint[] = []): MarketSentiment {
  const live = points.filter((p): p is { minute: number | null; triple: Triple } => p.triple !== null);
  const etLive = etPoints.filter((p): p is { minute: number | null; triple: Triple } => p.triple !== null);
  const etClose = etLive.length ? etLive[etLive.length - 1]!.triple : null;
  const suspensions = points.length - live.length + (etPoints.length - etLive.length);
  const empty: MarketSentiment = {
    open: null, close: null, etClose, perPhase, biggestSwing: null, swings: [], suspensions,
    favoredMinutes: { home: 0, draw: 0, away: 0 }, leadChanges: 0, volatility: 0,
    conviction: { mean: 0, max: 0 }, ticks: 0,
  };
  if (live.length === 0) return empty;

  const swings: MarketSwing[] = [];
  let biggest: MarketSwing | null = null;
  let volatility = 0, convSum = 0, convMax = 0, leadChanges = 0;
  const favMin: Record<Side | 'draw', number> = { home: 0, draw: 0, away: 0 };
  let kept = live[0]!.triple;
  let lastFav = favored(kept);
  const uniform: Triple = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };

  for (let i = 0; i < live.length; i++) {
    const cur = live[i]!.triple;
    const conv = dist2(cur, uniform);
    convSum += conv; if (conv > convMax) convMax = conv;
    if (i > 0) {
      const prev = live[i - 1]!.triple;
      volatility += Math.abs(cur.home - prev.home) + Math.abs(cur.draw - prev.draw) + Math.abs(cur.away - prev.away);
    }
    const f = favored(cur);
    favMin[f] += 1; // tick-weighted; the caller can supply minute weights for time-weighting
    if (f !== lastFav) { leadChanges++; lastFav = f; }
    const dMax = dist2(cur, kept);
    if (dMax >= SWING_FLOOR) {
      const sw: MarketSwing = { minute: live[i]!.minute, from: kept, to: cur, deltaMax: dMax, toward: f };
      swings.push(sw);
      if (!biggest || dMax > biggest.deltaMax) biggest = sw;
      kept = cur;
    }
  }
  return {
    open: live[0]!.triple,
    close: live[live.length - 1]!.triple,
    etClose,
    perPhase,
    biggestSwing: biggest,
    swings,
    suspensions,
    favoredMinutes: favMin,
    leadChanges,
    volatility,
    conviction: { mean: convSum / live.length, max: convMax },
    ticks: live.length,
  };
}

/** the crowd's foresight verdict vs the final score. */
function verdict(pred: { home: number; away: number } | null, fh: number, fa: number): 'exact' | 'outcome' | 'wrong' | null {
  if (!pred) return null;
  if (pred.home === fh && pred.away === fa) return 'exact';
  return Math.sign(pred.home - pred.away) === Math.sign(fh - fa) ? 'outcome' : 'wrong';
}

/** BELIEVE − BET, BELIEVE − HAPPEN, BET − HAPPEN. */
export function computeDivergence(market: MarketSentiment, fans: FanSentiment, fh: number, fa: number): Divergence {
  const con = fans.consensus;
  const crowdPred = con ? { home: Math.round(con.all.mean.home), away: Math.round(con.all.mean.away) } : null;
  const homePred = con && con.byRoot.home.n > 0 ? { home: Math.round(con.byRoot.home.mean.home), away: Math.round(con.byRoot.home.mean.away) } : null;
  const awayPred = con && con.byRoot.away.n > 0 ? { home: Math.round(con.byRoot.away.mean.home), away: Math.round(con.byRoot.away.mean.away) } : null;
  // upset: how far the DECISIVE market's closing belief was from the truth
  // (the winning leg should have been ~1; 1 − that prob = how surprised the
  // money was). For an ET/pens-decided match the ET market is the honest read —
  // the full-match line had already settled to a draw at 90'.
  const decisive = market.etClose ?? market.close;
  let upset = 0;
  if (decisive) {
    const winLeg = fh > fa ? decisive.home : fa > fh ? decisive.away : decisive.draw;
    upset = Math.max(0, 1 - winLeg);
  }
  return {
    optimismGap: fans.optimismGap,
    foresight: { crowd: verdict(crowdPred, fh, fa), byEnd: { home: verdict(homePred, fh, fa), away: verdict(awayPred, fh, fa) } },
    upsetIndex: upset,
  };
}

/** foresight verdict → accuracy score for the fingerprint. */
function fsScore(v: 'exact' | 'outcome' | 'wrong' | null): number {
  return v === 'exact' ? 1 : v === 'outcome' ? 0.5 : 0;
}

/** this match's contribution to each fanbase's running fingerprint. */
export function computeFingerprint(fixture: SentimentRecord['fixture'], fans: FanSentiment, feel: InGameSentiment, div: Divergence): { home: FanbaseSentiment; away: FanbaseSentiment } {
  return {
    home: { fanbase: fixture.home.code, optimism: fans.optimismGap.home, volatility: feel.volatility, foresight: fsScore(div.foresight.byEnd.home), loyalty: fans.faith.home, matchesContributed: 1 },
    away: { fanbase: fixture.away.code, optimism: fans.optimismGap.away, volatility: feel.volatility, foresight: fsScore(div.foresight.byEnd.away), loyalty: fans.faith.away, matchesContributed: 1 },
  };
}

/** the one-line auto story. */
export function deriveHeadline(rec: Omit<SentimentRecord, 'headline' | 'provenance'>): string {
  const { home, away } = rec.fixture;
  const s = `${home.code} ${rec.finalScore.home}–${rec.finalScore.away} ${away.code}`;
  const goals = rec.finalScore.home + rec.finalScore.away; // real total (penalties count)
  const bits: string[] = [];
  if (goals >= 5) bits.push('a goal-storm');
  else if (goals === 0) bits.push('a goalless stalemate');
  if (rec.market.leadChanges >= 2) bits.push('the favourite flipped');
  if (rec.divergence.upsetIndex > 0.5) bits.push('an upset the money never saw');
  if (rec.decidedIn === 'ET') bits.push('decided in extra time');
  else if (rec.decidedIn === 'PENS') bits.push('settled on penalties');
  if (rec.market.biggestSwing && rec.market.biggestSwing.deltaMax > 0.25) {
    bits.push(`the ${rec.market.biggestSwing.minute ?? '?'}' collapse`);
  }
  return bits.length ? `${s} — ${bits.join(', ')}.` : `${s}.`;
}

/** canonical sha256 of the record (minus the mutable provenance anchors). */
export function hashRecord(rec: Omit<SentimentRecord, 'provenance'> & { provenance: Omit<SentimentRecord['provenance'], 'recordHash' | 'anchorTxSig'> }): string {
  return createHash('sha256').update(JSON.stringify(rec)).digest('hex');
}

/** phase path → how the match was decided. */
export function decidedIn(phases: MatchPhase[]): '90' | 'ET' | 'PENS' {
  if (phases.includes('PENALTIES')) return 'PENS';
  if (phases.includes('EXTRA_TIME')) return 'ET';
  return '90';
}

export interface AssembleInputs {
  matchId: string;
  fixture: SentimentRecord['fixture'];
  finalScore: { home: number; away: number };
  phasePath: MatchPhase[];
  market: MarketSentiment;
  fans: FanSentiment;
  feel: InGameSentiment;
  events: LedgerEvent[];
  edition: SentimentRecord['edition'];
  capture: { fromMs: number; toMs: number };
  network: 'devnet' | 'mainnet-beta';
  txlineRefs: string[];
  attendeeRoot: string | null;
}

/** assemble a complete, hashed SentimentRecord (anchorTxSig filled by the relayer after). */
export function assembleSentimentRecord(inp: AssembleInputs): SentimentRecord {
  const div = computeDivergence(inp.market, inp.fans, inp.finalScore.home, inp.finalScore.away);
  const fingerprint = computeFingerprint(inp.fixture, inp.fans, inp.feel, div);
  const base = {
    version: 1 as const,
    matchId: inp.matchId,
    fixture: inp.fixture,
    finalScore: inp.finalScore,
    phasePath: inp.phasePath,
    decidedIn: decidedIn(inp.phasePath),
    market: inp.market,
    fans: inp.fans,
    feel: inp.feel,
    events: inp.events,
    divergence: div,
    fingerprint,
    edition: inp.edition,
  };
  const headline = deriveHeadline(base);
  const provBase = { txlineRefs: inp.txlineRefs, attendeeRoot: inp.attendeeRoot, capture: inp.capture, network: inp.network };
  const recordHash = hashRecord({ ...base, headline, provenance: provBase });
  return { ...base, headline, provenance: { ...provBase, recordHash, anchorTxSig: null } };
}

/** fold many records into each fanbase's running fingerprint (the data product). */
export function foldFingerprints(records: SentimentRecord[]): Map<string, FanbaseSentiment> {
  const acc = new Map<string, FanbaseSentiment>();
  const add = (f: FanbaseSentiment): void => {
    const cur = acc.get(f.fanbase);
    if (!cur) { acc.set(f.fanbase, { ...f }); return; }
    const n = cur.matchesContributed + 1;
    acc.set(f.fanbase, {
      fanbase: f.fanbase,
      optimism: (cur.optimism * cur.matchesContributed + f.optimism) / n,
      volatility: (cur.volatility * cur.matchesContributed + f.volatility) / n,
      foresight: (cur.foresight * cur.matchesContributed + f.foresight) / n,
      loyalty: (cur.loyalty * cur.matchesContributed + f.loyalty) / n,
      matchesContributed: n,
    });
  };
  for (const r of records) { add(r.fingerprint.home); add(r.fingerprint.away); }
  return acc;
}
