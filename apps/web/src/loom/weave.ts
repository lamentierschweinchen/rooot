/**
 * ROOOT — THE LOOM · weave model (the honesty engine).
 *
 * This file owns the ONE hard problem the loom must get right: turning the raw
 * event bus (contracts/match.ts MatchCallbacks) into a CLOTH of real minute-rows
 * where every stitch traces to a datum. It renders nothing — it is the data truth
 * the painter (loom.ts) draws.
 *
 * ── The clock problem, and the honest solution ──
 * The odds stream carries NO match clock (normalize.ts: OddsTick.minute is always
 * null — "the odds stream carries no clock field"). But the loom's supreme law is
 * "rows = real minutes". So each arriving odds tick must be assigned to a real
 * match-minute, and the ONLY honest source of match time is the SCORES wire, which
 * stamps a running Clock.Seconds on nearly every envelope (kickoff/status/goal and,
 * in the full capture, ~1170 possession/shot/corner rows — median gap ~4s).
 *
 * So we latch a MATCH CLOCK from the wire: every ledger/score/status row that
 * carries a minute updates (wallMs → matchMinute) with the wall-time it arrived.
 * An odds tick's minute is then interpolated between the two bracketing clock
 * readings — real wire time, never invented. Kickoff envelopes anchor the phase
 * (H1 clock 0, H2 2700s, ET1 5400s, ET2 6300s — verified in the ARG–CPV bundle),
 * so the row index is honest across the half-time / ET seams (a break does not
 * advance the cloth; only running-clock rows do).
 *
 * ── The row ──
 * One row per match minute. A row holds every FULL-market tick assigned to that
 * minute; the row's settled split (home | draw | away) is the LAST tick of the
 * minute (per the brief: "last tick of the minute rules the settled row"). The
 * LIVE row (the highest minute seen so far, still open) knits stitch-by-stitch as
 * ticks arrive — each tick shuttles in the stitches its arrival earned.
 *
 * ── ET ──
 * After the 90' death (full market settles → dies), the wire keeps an ET-scoped
 * 1X2 alive (period 'et'). ReplaySource flips OddsTick.period to 'et' when the
 * phase enters EXTRA_TIME. We keep ET rows in a SEPARATE band, honestly labeled,
 * so the ET market is never blended with the full-match market (contracts law).
 *
 * Pure-ish: holds state (the growing cloth) but no DOM, no canvas, no timers.
 */

import type { OddsTick, ScoreEvent, StatusEvent, MatchPhase } from '@contracts/match';
import type { LedgerMsg } from '@contracts/ledger';

/** One FULL-market probability read assigned to a minute (fractions 0..1). */
export interface Stitch {
  /** wall-ms the tick was received (replay: original receivedAt) — ordering only */
  tMs: number;
  /** interpolated match-minute (float) this tick was assigned to */
  minute: number;
  pHome: number;
  pDraw: number;
  pAway: number;
  /** which market this stitch reads — 'full' or 'et' (honesty label) */
  period: 'full' | 'et';
}

/** A woven patch sewn into a row: a real goal. */
export interface Patch {
  minute: number;
  /** which end scored */
  side: 'home' | 'away';
  /** scorer name from the wire's roster, or null if the wire never named one */
  scorer: string | null;
  /** score line as of this goal, e.g. { home: 1, away: 1 } */
  score: { home: number; away: number } | null;
  /** true once the goal upgraded to Confirmed on the wire */
  confirmed: boolean;
  /** true if this goal landed in extra time (its row lives in the ET band) */
  et: boolean;
  /** own-goal flag (wire GoalType 'Own') for honest labelling */
  own: boolean;
}

/** A settled or live row of cloth = one match minute. */
export interface Row {
  minute: number;
  /** every FULL-market stitch assigned to this minute, in arrival order */
  stitches: Stitch[];
  /** the settled split = LAST stitch of the minute (brief: "last tick rules") */
  settled: { pHome: number; pDraw: number; pAway: number } | null;
  /** true once a later minute has opened (this row can no longer take stitches) */
  complete: boolean;
  /** true if this row is in the ET band (after the 90' death) */
  et: boolean;
}

