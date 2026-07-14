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
  /**
   * WHICH market this tick reads (honesty label — a surface showing 'et'
   * ticks must say so). 'full' = the match-result 1X2 (settles on the
   * 90-minute score and DIES after a level 90'); 'et' = the extra-time-
   * scoped 1X2 the wire keeps alive through ET (observed live: 464 ticks,
   * ARG–CPV). Sources hand off by phase; absent = 'full' (legacy ticks).
   */
  period?: 'full' | 'et';
  raw?: unknown;
}

export interface ScoreEvent {
  tMs: number;
  minute: number | null;
  home: number;
  away: number;
  side?: 'home' | 'away';
  scorer?: string;
  /**
   * CHANGELOG (coordinator, Jul 14 — FRA–ESP disallowed-goal incident): is this
   * an AUTHORITATIVE SETTLED scoreline, one the displayed score may advance or
   * revert to? A PROVISIONAL goal (the wire's Action:'goal' with Confirmed:false
   * and PossibleEvent.Goal set — the "held breath") is `false`: the moment /
   * ledger 'possible' path carries that suspense, but the big scoreline must NOT
   * flip to a goal that hasn't been given (honesty law #1 — never render a goal
   * that didn't stand). A confirmed goal, a confirmed penalty outcome, a feed
   * correction (action_discarded carrying the corrected Total.Goals), and a
   * plain goal the wire does NOT explicitly mark Confirmed:false (older
   * captures / hand-built replays omit the field for a goal that simply counts)
   * are all `true`. SettledScore (services/stands/src/match-state.ts) holds
   * the scoreline back ONLY on an explicit `false`; an absent value
   * (legacy/snapshot events that predate this field) is treated as SETTLED, so
   * nothing prior changes behaviour.
   */
  confirmed?: boolean;
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
  /** the readable story (contracts/ledger.ts): sources forward EVERY typed
   * ledger msg here — events, amends, discards; the client builder owns
   * matching/replacement (goals re-emit with the same id — replace, newest
   * wins). Optional so the bare stage keeps working; the watching shell wires it. */
  onLedger?(msg: import('./ledger').LedgerMsg): void;
  /** the derived threads' atom (contracts/texture.ts): every possession spell,
   * for the TextureBuilder to weave into POSSESSION/PRESSURE/TEMPO. The wire's
   * biggest stream (~5k/match) — optional, only the loom wires it. */
  onSpell?(spell: import('./texture').Spell): void;
}

export interface MatchDataSource {
  initialize(): Promise<void>;
  start(cb: MatchCallbacks): void;
  stop(): void;
  getFixture(): Fixture | null;
}
