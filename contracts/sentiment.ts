/**
 * ROOOT sentiment seam — THE SENTIMENT RECORD (docs/SENTIMENT.md).
 * FROZEN: only the coordinator changes this file.
 *
 * One record per match, crystallized at full time. It captures the three
 * sentiments + reality — BET (market) · BELIEVE (fans) · FEEL (in-game) ·
 * HAPPEN (result) — and the DIVERGENCES between them, which is where the
 * value lives. It is BOTH:
 *   · a collectible — provenance-anchored, editioned, ownable (the match's
 *     sentiment crystallized alongside its scarf); and
 *   · a data product — every field is a real, comparable measurement; folded
 *     across a tournament it yields each fanbase's sentiment fingerprint (the
 *     fan-sentiment index a broadcaster/sponsor would pay for).
 *
 * Honesty: every number traces to the wire or to real crowd counts. Crowd
 * sections are empty (n=0) when no fans were present — never synthesized.
 * The three sentiments are never blended into one figure.
 */

import type { Side } from './crowd';
import type { ConsensusMsg } from './crowd';
import type { LedgerEvent } from './ledger';
import type { MatchPhase } from './match';

/** A de-vigged 1X2 probability triple (sums ≈ 1). */
export interface Triple {
  home: number;
  draw: number;
  away: number;
}

/* ── BET — market sentiment (the money's calibrated, leading read) ──── */

export interface MarketSwing {
  minute: number | null;
  from: Triple;
  to: Triple;
  /** the largest single-leg move, in probability points (0..1) */
  deltaMax: number;
  /** which leg gained most */
  toward: Side | 'draw';
}

export interface MarketSentiment {
  /** belief at kickoff and at the full-match market's close */
  open: Triple | null;
  close: Triple | null;
  /** the ET-scoped market's closing belief (null unless the match went to ET) —
   * for an ET/pens-decided match this, not `close`, is the honest final read */
  etClose: Triple | null;
  /** belief at each phase boundary (H1/HT/H2/ET…) */
  perPhase: Array<{ phase: MatchPhase; belief: Triple }>;
  /** the single biggest swing of the match (the "58' collapse" moment) */
  biggestSwing: MarketSwing | null;
  /** every meaningful swing (past the noise floor) */
  swings: MarketSwing[];
  /** empty price vectors — the market literally holding its breath */
  suspensions: number;
  /** minutes each side / the draw was the favourite */
  favoredMinutes: { home: number; draw: number; away: number };
  /** times the favourite flipped */
  leadChanges: number;
  /** total absolute belief movement — the market's nervousness */
  volatility: number;
  /** how far from 33/33/33 the market sat (mean + peak) — its conviction */
  conviction: { mean: number; max: number };
  /** usable 1X2 ticks the summary was built from */
  ticks: number;
}

/* ── BELIEVE — fan sentiment (the heart's biased, fixed-at-entry read) ─ */

export interface FanSentiment {
  rootedAtLock: { home: number; away: number };
  /** the crowd's predicted scoreline at kickoff (all + by rooted end) */
  consensus: ConsensusMsg | null;
  /** each fanbase's optimism = its mean-implied win-prob − the market's, at KO */
  optimismGap: { home: number; away: number };
  /** % of each fanbase that predicted their OWN team does not win */
  doubters: { home: number; away: number };
  calls: {
    total: number;
    proved: number;
    failed: number;
    /** the bravest proved call — lowest market-prob of the called side that hit */
    bravestProved: { claim: string; minute: number | null; marketProb: number } | null;
  };
  /** cheering-while-behind aggregate per end (faith) */
  faith: { home: number; away: number };
}

/* ── FEEL — in-game sentiment (the nervous system's reflexive, lagging read) */

export interface MomentFeeling {
  momentId: string;
  kind: string; // goal | var | red | penalty | full-time …
  minute: number | null;
  /** per end: top emoji + its share + the full histogram */
  byEnd: {
    home: { top: string; pct: number; hist: Record<string, number> };
    away: { top: string; pct: number; hist: Record<string, number> };
  };
}

export interface InGameSentiment {
  moments: MomentFeeling[];
  roar: {
    peak: { minute: number | null; side: Side; value: number } | null;
    total: { home: number; away: number };
  };
  /** how much the feeling swung across the match */
  volatility: number;
}

/* ── DERIVED — the divergences (where the value is) ──────────────────── */

export interface Divergence {
  /** BELIEVE − BET: fan optimism vs the money, per fanbase */
  optimismGap: { home: number; away: number };
  /** BELIEVE − HAPPEN: did the crowd call it (whole + per end) */
  foresight: {
    crowd: 'exact' | 'outcome' | 'wrong' | null;
    byEnd: { home: 'exact' | 'outcome' | 'wrong' | null; away: 'exact' | 'outcome' | 'wrong' | null };
  };
  /** BET − HAPPEN: how wrong the market's closing belief was (0=nailed it, 1=full upset) */
  upsetIndex: number;
}

/* ── the fanbase fingerprint (the tournament-long fold) ──────────────── */

export interface FanbaseSentiment {
  fanbase: string; // team code
  /** mean optimism gap this fanbase showed (+ = over-optimistic vs market) */
  optimism: number;
  /** feeling volatility — how reactive this crowd is */
  volatility: number;
  /** foresight accuracy 0..1 (exact=1, outcome=0.5, wrong=0) */
  foresight: number;
  /** loyalty under fire — faith (cheering while behind) */
  loyalty: number;
  matchesContributed: number;
}

/* ── the record ──────────────────────────────────────────────────────── */

export interface SentimentRecord {
  version: 1;
  matchId: string;
  fixture: {
    home: { code: string; name: string; colors: readonly [string, string] };
    away: { code: string; name: string; colors: readonly [string, string] };
    competition: string;
    dateISO: string;
  };
  finalScore: { home: number; away: number };
  /** the status ladder actually walked (H1→HT→…→FT) */
  phasePath: MatchPhase[];
  decidedIn: '90' | 'ET' | 'PENS';
  /** auto-derived one-line story ("double-comeback, decided in extra time") */
  headline: string;

  market: MarketSentiment;
  fans: FanSentiment;
  feel: InGameSentiment;
  /** the material events (goals w/ scorer+type, cards, VAR…) */
  events: LedgerEvent[];
  divergence: Divergence;
  /** this match's contribution to each fanbase's running fingerprint */
  fingerprint: { home: FanbaseSentiment; away: FanbaseSentiment };

  edition: { serial: number; editionSize: number | null; caption: string };
  provenance: {
    /** TxLINE Merkle anchors covering the market window */
    txlineRefs: string[];
    /** Merkle root of attendee anonIds ("I'm in the crowd photo") */
    attendeeRoot: string | null;
    capture: { fromMs: number; toMs: number };
    network: 'devnet' | 'mainnet-beta';
    /** sha256 of the canonical record (minus this field) — the collectible's id */
    recordHash: string;
    /** devnet memo tx anchoring recordHash on-chain (null until relayed) */
    anchorTxSig: string | null;
  };
}

/** The message that ships a crystallized record to clients at full time. */
export interface SentimentRecordMsg {
  type: 'sentiment';
  record: SentimentRecord;
}
