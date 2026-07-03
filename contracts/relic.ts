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

/* ── v2 additions (memento law + pop system, coordinator 2026-07-04) ── */

/**
 * Every collectible surface carries print anatomy (SYSTEM.md §10): a serial
 * within its edition, the edition size (null = open edition), and the frame
 * caption. Serials are per-surface sequences (card Nº, stub Nº, poster Nº).
 */
export interface EditionInfo {
  serial: number;
  editionSize: number | null;
  /** caption strip text parts: fixture code · date · frame/relic name */
  caption: { fixture: string; dateISO: string; frameName: string };
}

/**
 * The card's four ratings, 0–99, derived from the fan's honest aggregates
 * for one match (derivations documented in SYSTEM.md; never invented):
 * LOU loudness · FTH faith (behind-weighted) · FOR foresight · PRE presence.
 */
export interface RatingsBlock {
  LOU: number;
  FTH: number;
  FOR: number;
  PRE: number;
}

/** Personal card = ScorecardData + ratings + edition. */
export interface CardData extends ScorecardData {
  ratings: RatingsBlock;
  edition: EditionInfo;
}

/** The END's card — the fanbase's match (his "collective stat cards"). */
export interface CollectiveCardData {
  fixture: Fixture;
  side: Side;
  finalScore: { home: number; away: number };
  rooted: number;
  standsScores: StandsVerdict['scores'];
  wonTheStands: boolean;
  /** the end's roar timeline (bucketed counts) */
  roar: number[];
  edition: EditionInfo;
  provenance: ProvenanceRefs;
}

/** Per-call stub = Receipt + edition + seat anatomy (END/ROW/SEAT). */
export interface StubData {
  receipt: Receipt;
  fixture: Fixture;
  end: string; // e.g. "MX"
  row: string; // display name of the fan's row
  seat: number; // position within the row (1-11)
  proved: boolean | null; // null = pending FT resolution
  edition: EditionInfo;
}
