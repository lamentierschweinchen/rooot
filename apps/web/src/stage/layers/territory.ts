/**
 * ROOOT stage — TERRITORIES + THE DRAW (the honest belief fill). Replaces market.ts.
 *
 * SYSTEM.md §3 / §6.1 / §6.4 — the single most important law made of dots:
 *  · Each team owns a HALFTONE DOT FIELD advancing from its goal-end. Solid core near
 *    the goal, FRAYING to scattered specks at its working edge. Extent = EXACTLY that
 *    team's win probability (computeFront gives the edge y, seam-clamped).
 *  · THE DRAW is the WIDTH where both fields' densities have collapsed to near-zero —
 *    a near-empty cream band. The thin Press-Black 50% seam rides inside it (never moves).
 *  · TEETH ARE DEAD. The frontier is a dot-fray ZONE, not a torn line: placement
 *    probability decays on an ease-out curve (FRAY.frayCurve), size lags coverage
 *    (dots THIN before they SHRINK), the two colours interleave as DISCRETE dots on a
 *    shared grid, and on collision the LEADING (higher-p) field's dot wins — never blended.
 *
 * PERF (the budget's real risk): the field only changes on odds ticks + slow fray drift,
 * so we PRE-BAKE each team's dot field into an offscreen buffer keyed by its edge-y
 * (quantised) and re-bake only when the edge moves a pixel or the pitch resizes. Per
 * frame we just composite the two baked buffers (cheap) + the idle breathe is a couple
 * of extra sparse dots drawn live (a handful, not the field). Target < a few ms/frame.
 */

import { HALFTONE, FRAY, GEOMETRY } from '../../lib/theme';
import { INK } from '../pop';
import type { PopTheme } from '../pop';
import type { PitchRect, MarketFront } from '../layout';
import { rgba, clamp01, hash21, hash11, mixRgb } from '../../lib/stage-math';
import type { RGBTuple } from '../../lib/stage-math';

export interface TerritoryArgs {
  pitch: PitchRect;
  front: MarketFront;
  home: PopTheme;
  away: PopTheme;
  /** ambient phase (s) — drives the idle breathe (dots blink, edge steady) */
  t: number;
  reducedMotion: boolean;
  /** paper ground rgb (the cream the dots print on / the draw shows through to) */
  paper: RGBTuple;
}

/** ease-out coverage curve across the fray zone (0 = solid-core side, 1 = edge/seam). */
function coverageAt(tt: number): number {
  const t = clamp01(tt);
  if (t <= FRAY.frayStart) return 1;
  const u = (t - FRAY.frayStart) / (1 - FRAY.frayStart); // 0..1 across the decay region
  // ease-out: hold dense then fall away fast near the edge (frayCurve > 1)
  const eased = 1 - Math.pow(u, FRAY.frayCurve);
  return FRAY.frayFloor + (1 - FRAY.frayFloor) * eased;
}

/** surviving dot radius fraction as coverage thins — size decay LAGS coverage by sizeLag. */
function sizeAt(tt: number): number {
  const t = clamp01(tt - FRAY.sizeLag); // lag: dots thin before they shrink
  if (t <= FRAY.frayStart) return HALFTONE.dotMax;
  const u = (t - FRAY.frayStart) / (1 - FRAY.frayStart);
  const eased = 1 - Math.pow(u, FRAY.frayCurve);
  return FRAY.strayDotMin + (HALFTONE.dotMax - FRAY.strayDotMin) * eased;
}

/**
 * The baked field for one side. Keyed by the geometry so we know when to re-bake.
 * We DON'T bake the interleave/collision here — the draw collapse where the two tails
 * meet is composited at draw time so the leading-field-wins rule is exact against the
 * live edges. Each buffer holds its own team's dots from goal-end to a hair past the seam.
 */
interface Baked {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  edgeY: number; // the working-edge y this buffer was baked for
  w: number;
  h: number;
  color: string; // team ink key
  dir: 1 | -1; // 1 = home (rises from bottom), -1 = away (descends from top)
}

export class Territories {
  private home: Baked | null = null;
  private away: Baked | null = null;

