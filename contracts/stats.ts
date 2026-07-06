/**
 * ROOOT stats seam — a live per-side MATCH STATS aggregate DERIVED from the wire
 * event stream (contracts/ledger.ts + texture.ts). FROZEN: coordinator only.
 *
 * Everything here is REAL, off the wire: shots (by outcome), corners, cards,
 * goals, VAR reviews, free-kicks, and danger/high-danger pressure. TERRITORY is
 * an honest PROXY — the share of attacking pressure per side — clearly NOT true
 * ball-possession. The pre-computed stats that need the TxODDS ScoreStatKey
 * legend (the opaque `Stats` block) — true possession %, fouls, offsides — are
 * `null` (pending), NEVER synthesized. When the legend lands they fill in;
 * until then the UI shows them as awaiting, honestly.
 */

export interface ShotStats {
  total: number;
  onTarget: number;
  offTarget: number;
  blocked: number;
  woodwork: number;
}

export interface SideStats {
  shots: ShotStats;
  corners: number;
  freeKicks: number;
  cards: { yellow: number; red: number };
  goals: number;
  varReviews: number;
  /** danger + high-danger spells — the pressure/momentum the wire DOES give. */
  attacks: { danger: number; highDanger: number };
  /** 0..1 — this side's share of attacking pressure. An honest TERRITORY proxy,
   * NOT ball possession. 0.5 when nothing's happened yet. */
  territory: number;
  /** pending the ScoreStatKey legend — null, never faked. */
  possessionPct: number | null;
  fouls: number | null;
  offsides: number | null;
}

export interface MatchStats {
  minute: number | null;
  home: SideStats;
  away: SideStats;
  /** plain-language list of what still needs the legend — the honesty surface
   * the stats panel renders as "awaiting TxODDS stat catalog". */
  pending: readonly string[];
}

/** A fresh, zeroed side. */
export function emptySideStats(): SideStats {
  return {
    shots: { total: 0, onTarget: 0, offTarget: 0, blocked: 0, woodwork: 0 },
    corners: 0,
    freeKicks: 0,
    cards: { yellow: 0, red: 0 },
    goals: 0,
    varReviews: 0,
    attacks: { danger: 0, highDanger: 0 },
    territory: 0.5,
    possessionPct: null,
    fouls: null,
    offsides: null,
  };
}

export const STATS_PENDING_LEGEND: readonly string[] = ['possession %', 'fouls', 'offsides'];
