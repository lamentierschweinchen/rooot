/**
 * ROOOT crowd seam — the wire protocol between apps/web and services/stands.
 *
 * FROZEN: only the coordinator changes this file. Lanes on either side build
 * against it; if you need a new field, ask the coordinator — do not fork shapes.
 *
 * Honesty rules encoded here:
 *  - Crowd signals are COUNTS of real taps/reacts. They are never converted
 *    into probabilities and never blended with market data (see match.ts).
 *  - Cheers are rate-decayed per user server-side: the roar measures crowd
 *    breadth, not one thumb with a macro.
 */

export type Side = 'home' | 'away';
export type ReactKind = 'belief' | 'nerves' | 'rage';

/* ── client → stands ──────────────────────────────────────────────── */

/** First message on connect (and on side-pick / room-join changes). */
export interface HelloMsg {
  type: 'hello';
  matchId: string;
  /** anonymous local id (localStorage); wallet linking happens later, at "keep" */
  anonId: string;
  /** display name, only used inside rows */
  name?: string;
  side?: Side;
  roomId?: string;
}

/** One tap. The server decays repeats; clients may batch bursts. */
export interface CheerMsg {
  type: 'cheer';
  matchId: string;
  side: Side;
  /** client tap count in this batch (server clamps + decays) */
  n: number;
  atMs: number;
}

export interface ReactMsg {
  type: 'react';
  matchId: string;
  side: Side;
  kind: ReactKind;
  atMs: number;
}

/**
 * A call — the rare, deliberate act. The stands service relays it on-chain
 * (walletless path) and answers with CallReceiptMsg. marketP is stamped by the
 * CLIENT from the live feed at press time and re-verified server-side against
 * the same feed window before relaying.
 */
export interface CallMsg {
  type: 'call';
  matchId: string;
  anonId: string;
  side: Side;
  /** short structured claim, e.g. "comeback", "next-goal-us", "final-2-1" */
  claim: string;
  minute: number | null;
  marketP: { home: number; draw: number; away: number };
  atMs: number;
}

/**
 * PREDICT — the universal entry claim (docs/MECHANISMS.md §2, the retention
 * spine). One per fan; editable until kickoff, then LOCKED server-side (a claim
 * on the future locks when the future starts). `marketAtPredict` is the client-
 * stamped de-vigged triple at predict time — "were you braver than the market?"
 * Scores are clamped 0..MAX server-side; a re-predict from the same anonId
 * replaces the prior (until lock).
 */
export interface PredictMsg {
  type: 'predict';
  matchId: string;
  anonId: string;
  home: number;
  away: number;
  marketAtPredict?: { home: number; draw: number; away: number };
  atMs: number;
}

export type ClientMsg = HelloMsg | CheerMsg | ReactMsg | CallMsg | PredictMsg;

/* ── stands → clients ─────────────────────────────────────────────── */

/** Broadcast ~4 Hz: the whole stands in one small frame. */
export interface StandsStateMsg {
  type: 'stands';
  matchId: string;
  ts: number;
  /** fans rooted per side (the counter) */
  counts: { home: number; away: number };
  /** decayed cheers/sec per side (the roar) */
  roar: { home: number; away: number };
  /** rolling react counts per side (the pulse) */
  pulse: { home: Record<ReactKind, number>; away: Record<ReactKind, number> };
  /** watching right now, total */
  presence: number;
}

/** Sent to the caller once the relayer lands the memo on-chain. */
export interface CallReceiptMsg {
  type: 'callReceipt';
  matchId: string;
  anonId: string;
  claim: string;
  minute: number | null;
  marketP: { home: number; draw: number; away: number };
  /** devnet tx signature — the receipt's anchor */
  txSig: string;
  atMs: number;
}

/** Row presence + marks for members of a room. */
export interface RoomStateMsg {
  type: 'room';
  roomId: string;
  members: Array<{ anonId: string; name: string; side: Side; present: boolean }>;
}

/**
 * One cohort's predictions (all fans, or fans rooted to one end). The crowd's
 * belief — the THIRD signal beside market and result (docs/MECHANISMS.md §2).
 * Means are decimal goals; `outcome` fractions sum to ~1; `modal` is the single
 * most-predicted exact scoreline. Never blended with market data.
 */
export interface PredictGroup {
  n: number;
  mean: { home: number; away: number };
  /** fraction predicting each result — home win / draw / away win */
  outcome: { homeWin: number; draw: number; awayWin: number };
  /** the single most common exact scoreline in this cohort */
  modal: { home: number; away: number; pct: number };
}

/**
 * The crowd's predicted scoreline, whole + sliced. `all` = everyone; `byRoot`
 * = the honest cuts ("ARG fans say…", "the doubters among them" =
 * byRoot.home.outcome.{draw+awayWin}). `locked` flips true at kickoff.
 */
export interface ConsensusMsg {
  type: 'consensus';
  matchId: string;
  ts: number;
  locked: boolean;
  all: PredictGroup;
  byRoot: { home: PredictGroup; away: PredictGroup; neutral: PredictGroup };
}

/** A fan's prediction resolved at full time (docs/MECHANISMS.md §2 → FORESIGHT). */
export interface PredictVerdictMsg {
  type: 'predictVerdict';
  matchId: string;
  anonId: string;
  predicted: { home: number; away: number };
  final: { home: number; away: number };
  /** exact score · right outcome (W/D/L) but wrong score · wrong outcome */
  verdict: 'exact' | 'outcome' | 'wrong';
}

export type ServerMsg = StandsStateMsg | CallReceiptMsg | RoomStateMsg | ConsensusMsg | PredictVerdictMsg;