  /** bake one team's halftone field into its buffer. dir: 1 home(bottom), -1 away(top). */
  private bake(
    pitch: PitchRect,
    goalY: number,
    edgeY: number,
    color: RGBTuple,
    dir: 1 | -1,
    paper: RGBTuple,
  ): Baked {
    const w = Math.max(1, Math.round(pitch.w));
    const h = Math.max(1, Math.round(pitch.h));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);

    const cell = HALFTONE.cell;
    const cols = Math.ceil(w / cell) + 2;
    const rows = Math.ceil(h / cell) + 2;
    // Work in buffer-local coords (0..h, top=0).
    const goalLocal = goalY - pitch.y; // buffer y of this team's goal line
    const edgeLocal = edgeY - pitch.y; // buffer y of the working edge
    const fieldLen = Math.abs(edgeLocal - goalLocal); // px from goal to edge
    if (fieldLen < 1) return { canvas: c, ctx, edgeY, w, h, color: color.join(','), dir };

    // The field is dense at the goal-end and thins toward the seam as a GRADUAL printed
    // tide (like the canon), then fully frays into scattered specks over the last stretch.
    // `along` is 0 at the goal, 1 at the working edge. We split into two decays layered:
    //  · a gentle whole-field density ramp (dense core → a bit sparser) for the tide feel;
    //  · the fray-zone speck collapse near the edge (frayFrom..1) for the working frontier.
    const frayFrom = 0.42; // fray begins ~42% out (earlier than the raw token → gradual hem)
    const salt = dir === 1 ? 17.13 : 91.77; // decorrelate the two fields' grids
    const seed = dir === 1 ? 0 : 500;

    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        // dot grid with the classic screen tilt: offset alternate rows a touch
        const px = gx * cell + (gy % 2 ? cell * 0.5 : 0);
        const py = gy * cell;
        if (px < -cell || px > w + cell || py < -cell || py > h + cell) continue;
        const along = clamp01(Math.abs(py - goalLocal) / fieldLen);
        if (along > 1.04) continue; // past the edge → cream (draw / opponent)

        // whole-field tide: SOLID at the goal-end (coverage 1, dots touching → reads as a
        // near-solid ink field), easing only slightly by the fray start, THEN the speck
        // collapse. Keeping the core at full coverage is what makes it read as a field that
        // frays, not a scatter of dots everywhere (the canon's dense goal-end).
        const tide = 1 - 0.12 * clamp01(along / Math.max(0.001, frayFrom));
        // fray collapse near the edge
        let frayT = 0;
        if (along > frayFrom) frayT = (along - frayFrom) / (1 - frayFrom);
        const cover = along <= frayFrom ? tide : coverageAt(frayT);

        // WELL-MIXED 2D hash per cell (kills the vertical streaking of a 1D-correlated hash)
        const rnd = hash21(gx * 12.9898 + seed + gy * 4.1414, gy * 78.233 + salt + gx * 2.7182);
        if (rnd > cover) continue; // dropped dot = absent (never faded)

        const rFrac = sizeAt(frayT);
        // core dots are BIG (nearly fill the cell → solid field); strays shrink to specks
        const r = Math.max(0.5, rFrac * cell);
        // sub-cell jitter ONLY on the fraying strays — core dots stay on-grid (solid screen)
        const jAmt = frayT > 0.02 ? cell * frayT * 0.9 : 0;
        const jx = jAmt ? (hash21(gx * 3.1 + seed, gy * 5.7) - 0.5) * jAmt : 0;
        const jy = jAmt ? (hash21(gx * 7.7, gy * 9.3 + salt) - 0.5) * jAmt : 0;
        const jit = frayT > 0.02 ? 0.82 + hash21(gx * 1.7 + seed, gy * 2.3) * 0.36 : 1;
        ctx.fillStyle = rgba(color, 1);
        ctx.beginPath();
        ctx.arc(px + jx, py + jy, r * jit, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    void paper;
    void mixRgb;
    void GEOMETRY;
    return { canvas: c, ctx, edgeY, w, h, color: color.join(','), dir };
  }

