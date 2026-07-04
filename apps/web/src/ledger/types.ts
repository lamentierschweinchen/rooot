/**
 * ROOOT ledger — the DISPLAY shapes (builder output → list UI input).
 *
 * The wire gives us `LedgerEvent`s (contracts/ledger.ts). The builder folds them
 * into an ORDERED list of DISPLAY rows a fan can read: majors always visible,
 * minors collapsed into fold-groups per stretch, danger spells collapsed to one
 * row, swings correlated in. This file is the seam between the pure builder and
 * the DOM list — no DOM here, no imports beyond the frozen contract types.
 *
 * Honesty carries through unchanged: a swing is two REAL ticks or it's absent; a
 * discard strikes the row, never deletes it; a `possible` renders as held breath
 * until the same wire id upgrades to a confirmed goal (or is struck).
 */

import type { LedgerEvent, OddsSwing } from '@contracts/ledger';
import type { Side } from '@contracts/crowd';

/** A single readable event row (major, or an expanded minor inside a fold). */
export interface EventRow {
  kind: 'event';
  /** stable identity — the wire id for wire events (goals re-emit the same id) */
  id: string;
  ev: LedgerEvent;
  /** true → the row prints at full weight and is always visible */
  major: boolean;
  /** the correlated market move, when the market spoke (else undefined) */
  swing?: OddsSwing;
  /** a goal/possible/etc. that the wire later struck — renders struck-through, never dropped */
  discarded: boolean;
  /** a `possible` still waiting for confirmation → renders as a pulsing held-breath row */
  pending: boolean;
  /** minute-span label for a collapsed danger spell, e.g. "38'–40'" (danger rows only) */
  spanLabel?: string;
  /** a lone minor between two majors, inlined (no fold) but printed lighter than a major */
  inlineMinor?: boolean;
  /** the tMs the row sorts by (newest first) */
  tMs: number;
  minute: number | null;
}

/** A fold row standing in for a stretch of minors between two majors. */
export interface FoldRow {
  kind: 'fold';
  /** stable id derived from the bracketing majors' tMs so it survives re-renders */
  id: string;
  /** the minor rows this fold hides, newest-first (rendered when expanded) */
  items: EventRow[];
  /** the summary counts, pre-computed for the "▸ 7 MOMENTS · 3 SHOTS · 2 CORNERS" line */
  summary: FoldSummary;
  /** newest tMs in the stretch (the fold sorts at the top of its stretch) */
  tMs: number;
}

/** Pre-counted summary for a fold row's disclosure line. */
export interface FoldSummary {
  total: number;
  shots: number;
  corners: number;
  freeKicks: number;
  /** total danger-spell minutes across the stretch (Doto "DANGER 4'") */
  dangerMinutes: number;
  other: number;
}

export type LedgerRow = EventRow | FoldRow;

/** What the list UI subscribes to: the ordered rows + a small cursor of change. */
export interface LedgerSnapshot {
  /** reverse-chronological (newest first) display rows */
  rows: LedgerRow[];
  /** the newest row's id — lets the UI detect "a new row printed" for the unread chip */
  headId: string | null;
  /** monotonic — bumps whenever the published list changes */
  version: number;
}

export type Unsubscribe = () => void;

export interface LedgerBuilder {
  /** feed one typed wire msg (event / amend / discard) — same shape onLedger delivers */
  push(msg: import('@contracts/ledger').LedgerMsg): void;
  /** feed one odds tick — the swing correlator keeps a small ring of these */
  pushOdds(tick: import('@contracts/match').OddsTick): void;
  /** current published snapshot */
  snapshot(): LedgerSnapshot;
  /** subscribe to snapshot changes; returns an unsubscribe. Fires once immediately. */
  subscribe(cb: (s: LedgerSnapshot) => void): Unsubscribe;
  /** drop everything (a fixture reset) */
  clear(): void;
}

export type { Side };
