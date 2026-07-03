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

import { GRID, GEOMETRY } from '../../lib/theme';
import { INK } from '../pop';
import type { PitchRect, StageRect } from '../layout';
import { rgba } from '../../lib/stage-math';

const GOAL_W = 0.34; // goal-mouth width as a fraction of pitch width

/** the cream pitch bed + the chalk box outlines UNDER the dots (they show through). */
export function drawPitchPaper(
  ctx: CanvasRenderingContext2D,
  _stage: StageRect,
  pitch: PitchRect,
): void {
  // Newsprint paper bed
  ctx.fillStyle = rgba(INK.newsprint, 1);
  ctx.fillRect(pitch.x, pitch.y, pitch.w, pitch.h);

  // the box geometry UNDER the halftone (Press-Black chalk, full ink, thin)
  drawChalkGeometry(ctx, pitch, 1);
}

/** re-strike the seam + center circle + spots ON TOP of the dots so they read crisp. */
export function drawChalkOver(ctx: CanvasRenderingContext2D, pitch: PitchRect): void {
  const lw = Math.max(1, pitch.w * GRID.keylineInner * 1.4);

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

  // THE SEAM — the constant thin Press-Black 50% line. Weight per GEOMETRY.seamWeight of
  // pitch height. It rides inside the draw collapse and NEVER moves. Struck last so it is
  // always the crispest line on the pitch.
  const seamY = pitch.y + pitch.h * GEOMETRY.halfwaySeam;
  const seamW = Math.max(1.5, pitch.h * GEOMETRY.seamWeight);
  ctx.save();
  ctx.strokeStyle = rgba(INK.pressBlack, 1);
  ctx.lineWidth = seamW;
  ctx.beginPath();
  ctx.moveTo(pitch.x, seamY);
  ctx.lineTo(pitch.x + pitch.w, seamY);
  ctx.stroke();
  ctx.restore();
}

/** Press-Black chalk: touchlines, both penalty + six-yard boxes, penalty spots, corner arcs. */
function drawChalkGeometry(ctx: CanvasRenderingContext2D, pitch: PitchRect, alpha: number): void {
  const lw = Math.max(1, pitch.w * GRID.keylineInner * 1.4);
  ctx.save();
  ctx.strokeStyle = rgba(INK.pressBlack, 0.9 * alpha);
  ctx.lineWidth = lw;
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';

  // pitch rectangle (touchlines + goal lines)
  ctx.strokeRect(pitch.x, pitch.y, pitch.w, pitch.h);

  const gw = pitch.w * GOAL_W;
  const gx0 = pitch.cx - gw / 2;
  const gx1 = pitch.cx + gw / 2;
  const boxDepth = pitch.h * 0.13;
  const sixDepth = pitch.h * 0.06;
  const boxHalfExtra = gw * 0.42;

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