  /**
   * Re-bake a side only if its edge moved by more than a re-bake threshold, the pitch
   * resized, or the color changed. The threshold (≈1/3 of a dot cell) keeps the field
   * buffer stable across sub-dot easing steps — halving re-bake frequency during an odds
   * ease with NO visible stepping (a dot cell is HALFTONE.cell px; a <2.4px shift can't
   * move a dot row) — which caps the per-frame cost in the ease window (perf budget).
   */
  private ensure(
    slot: Baked | null,
    pitch: PitchRect,
    goalY: number,
    edgeY: number,
    color: RGBTuple,
    dir: 1 | -1,
    paper: RGBTuple,
  ): Baked {
    const key = color.join(',');
    const w = Math.round(pitch.w);
    const h = Math.round(pitch.h);
    const threshold = Math.max(1, HALFTONE.cell / 3);
    if (
      slot &&
      slot.w === w &&
      slot.h === h &&
      slot.color === key &&
      Math.abs(slot.edgeY - edgeY) < threshold
    ) {
      return slot;
    }
    return this.bake(pitch, goalY, edgeY, color, dir, paper);
  }

  /**
   * Draw both fields + the draw collapse. The buffers carry each team's dots; we clip each
   * to its own side of the collapse so the DRAW (near-empty cream) opens exactly at pDraw,
   * and the leading field's tail is the one that survives closest to the seam.
   */
  draw(ctx: CanvasRenderingContext2D, a: TerritoryArgs): void {
    const { pitch, front, home, away, paper } = a;

    this.home = this.ensure(this.home, pitch, pitch.homeGoalY, front.homeEdgeY, home.primary, 1, paper);
    this.away = this.ensure(this.away, pitch, pitch.awayGoalY, front.awayEdgeY, away.primary, -1, paper);

    // composite the baked fields onto the pitch (buffers are pitch-sized, origin at pitch.x/y)
    ctx.save();
    ctx.beginPath();
    ctx.rect(pitch.x, pitch.y, pitch.w, pitch.h);
    ctx.clip();
    ctx.drawImage(this.home.canvas, pitch.x, pitch.y);
    ctx.drawImage(this.away.canvas, pitch.x, pitch.y);
    ctx.restore();

    // idle breathe: a few live sparse specks blink in/out AT each frontier — the field is
    // baked & steady; only these outriders animate (cheap, honest as texture not data).
    if (!a.reducedMotion) {
      this.breathe(ctx, pitch, pitch.homeGoalY, front.homeEdgeY, home.primary, 1, a.t);
      this.breathe(ctx, pitch, pitch.awayGoalY, front.awayEdgeY, away.primary, -1, a.t);
    }
  }

  /** a handful of blinking outrider dots right at the fray frontier (idle motion, §7). */
  private breathe(
    ctx: CanvasRenderingContext2D,
    pitch: PitchRect,
    goalY: number,
    edgeY: number,
    color: RGBTuple,
    dir: 1 | -1,
    t: number,
  ): void {
    const N = 26;
    const cell = HALFTONE.cell;
    const edgeLocalY = edgeY;
    ctx.save();
    ctx.beginPath();
    ctx.rect(pitch.x, pitch.y, pitch.w, pitch.h);
    ctx.clip();
    for (let i = 0; i < N; i++) {
      // blink cycle: each speck breathes at its own phase; only the "on" half draws
      const ph = hash11(i * 7.3 + (dir === 1 ? 0 : 99)) * Math.PI * 2;
      const on = Math.sin(t * (Math.PI * 2) / (HALFTONE ? 2.6 : 2.6) + ph);
      if (on < 0.35) continue; // mostly off — dots appear/disappear, never fade
      const fx = hash11(i * 3.7 + (dir === 1 ? 11 : 71));
      // sit just inside the frontier (toward the seam), where the last outriders live
      const spread = cell * 3.2;
      const px = pitch.x + fx * pitch.w;
      const py = edgeLocalY - dir * (hash11(i * 5.1) * spread);
      const r = Math.max(0.5, FRAY.strayDotMin * cell * (0.7 + hash11(i * 9.2) * 0.6));
      ctx.fillStyle = rgba(color, 1);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** force a re-bake next draw (call on resize). */
  invalidate(): void {
    this.home = null;
    this.away = null;
  }
}

/** the paper the draw shows through to — exported so the pitch layer stays the single source. */
export const DRAW_PAPER = INK.newsprint;