/** The whole living cloth. */
export interface Cloth {
  /** FULL-match rows, index 0 = minute 0 (kickoff), growing downward */
  rows: Row[];
  /** ET rows (the resumed market), separate band, honestly labelled */
  etRows: Row[];
  /** goals sewn as patches (both full + ET) */
  patches: Patch[];
  /** the current match phase from the wire */
  phase: MatchPhase;
  /** the current score line */
  score: { home: number; away: number };
  /** the highest match-minute the clock has reached (float) */
  clockMinute: number;
  /** whether the full market has died (settled on the 90' result) */
  fullMarketDead: boolean;
  /** whether ET ticks have started arriving (the weave resumed) */
  etResumed: boolean;
  /** most recent tick received, for the live-edge shuttle mark */
  lastTick: Stitch | null;
}

/** an event the painter can react to (a register jolt, a snap) */
export type WeaveEvent =
  | { type: 'row-complete'; minute: number; et: boolean }
  | { type: 'goal'; patch: Patch }
  | { type: 'death' } // the 90' full-market settlement
  | { type: 'et-resume' } // first ET tick after the death
  | { type: 'phase'; phase: MatchPhase };

interface ClockAnchor {
  wallMs: number;
  minute: number; // match-minute (float), from Clock.Seconds/60
}

/**
 * The weave: accepts the raw bus, maintains the cloth, emits WeaveEvents the
 * painter animates. Deterministic — replay it twice, get the same cloth.
 */
export class Weave {
  readonly cloth: Cloth = {
    rows: [],
    etRows: [],
    patches: [],
    phase: 'PRE',
    score: { home: 0, away: 0 },
    clockMinute: 0,
    fullMarketDead: false,
    etResumed: false,
    lastTick: null,
  };

  private listeners: ((e: WeaveEvent) => void)[] = [];
  /** the last two clock readings that bracket incoming odds ticks */
  private clockPrev: ClockAnchor | null = null;
  private clockCur: ClockAnchor | null = null;
  /** the highest FULL minute a row has opened at (the live full row) */
  private liveFullMinute = -1;
  /** the highest ET minute a row has opened at (the live ET row) */
  private liveEtMinute = -1;
  /** goals keyed by wire minute+side so upgrades (confirm/scorer) replace, newest wins */
  private patchByKey = new Map<string, Patch>();

