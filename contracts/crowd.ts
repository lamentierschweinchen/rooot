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

export type ClientMsg = HelloMsg | CheerMsg | ReactMsg | CallMsg;

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

export type ServerMsg = StandsStateMsg | CallReceiptMsg | RoomStateMsg;
