/**
 * ROOOT data seam — the football-native descendant of STRATA's DataSource.
 *
 * One interface, many bodies: TxLineDataSource (live SSE), ReplaySource
 * (recorded JSONL fixtures — first-class, honestly labeled), MockSource (dev).
 * Visuals and audio both subscribe to the same callbacks: one event bus, two senses.
 *
 * Honesty rule: pHome/pDraw/pAway are the market's de-vigged probabilities
 * (TxLINE StablePrice). They are never synthesized, smoothed into fiction,
 * or blended with crowd data. Crowd signals (cheers, pulse) travel on a
 * separate bus and are never expressed as probabilities.
 */

export type MatchPhase =
  | 'PRE'
  | 'FIRST_HALF'
  | 'HALF_TIME'
  | 'SECOND_HALF'
  | 'EXTRA_TIME'
  | 'PENALTIES'
  | 'FULL_TIME';

export interface TeamRef {
  /** Short code, e.g. "MEX" */
  code: string;
  name: string;
  /** [primary, secondary] hex — the end wears these */
  colors: [string, string];
  /** Unicode flag glyph (no federation marks, ever) */
  flag: string;
}

export interface Fixture {
  id: string;
  home: TeamRef;
  away: TeamRef;
  kickoffISO: string;
  venue?: string;
}

/** The tide. Sum of the three ≈ 1 (de-vigged). */
export interface OddsTick {
  /** ms epoch when the tick was received (replay: original receivedAt) */
  tMs: number;
  /** match minute if the feed carries it, else null */
  minute: number | null;
  pHome: number;
  pDraw: number;
  pAway: number;
  source: 'live' | 'replay';
  raw?: unknown;
}

export interface ScoreEvent {
  tMs: number;
  minute: number | null;
  home: number;
  away: number;
  side?: 'home' | 'away';
  scorer?: string;
  source: 'live' | 'replay';
  raw?: unknown;
}

export interface StatusEvent {
  tMs: number;
  phase: MatchPhase;
  minute: number | null;
  source: 'live' | 'replay';
  raw?: unknown;
}

export interface MatchCallbacks {
  onOdds(tick: OddsTick): void;
  onScore(ev: ScoreEvent): void;
  onStatus(ev: StatusEvent): void;
  /** transport health — the stage dims honestly instead of freezing on a dead feed */
  onFeedState?(state: 'connected' | 'reconnecting' | 'replay' | 'lost'): void;
}

export interface MatchDataSource {
  initialize(): Promise<void>;
  start(cb: MatchCallbacks): void;
  stop(): void;
  getFixture(): Fixture | null;
}
