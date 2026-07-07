/**
 * ROOOT ledger seam — the match as a READABLE story (the watching experience).
 * FROZEN: only the coordinator changes this file.
 *
 * The live wire carries far more than goals: shots (with Woodwork outcomes),
 * corners, danger-possession spells, the `possible goal` held-breath moment.
 * Until tonight we parsed and DROPPED them. The ledger surfaces the whole
 * story as typed rows a fan can read: majors always visible, minors grouped
 * behind a disclosure, and — where the market moved — the odds swing pinned
 * to the moment that moved it.
 *
 * Honesty rules:
 *  · a LedgerEvent is only ever built from a received envelope — never
 *    synthesized, never re-ordered beyond tMs sort;
 *  · odds swings are OBSERVED pairs (last tick at-or-before the moment,
 *    first settled tick after) — never interpolated, and absent when the
 *    market didn't speak (swing stays undefined, the row renders without it);
 *  · devnet StablePrice runs ~60s behind the scores wire — the correlator
 *    accounts for the lag with a settle window; the pair it publishes is
 *    still two real ticks, the lag is documented, nothing is shifted.
 */

import type { Side } from './crowd';

/** Every kind is an OBSERVED wire action (fixtures/scores-night-20260703:
 * the AUS–EGY ET+pens epic exercised nearly the whole palette live). */
export type LedgerKind =
  | 'warmup' // players_warming_up / players_on_the_pitch / standby (tunnel beats)
  | 'kickoff' // status→playing phases (H1/H2/ET1/ET2)
  | 'goal'
  | 'possible' // the held breath — Data:{Goal|Corner|Penalty:true} pre-confirmation
  | 'shot' // Outcome arrives via action_amend (e.g. OffTarget → "Woodwork")
  | 'corner'
  | 'throw-in' // stats-only signal (SET PIECES throw count); re-emits empty→ThrowInType, dedup by id
  | 'free-kick'
  | 'yellow-card' // observed live (AUS–EGY ET)
  | 'red-card' // symmetric mapping; not yet observed
  | 'substitution'
  | 'injury'
  | 'additional-time' // announced stoppage
  | 'danger' // danger/high_danger possession spell START (spells, not every tick)
  | 'break' // HT / end-of-90 / ET break / awaiting pens (StatusIds 3/6/8/11)
  | 'penalties' // shootout under way (StatusId 12)
  | 'penalty-kick' // one shootout kick: penalty_outcome {Outcome:"Scored"|"Missed"|…}
  | 'var' // a VAR review — a SPAN (var → var_end); detail carries the outcome
  | 'full-time';

/** One observed market read (fractions 0..1, straight off an OddsTick). */
export interface OddsRead {
  pHome: number;
  pDraw: number;
  pAway: number;
  tMs: number;
}

/** The market's move around a moment — two REAL ticks, never interpolated. */
export interface OddsSwing {
  before: OddsRead;
  after: OddsRead;
}

export interface LedgerEvent {
  /** stable id: `${fixtureId}:${wireId}` for wire events (goals re-emit the
   * same wire Id as they upgrade — consumers REPLACE by id, newest wins). */
  id: string;
  kind: LedgerKind;
  /** true → always visible in the ledger; false → grouped behind disclosure */
  major: boolean;
  minute: number | null;
  tMs: number;
  /** acting side where the wire names one (null for neutral rows like breaks) */
  side: Side | null;
  /** plain-language row text, data-voice ("Shot — woodwork", "Corner") —
   * presentation may restyle, never re-fact */
  headline: string;
  /** score line as of this row, when the envelope carries one */
  score?: { home: number; away: number };
  /** filled by the correlator once the market's settled read exists */
  swing?: OddsSwing;
  /** upgrade flag: a goal row that is not yet Confirmed renders provisional */
  confirmed?: boolean;
  /** wire detail the headline compresses (shot Outcome, penalty Outcome, possible flags) */
  detail?: string;
  /** goal's GoalType (Shot|Head|Own) — the loom sews the matching patch */
  goalKind?: 'Shot' | 'Head' | 'Own';
  raw?: unknown;
}

/**
 * The wire can retro-edit the story — honestly mirrored, never hidden:
 *  · action_amend re-describes an earlier action (references it by
 *    Data.Action + the ORIGINAL Clock.Seconds + Participant — the wire has
 *    no id pointer, so the builder matches on that triple, newest wins);
 *  · action_discarded strikes one (the row renders struck-through or drops —
 *    presentation's call; the LEDGER never pretends it didn't happen).
 * Sources forward these as-is; the client-side builder owns the matching.
 */
export type LedgerMsg =
  | { type: 'event'; ev: LedgerEvent }
  | {
      type: 'amend';
      fixtureKey: string;
      targetKind: LedgerKind;
      targetClockSeconds: number | null;
      side: Side | null;
      /** e.g. "Woodwork" — the new Outcome/description */
      detail: string | null;
      tMs: number;
    }
  | {
      type: 'discard';
      fixtureKey: string;
      targetClockSeconds: number | null;
      side: Side | null;
      tMs: number;
    };

/** The client surface for the stands socket (implemented in apps/web data
 * lane over contracts/crowd.ts wire msgs; UI consumes only this shape). */
export interface CrowdClient {
  root(side: Side): void;
  cheer(): void;
  /** latest stands state push (4Hz server cadence, may coalesce) */
  onState(cb: (s: CrowdView) => void): void;
  close(): void;
}

/** What the social strip renders — counts and roar only, never percentages
 * of "sentiment", never blended with market numbers (honesty separation). */
export interface CrowdView {
  rooted: { home: number; away: number };
  /** decayed cheers/sec per end, server-computed */
  roar: { home: number; away: number };
  /** whose cheers count double right now (trailing side), if any */
  faithSide: Side | null;
  connected: boolean;
}
