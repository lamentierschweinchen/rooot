/**
 * ROOOT texture seam — the match's CONTINUOUS threads beyond belief+crowd.
 * FROZEN: only the coordinator changes this file.
 *
 * The design session's "Full Cloth" (design/experiments/throughlines-jul4.html)
 * proved the wire carries FIVE continuous threads, not two:
 *   BELIEF   — the 1X2 tide (contracts/match.ts OddsTick) — already wired
 *   CROWD    — rooted/roar (contracts/ledger.ts CrowdView) — already wired
 *   POSSESSION — who holds the ball (territory)      ┐ derived here from the
 *   PRESSURE   — threat (danger-grade possession)    │ possession-spell stream,
 *   TEMPO      — how frantic (event rate)            ┘ which the wire emits but
 *                                                      we dropped as chatter.
 *
 * These three are DERIVED, not read — so honesty demands the derivation be
 * exact and documented (verified against ARG–CPV: possession swung to CPV
 * 59% at 55' and their danger spiked at 58' when they scored — the cloth's
 * own claim, true in the tape). Nothing here is smoothed into fiction: a
 * sample reports the real seconds/counts the minute actually held.
 */

import type { Side } from './crowd';

/** One possession spell off the wire — the atom the texture is built from. */
export interface Spell {
  side: Side;
  /** the five grades, coarsest → most threatening (drives PRESSURE weight) */
  kind: 'safe' | 'possession' | 'attack' | 'danger' | 'high-danger';
  /** match clock seconds at the spell's start (the wire's Clock.Seconds) */
  clockSeconds: number | null;
  minute: number | null;
  tMs: number;
  source: 'live' | 'replay';
}

/**
 * One minute's woven row of the three derived threads. Emitted as each minute
 * completes (and a partial "live" sample for the minute in progress).
 * possession/pressure are 0..1 SHARES (home+away ≈ 1 when the minute had play;
 * both 0 for a dead minute — honest, not filled). tempo is a raw count.
 */
export interface TextureSample {
  minute: number;
  /** fraction of the minute's tracked spell-time each side held the ball */
  possession: { home: number; away: number };
  /** fraction of the minute's DANGER/high-danger spell-time each side held —
   * threat, not mere possession (0/0 when neither side threatened) */
  pressure: { home: number; away: number };
  /** real events this minute (shots/corners/frees/cards/etc — not spell chatter) */
  tempo: number;
  /** true once the minute is closed; false for the still-accumulating live minute */
  settled: boolean;
}

/** The whole cloth so far — history + the live edge. Published by the builder. */
export interface TextureSnapshot {
  rows: TextureSample[];
  /** monotic version so consumers can diff cheaply */
  version: number;
}

/** Grade → PRESSURE weight: only danger and high-danger are "threat". */
export const PRESSURE_WEIGHT: Record<Spell['kind'], number> = {
  safe: 0,
  possession: 0,
  attack: 0,
  danger: 1,
  'high-danger': 1.6,
};
