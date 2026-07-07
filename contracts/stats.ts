/**
 * ROOOT stats seam — a live per-side MATCH STATS aggregate DERIVED from the wire
 * event stream (contracts/ledger.ts + texture.ts). FROZEN: coordinator only.
 * Design reads window.__stats against this shape (see design/BRIEF-STATS.md).
 *
 * Everything here is REAL, off the wire. The ScoreStatKey legend is fully resolved
 * (Jul 7): possession/shots/offsides/fouls are score EVENTS, not the numeric `Stats`
 * block. possession % is a COMPUTED time-share (gated — withheld until trustworthy,
 * never a false 100/0); territory is an honest attacking-pressure PROXY, not ball
 * possession. Counts are counts — every rate is derived from them client-side, never
 * served or faked. A family with no data yet shows null / empty, never a fake zero.
 */

import type { StartingXIPlayer } from './normalize';

/** outcome enums as the wire spells them (kept as strings — the source of truth). */
export type ShotOutcome = 'OnTarget' | 'OffTarget' | 'Woodwork' | 'Blocked';
export type InjuryOutcome = 'OnPitch' | 'NotReturning' | 'OffPitch';
export type PenaltyOutcome = 'Scored' | 'Missed' | 'Retake';
export type GoalType = 'Shot' | 'Head' | 'Own';
export type VarType = 'Goal' | 'Penalty' | 'RedCard' | 'SecondYellowCard' | 'CornerKick' | 'MistakenIdentity' | 'Other';
export type VarOutcome = 'Stands' | 'Overturned';

export interface ShotStats {
  total: number;
  onTarget: number;
  offTarget: number;
  blocked: number;
  woodwork: number;
}

export interface SubMove { inName: string | null; outName: string | null; minute: number | null; }
export interface InjuryEntry { player: string | null; outcome: InjuryOutcome | null; minute: number | null; }
export interface PenaltyEntry { taker: string | null; outcome: PenaltyOutcome; minute: number | null; }
export interface ScorerEntry { name: string | null; type: GoalType | null; minute: number | null; }
/** one booking — player names arrive on a late re-emit; null until then (or on a wire that omits it). */
export interface BookingEntry { player: string | null; type: 'Yellow' | 'Red'; minute: number | null; }
/** match-level (VAR carries no side on the wire) — lives on MatchStats, not per side. */
export interface VarEntry { type: VarType | null; outcome: VarOutcome | null; minute: number | null; }

export interface SideStats {
  shots: ShotStats;
  corners: number;
  freeKicks: number;
  /** throw-ins won by this side (SET PIECES row). Count of distinct throw_in ids. */
  throwIns: number;
  /** counts + who/when (list names via the roster, once the late re-emit carries PlayerId). */
  cards: { yellow: number; red: number; list: BookingEntry[] };
  goals: number; // authoritative (Score.Total) — correct on any join
  /** danger + high-danger spells — the pressure/momentum the wire gives. */
  attacks: { danger: number; highDanger: number };
  /** 0..1 — this side's share of attacking pressure. Honest TERRITORY proxy, NOT
   * ball possession. 0.5 when nothing's happened yet. */
  territory: number;
  /** computed time-share of the possession stream; null until trustworthy (gated). */
  possessionPct: number | null;
  /** non-offside free_kick / offside free_kick — resolved off the wire. */
  fouls: number | null;
  offsides: number | null;
  /** the "families" — counts + named lists (names via the lineups roster). */
  subs: { count: number; moves: SubMove[] };
  injuries: { count: number; list: InjuryEntry[] };
  penalties: { scored: number; missed: number; retake: number; list: PenaltyEntry[] };
  scorers: ScorerEntry[];
  /** DEPRECATED — VAR is match-level (see MatchStats.var). Kept for legacy pages:
   * home carries the total review count, away is 0, so (home+away) = the total. */
  varReviews: number;
}

export interface MatchStats {
  minute: number | null;
  home: SideStats;
  away: SideStats;
  /** MATCH-LEVEL — VAR reviews carry no side on the wire (type + outcome, paired). */
  var: VarEntry[];
  /** plain-language list of anything still not decodable — empty now (legend resolved). */
  pending: readonly string[];
  /** the announced starting elevens (from the `lineups` envelope) — WHO is playing, so a
   * card can fill before kickoff. null until the wire names them. */
  lineups: { home: StartingXIPlayer[]; away: StartingXIPlayer[] } | null;
}

/** A fresh, zeroed side. */
export function emptySideStats(): SideStats {
  return {
    shots: { total: 0, onTarget: 0, offTarget: 0, blocked: 0, woodwork: 0 },
    corners: 0,
    freeKicks: 0,
    throwIns: 0,
    cards: { yellow: 0, red: 0, list: [] },
    goals: 0,
    attacks: { danger: 0, highDanger: 0 },
    territory: 0.5,
    possessionPct: null,
    fouls: null,
    offsides: null,
    subs: { count: 0, moves: [] },
    injuries: { count: 0, list: [] },
    penalties: { scored: 0, missed: 0, retake: 0, list: [] },
    scorers: [],
    varReviews: 0,
  };
}

/** legend fully resolved — nothing pending. */
export const STATS_PENDING_LEGEND: readonly string[] = [];
