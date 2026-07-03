/**
 * ROOOT relic seam — the shapes the relic generators (scarf, pin) and the mint
 * consume. FROZEN: only the coordinator changes this file.
 *
 * Provenance rule: a relic must carry everything needed to verify it against
 * the world after the feed is gone — TxLINE Merkle refs for the market data,
 * the attendee root for the crowd, the tx signatures for the calls.
 */

import type { Fixture } from './match';
import type { ReactKind, Side } from './crowd';

/** One proven call — the receipt, as it lives on a relic. */
export interface Receipt {
  claim: string;
  minute: number | null;
  side: Side;
  marketP: { home: number; draw: number; away: number };
  txSig: string;
  atMs: number;
  /** resolved after FT */
  proved?: boolean;
}

/** Downsampled market path — the tide's history (≈1 point per 15–30s). */
export interface OddsPathPoint {
  tMs: number;
  minute: number | null;
  pHome: number;
  pDraw: number;
  pAway: number;
}

export interface GoalMark {
  minute: number | null;
  side: Side;
  scorer?: string;
}

/** Per-side crowd timeline, bucketed (honest counts, not percentages). */
export interface CrowdTimeline {
  bucketSec: number;
  roar: { home: number[]; away: number[] };
  pulse: { home: Record<ReactKind, number[]>; away: Record<ReactKind, number[]> };
}

export interface StandsVerdict {
  /** loudness, faith (behind-weighted ×2), presence, foresight — real aggregates */
  scores: { home: Record<'loudness' | 'faith' | 'presence' | 'foresight', number>; away: Record<'loudness' | 'faith' | 'presence' | 'foresight', number> };
  winner: Side | 'draw';
}

/** The communal artifact: one per match, an edition per attendee. */
export interface MatchRelicData {
  fixture: Fixture;
  finalScore: { home: number; away: number };
  oddsPath: OddsPathPoint[];
  goals: GoalMark[];
  crowd: CrowdTimeline;
  verdict: StandsVerdict;
  provenance: ProvenanceRefs;
}

/** The personal artifact: your match. */
export interface ScorecardData {
  matchRelic: Pick<MatchRelicData, 'fixture' | 'finalScore' | 'goals' | 'verdict'>;
  side: Side;
  /** your taps over time (bucketed) and your faith windows (cheering while behind) */
  myRoar: number[];
  faithBuckets: number[];
  receipts: Receipt[];
  roomId?: string;
  rowNames?: string[];
}

export interface ProvenanceRefs {
  /** TxLINE Merkle anchors covering the odds/scores window used */
  txlineRefs: string[];
  /** Merkle root of attendee anonIds (prove "I'm in the crowd photo") */
  attendeeRoot: string;
  /** capture window */
  fromMs: number;
  toMs: number;
  network: 'devnet' | 'mainnet-beta';
}
