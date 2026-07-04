/**
 * ROOOT stage — THE PITCH: Newsprint paper + Press-Black chalk geometry + the 50% seam.
 *
 * SYSTEM.md §2/§3: the pitch is a printed object. Paper is Newsprint cream; every pitch
 * marking (boxes, center circle, corner arcs, spots) is a Press-Black CHALK LINE at the
 * system keyline weight — flat ink, no glow. The one constant is the thin Press-Black
 * seam at EXACTLY 50% (GEOMETRY.halfwaySeam) — it never moves, it survives everything,
 * it is the honest midline the whole app is built on. It rides INSIDE the draw collapse.
 *
 * Chalk is drawn in TWO passes by the stage: `drawPitchPaper` lays the cream ground +
 * a faint under-grid of the box outlines (so the territory dots print over chalk, as in
 * the canon where the penalty box shows through the halftone); `drawChalkOver` re-strikes
 * the seam + center circle ON TOP so they stay crisp above the dots.
 */

import { GEOMETRY } from '../../lib/theme';
import { INK } from '../pop';
import type { PitchRect, StageRect } from '../layout';
import { rgba } from '../../lib/stage-math';
import { paperField, inkLine, tierPx } from '../../lib/ink';

const GOAL_W = 0.34; // goal-mouth width as a fraction of pitch width

/** the cream pitch bed + the chalk box outlines UNDER the dots (they show through). */
export function drawPitchPaper(
  ctx: CanvasRenderingContext2D,
  _stage: StageRect,
  pitch: PitchRect,
): void {
  // PAPER, NOT HEX (PRINT-SOUL item 3): the pitch bed is the WARM LIVING SHEET — corner
  // vignette + real tooth + a ±2 RGB warm↔cool drift, baked once per size — not one flat
  // Newsprint hex. Same paper family as the page (app/paper-field.ts) so the whole surface
  // reads as ONE sheet. seed 11 = the pitch's own bake (distinct from posed ground seed 7).
  paperField(ctx, { x: pitch.x, y: pitch.y, w: pitch.w, h: pitch.h }, INK.newsprint, 11);

  // the box geometry UNDER the halftone (Press-Black chalk, full ink, DETAIL weight)
  drawChalkGeometry(ctx, pitch, 1);
}