  on(fn: (e: WeaveEvent) => void): void {
    this.listeners.push(fn);
  }
  private emit(e: WeaveEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  /* ── the match clock latch ──────────────────────────────────────────── */
  /**
   * Feed a wire minute reading. Called from onStatus/onScore/onLedger whenever
   * the envelope carries a real match minute. Advances the clock monotonically
   * within a phase; a break (no running clock) does not regress it.
   */
  private latchClock(wallMs: number, minute: number | null): void {
    if (minute === null || !Number.isFinite(minute)) return;
    // never let the clock go backwards (dedupe re-emitted rows at the same second)
    if (this.clockCur && minute < this.clockCur.minute - 0.001) {
      // a lower reading after a higher one = a stale/re-emitted row; ignore for
      // clock advance (keeps the live edge honest — we never un-weave).
      return;
    }
    this.clockPrev = this.clockCur;
    this.clockCur = { wallMs, minute };
    if (minute > this.cloth.clockMinute) this.cloth.clockMinute = minute;
  }

  /** interpolate the match-minute for a tick received at wallMs. */
  private minuteAt(wallMs: number): number | null {
    if (!this.clockCur) return null;
    if (!this.clockPrev) return this.clockCur.minute;
    const a = this.clockPrev;
    const b = this.clockCur;
    const dw = b.wallMs - a.wallMs;
    // guard: a huge wall gap (idle capture) or non-monotonic pair → snap to the
    // latest known minute rather than interpolate a fiction.
    if (dw <= 0 || dw > 120000 || b.minute < a.minute) return b.minute;
    if (wallMs <= a.wallMs) return a.minute;
    if (wallMs >= b.wallMs) return b.minute;
    const t = (wallMs - a.wallMs) / dw;
    return a.minute + (b.minute - a.minute) * t;
  }

  /* ── the bus ────────────────────────────────────────────────────────── */

  onStatus(ev: StatusEvent): void {
    this.latchClock(ev.tMs, ev.minute);
    if (ev.phase !== this.cloth.phase) {
      this.cloth.phase = ev.phase;
      this.emit({ type: 'phase', phase: ev.phase });
    }
    // the 90' death: full market settles when we leave normal time. The wire
    // marks it by entering the end-of-90 break then EXTRA_TIME; either way, once
    // the phase is past SECOND_HALF the full-match 1X2 has settled and dies.
    if (
      !this.cloth.fullMarketDead &&
      (ev.phase === 'EXTRA_TIME' || ev.phase === 'PENALTIES' || ev.phase === 'FULL_TIME')
    ) {
      // FULL_TIME straight after 90' is also a death; ET is the resume case.
      this.cloth.fullMarketDead = true;
      // close the live full row
      const last = this.cloth.rows[this.cloth.rows.length - 1];
      if (last && !last.complete) {
        last.complete = true;
        this.emit({ type: 'row-complete', minute: last.minute, et: false });
      }
      this.emit({ type: 'death' });
    }
  }

  onScore(ev: ScoreEvent): void {
    this.latchClock(ev.tMs, ev.minute);
    this.cloth.score = {
      home: Math.max(0, Math.floor(ev.home)),
      away: Math.max(0, Math.floor(ev.away)),
    };
    // a ScoreEvent fires only on a real goal (normalize.ts: Action==='goal').
    // Sew/upgrade the patch. The ledger path (onLedger) is the richer source
    // (scorer + confirmed + own-goal), so we prefer it; but ScoreEvent guarantees
    // we never miss a goal even if the ledger row is filtered.
    if (ev.side && ev.minute !== null) {
      this.sewPatch({
        minute: ev.minute,
        side: ev.side,
        scorer: ev.scorer ?? null,
        score: this.cloth.score,
        confirmed: false,
        own: false,
      });
    }
  }

  onLedger(msg: LedgerMsg): void {
    if (msg.type !== 'event') return; // amends/discards: not clock/patch sources here
    const ev = msg.ev;
    // EVERY ledger row carries a minute from Clock.Seconds — this is the dense
    // feed that keeps the match clock alive between odds ticks.
    this.latchClock(ev.tMs, ev.minute);

    if (ev.kind === 'goal' && ev.minute !== null && ev.side) {
      // detail may be "Name" or "Name (OG)" (builder) — split honestly.
      let scorer: string | null = null;
      let own = false;
      if (ev.detail) {
        own = /\(OG\)\s*$/.test(ev.detail);
        scorer = ev.detail.replace(/\s*\(OG\)\s*$/, '').trim() || null;
      }
      this.sewPatch({
        minute: ev.minute,
        side: ev.side,
        scorer,
        score: ev.score ? { home: ev.score.home, away: ev.score.away } : this.cloth.score,
        confirmed: ev.confirmed === true,
        own,
      });
    }
  }

  onOdds(tick: OddsTick): void {
    const minute = this.minuteAt(tick.tMs);
    if (minute === null) return; // no clock yet (pure pre-match) — nothing to weave onto
    const period: 'full' | 'et' = tick.period === 'et' ? 'et' : 'full';

    if (period === 'et' && !this.cloth.etResumed) {
      this.cloth.etResumed = true;
      this.emit({ type: 'et-resume' });
    }

    const stitch: Stitch = {
      tMs: tick.tMs,
      minute,
      pHome: tick.pHome,
      pDraw: tick.pDraw,
      pAway: tick.pAway,
      period,
    };
    this.cloth.lastTick = stitch;

    if (period === 'full') {
      this.addFullStitch(stitch);
    } else {
      this.addEtStitch(stitch);
    }
  }

  /* ── row assembly ───────────────────────────────────────────────────── */

  private addFullStitch(stitch: Stitch): void {
    const m = Math.floor(stitch.minute);
    // opening a new minute completes the prior live row (register snap)
    if (m > this.liveFullMinute) {
      // fill any skipped minutes with empty (data-true: a silent minute has no
      // ticks; its row inherits the last settled split so the cloth stays whole,
      // and is marked as carrying no new stitch — the painter draws it calm).
      const startFrom = this.liveFullMinute < 0 ? m : this.liveFullMinute + 1;
      for (let mm = startFrom; mm <= m; mm++) {
        const prior = this.cloth.rows[this.cloth.rows.length - 1];
        if (prior && !prior.complete) {
          prior.complete = true;
          this.emit({ type: 'row-complete', minute: prior.minute, et: false });
        }
        this.cloth.rows.push({
          minute: mm,
          stitches: [],
          settled: prior?.settled ? { ...prior.settled } : null,
          complete: false,
          et: false,
        });
      }
      this.liveFullMinute = m;
    }
    const row = this.cloth.rows[this.cloth.rows.length - 1];
    if (!row) return;
    // if the tick's minute is below the live row (late/out-of-order within the
    // settle window), attribute it to its true minute row instead of the edge.
    const target =
      m === row.minute ? row : this.cloth.rows.find((r) => r.minute === m) ?? row;
    target.stitches.push(stitch);
    // last tick of the minute rules the settled split
    target.settled = { pHome: stitch.pHome, pDraw: stitch.pDraw, pAway: stitch.pAway };
  }

  private addEtStitch(stitch: Stitch): void {
    const m = Math.floor(stitch.minute);
    if (m > this.liveEtMinute) {
      const startFrom = this.liveEtMinute < 0 ? m : this.liveEtMinute + 1;
      for (let mm = startFrom; mm <= m; mm++) {
        const prior = this.cloth.etRows[this.cloth.etRows.length - 1];
        if (prior && !prior.complete) {
          prior.complete = true;
          this.emit({ type: 'row-complete', minute: prior.minute, et: true });
        }
        this.cloth.etRows.push({
          minute: mm,
          stitches: [],
          settled: prior?.settled ? { ...prior.settled } : null,
          complete: false,
          et: true,
        });
      }
      this.liveEtMinute = m;
    }
    const row = this.cloth.etRows[this.cloth.etRows.length - 1];
    if (!row) return;
    const target =
      m === row.minute ? row : this.cloth.etRows.find((r) => r.minute === m) ?? row;
    target.stitches.push(stitch);
    target.settled = { pHome: stitch.pHome, pDraw: stitch.pDraw, pAway: stitch.pAway };
  }

  private sewPatch(p: {
    minute: number;
    side: 'home' | 'away';
    scorer: string | null;
    score: { home: number; away: number } | null;
    confirmed: boolean;
    own: boolean;
  }): void {
    const key = `${p.minute}:${p.side}`;
    const et = this.cloth.fullMarketDead; // a goal after the death is an ET goal
    const existing = this.patchByKey.get(key);
    const patch: Patch = {
      minute: p.minute,
      side: p.side,
      // never downgrade a known scorer/confirmed back to null/false on a re-emit
      scorer: p.scorer ?? existing?.scorer ?? null,
      score: p.score ?? existing?.score ?? null,
      confirmed: p.confirmed || existing?.confirmed === true,
      et: existing?.et ?? et,
      own: p.own || existing?.own === true,
    };
    this.patchByKey.set(key, patch);
    if (existing) {
      // upgrade in place (replace-by-key, newest wins) — no second jolt
      const idx = this.cloth.patches.indexOf(existing);
      if (idx >= 0) this.cloth.patches[idx] = patch;
    } else {
      this.cloth.patches.push(patch);
      this.emit({ type: 'goal', patch }); // the register jolt fires once, on first sight
    }
  }

  /** patches that belong to a given minute-row (for the painter). */
  patchesForRow(minute: number, et: boolean): Patch[] {
    return this.cloth.patches.filter((p) => p.minute === minute && p.et === et);
  }
}
