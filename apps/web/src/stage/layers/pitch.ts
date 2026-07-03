/**
 * ROOOT stage — the pitch: grass falloff + chalk lines.
 *
 * References:
 *  · floodlight-and-fog.jpg — the ground catches only a whisper; mostly void.
 *  · halftime-show.jpg — turf reads GREEN only where the light hits; black otherwise.
 *  · the halfway line is the chalk 50/50 reference (brief).
 *
 * The grass here is the DARK base + static chalk. The green-in-the-light-pool is
 * painted by the market layer (it knows where the light is), so honesty holds:
 * grass only glows where a floodlight actually reaches.
 */

import { PALETTE, RGB } from '../theme';
import type { PitchRect, StageRect } from '../layout';
import { rgba } from '../../lib/stage-math';

export function drawPitchBase(ctx: CanvasRenderingContext2D, stage: StageRect, pitch: PitchRect): void {
  // 1) atmospheric void — charcoal vertical gradient, cold cast (never #000 paint)
  const bg = ctx.createLinearGradient(0, stage.y, 0, stage.y + stage.h);
  bg.addColorStop(0, PALETTE.voidTop);
  bg.addColorStop(0.5, PALETTE.voidBottom);
  bg.addColorStop(1, PALETTE.voidTop);
  ctx.fillStyle = bg;
  ctx.fillRect(stage.x, stage.y, stage.w, stage.h);

  // 2) the grass base — barely-there green-black, darkest at the ends, a touch warmer mid
  const grass = ctx.createLinearGradient(0, pitch.y, 0, pitch.y + pitch.h);
  grass.addColorStop(0, rgba(RGB.grassDark, 0.0));
  grass.addColorStop(0.16, rgba(RGB.grassDark, 0.85));
  grass.addColorStop(0.5, rgba(RGB.grassDark, 1));
  grass.addColorStop(0.84, rgba(RGB.grassDark, 0.85));
  grass.addColorStop(1, rgba(RGB.grassDark, 0.0));
  ctx.fillStyle = grass;
  ctx.fillRect(pitch.x, pitch.y, pitch.w, pitch.h);
  // (mow bands deliberately omitted — any cross-hatch reads as a decorative UI pattern;
  //  grass texture comes only from the light pool + the global film grain.)
}

/**
 * Chalk lines drawn faint — they're a REFERENCE grid, not UI. Touchlines, both goal
 * mouths, the center circle, and the halfway line (brightest: the 50/50 truth).
 * `chalkAlpha` lets us fade them in on entry.
 */
export function drawChalk(ctx: CanvasRenderingContext2D, pitch: PitchRect, goalWidthFrac: number, chalkAlpha = 1): void {
  const a = chalkAlpha;
  ctx.save();
  ctx.lineWidth = Math.max(1, pitch.w * 0.004);
  ctx.strokeStyle = rgba(RGB.chalk, 0.16 * a);
  ctx.lineCap = 'round';

  // touchlines + goal lines (the pitch rectangle)
  ctx.strokeRect(pitch.x, pitch.y, pitch.w, pitch.h);

  // halfway line — the 50/50 reference, a touch brighter
  ctx.strokeStyle = rgba(RGB.chalk, 0.28 * a);
  ctx.beginPath();
  ctx.moveTo(pitch.x, pitch.midY);
  ctx.lineTo(pitch.x + pitch.w, pitch.midY);
  ctx.stroke();

  // center circle + spot
  ctx.strokeStyle = rgba(RGB.chalk, 0.14 * a);
  const cr = pitch.w * 0.16;
  ctx.beginPath();
  ctx.arc(pitch.cx, pitch.midY, cr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = rgba(RGB.chalk, 0.22 * a);
  ctx.beginPath();
  ctx.arc(pitch.cx, pitch.midY, Math.max(1.5, pitch.w * 0.006), 0, Math.PI * 2);
  ctx.fill();

  // goal mouths + penalty arcs, top (away) and bottom (home)
  const gw = pitch.w * goalWidthFrac;
  const gx0 = pitch.cx - gw / 2;
  const gx1 = pitch.cx + gw / 2;
  const boxDepth = pitch.h * 0.12;
  const sixDepth = pitch.h * 0.055;
  ctx.strokeStyle = rgba(RGB.chalk, 0.16 * a);
  for (const dir of [1, -1] as const) {
    const gy = dir === 1 ? pitch.homeGoalY : pitch.awayGoalY;
    // penalty box
    ctx.beginPath();
    ctx.moveTo(gx0 - gw * 0.35, gy);
    ctx.lineTo(gx0 - gw * 0.35, gy - dir * boxDepth);
    ctx.lineTo(gx1 + gw * 0.35, gy - dir * boxDepth);
    ctx.lineTo(gx1 + gw * 0.35, gy);
    ctx.stroke();
    // six-yard box
    ctx.beginPath();
    ctx.moveTo(gx0, gy);
    ctx.lineTo(gx0, gy - dir * sixDepth);
    ctx.lineTo(gx1, gy - dir * sixDepth);
    ctx.lineTo(gx1, gy);
    ctx.stroke();
  }
  ctx.restore();
}