/** re-strike the seam + center circle + spots ON TOP of the dots so they read crisp. */
export function drawChalkOver(ctx: CanvasRenderingContext2D, pitch: PitchRect): void {
  // chalk = DETAIL weight (PRINT-SOUL item 4): the fine tier, sitting below panel/frame.
  const lw = tierPx(pitch.w, 'detail');

  // PRINT-SOUL: with the benday fattened + densified, the penalty/six-yard boxes laid UNDER
  // the field get buried at the goal-core. Re-strike them OVER the dots at a slightly reduced
  // alpha so the box reads clearly (as in stage-prematch-canonical, where the box shows
  // through the halftone) while still feeling embedded in the print. HONESTY: geometry only.
  drawBoxesAndArcs(ctx, pitch, 0.82, lw);

  // center circle + spot (over the dots)
  ctx.save();
  ctx.strokeStyle = rgba(INK.pressBlack, 0.92);
  ctx.lineWidth = lw;
  const cr = pitch.w * 0.16;
  ctx.beginPath();
  ctx.arc(pitch.cx, pitch.midY, cr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = rgba(INK.pressBlack, 1);
  ctx.beginPath();
  ctx.arc(pitch.cx, pitch.midY, Math.max(2, pitch.w * 0.008), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // THE SEAM — THE unique thin line (PRINT-SOUL item 4): the constant Press-Black 50% rule,
  // weight per GEOMETRY.seamWeight of pitch HEIGHT — deliberately THINNER than even `detail`,
  // which is what gives its thinness meaning now that a real weight hierarchy surrounds it.
  // It rides inside the draw collapse and NEVER moves; drawn as a breathing pressed rule but
  // its centerline is exactly at 50% (honesty). Struck last so it is always the crispest line.
  const seamY = pitch.y + pitch.h * GEOMETRY.halfwaySeam;
  const seamW = Math.max(1.5, pitch.h * GEOMETRY.seamWeight);
  inkLine(ctx, pitch.x, seamY, pitch.x + pitch.w, seamY, seamW, INK.pressBlack, 42);
}

/** Press-Black chalk: touchlines, both penalty + six-yard boxes, penalty spots, corner arcs. */
function drawChalkGeometry(ctx: CanvasRenderingContext2D, pitch: PitchRect, alpha: number): void {
  // chalk = DETAIL weight (PRINT-SOUL item 4)
  const lw = tierPx(pitch.w, 'detail');
  ctx.save();
  ctx.strokeStyle = rgba(INK.pressBlack, 0.9 * alpha);
  ctx.lineWidth = lw;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  // pitch rectangle (touchlines + goal lines) — DETAIL weight breathing keyline
  ctx.strokeRect(pitch.x, pitch.y, pitch.w, pitch.h);

  drawBoxesAndArcs(ctx, pitch, alpha, lw);

  ctx.restore();
}

/** the penalty + six-yard boxes, penalty spots, D-arcs, corner arcs. Shared so they can be
 *  laid UNDER the dots (the printed-over texture) AND re-struck OVER them for legibility. */
function drawBoxesAndArcs(ctx: CanvasRenderingContext2D, pitch: PitchRect, alpha: number, lw: number): void {
  const gw = pitch.w * GOAL_W;
  const gx0 = pitch.cx - gw / 2;
  const gx1 = pitch.cx + gw / 2;
  const boxDepth = pitch.h * 0.13;
  const sixDepth = pitch.h * 0.06;
  const boxHalfExtra = gw * 0.42;
  ctx.save();
  ctx.strokeStyle = rgba(INK.pressBlack, 0.9 * alpha);
  ctx.lineWidth = lw;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  for (const dir of [1, -1] as const) {
    const gy = dir === 1 ? pitch.homeGoalY : pitch.awayGoalY;
    // penalty box
    ctx.beginPath();
    ctx.moveTo(gx0 - boxHalfExtra, gy);
    ctx.lineTo(gx0 - boxHalfExtra, gy - dir * boxDepth);
    ctx.lineTo(gx1 + boxHalfExtra, gy - dir * boxDepth);
    ctx.lineTo(gx1 + boxHalfExtra, gy);
    ctx.stroke();
    // six-yard box
    ctx.beginPath();
    ctx.moveTo(gx0, gy);
    ctx.lineTo(gx0, gy - dir * sixDepth);
    ctx.lineTo(gx1, gy - dir * sixDepth);
    ctx.lineTo(gx1, gy);
    ctx.stroke();
    // penalty spot
    ctx.fillStyle = rgba(INK.pressBlack, 0.9 * alpha);
    ctx.beginPath();
    ctx.arc(pitch.cx, gy - dir * boxDepth * 0.62, Math.max(1.5, pitch.w * 0.006), 0, Math.PI * 2);
    ctx.fill();
    // penalty arc (the D on top of the box)
    ctx.beginPath();
    const arcY = gy - dir * boxDepth;
    const arcR = gw * 0.5;
    // arc bulges away from the goal line
    if (dir === 1) ctx.arc(pitch.cx, arcY, arcR, Math.PI * 1.15, Math.PI * 1.85);
    else ctx.arc(pitch.cx, arcY, arcR, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    // corner arcs
    const cr = pitch.w * 0.03;
    for (const sx of [pitch.x, pitch.x + pitch.w] as const) {
      ctx.beginPath();
      const start = sx === pitch.x ? (dir === 1 ? Math.PI * 1.5 : 0) : dir === 1 ? Math.PI : Math.PI * 0.5;
      ctx.arc(sx, gy, cr, start, start + Math.PI * 0.5);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** the goal-net block at each mouth — a small dot-matrix rectangle (drawn Press-Black). */
export function drawGoalNets(ctx: CanvasRenderingContext2D, pitch: PitchRect): void {
  const gw = pitch.w * GOAL_W * 0.62;
  const gh = pitch.h * 0.026;
  for (const dir of [1, -1] as const) {
    const gy = dir === 1 ? pitch.homeGoalY : pitch.awayGoalY;
    const y = dir === 1 ? gy - gh * 0.1 : gy - gh * 0.9;
    const x = pitch.cx - gw / 2;
    ctx.save();
    ctx.fillStyle = rgba(INK.pressBlack, 1);
    ctx.fillRect(x, y, gw, gh);
    // net mesh: knock out a fine dot grid (cream) so it reads as netting
    ctx.fillStyle = rgba(INK.newsprint, 0.9);
    const step = Math.max(2, gh * 0.34);
    for (let ny = y + step * 0.5; ny < y + gh; ny += step) {
      for (let nx = x + step * 0.5; nx < x + gw; nx += step) {
        ctx.beginPath();
        ctx.arc(nx, ny, Math.max(0.5, step * 0.16), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

export const PITCH_GOAL_W = GOAL_W;
