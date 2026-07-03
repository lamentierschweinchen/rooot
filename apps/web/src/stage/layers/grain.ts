/**
 * ROOOT stage — film grain + vignette (the rain/sweat register over everything).
 *
 * References: rain-&-floodlights.jpg (grain as ambient texture), droplets-and-ball.jpg
 * (monochrome material intimacy). Grain sits over the WHOLE stage, subtly. The vignette
 * pulls the corners into the void so the composed portrait reads as a lit place in dark,
 * not a rectangle of UI.
 *
 * Cheap: one small grain tile stamped at a jittered offset each frame with 'overlay'
 * (mid-grey neutral, so it adds sparkle without lifting black). Reduced-motion holds a
 * static offset (no crawling grain).
 */

import { PALETTE } from '../theme';
import type { StageRect } from '../layout';

export function drawVignette(ctx: CanvasRenderingContext2D, stage: StageRect): void {
  const cx = stage.x + stage.w / 2;
  const cy = stage.y + stage.h / 2;
  const r = Math.hypot(stage.w, stage.h) / 2;
  const g = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.7, 'rgba(4,6,8,0.35)');
  g.addColorStop(1, 'rgba(3,5,7,0.92)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(stage.x, stage.y, stage.w, stage.h);
  // and let the letterbox bars be true void
  ctx.fillStyle = PALETTE.voidTop;
  if (stage.x > 0) {
    ctx.fillRect(0, 0, stage.x, ctx.canvas.height);
    ctx.fillRect(stage.x + stage.w, 0, ctx.canvas.width - (stage.x + stage.w), ctx.canvas.height);
  }
  if (stage.y > 0) {
    ctx.fillRect(0, 0, ctx.canvas.width, stage.y);
    ctx.fillRect(0, stage.y + stage.h, ctx.canvas.width, ctx.canvas.height - (stage.y + stage.h));
  }
  ctx.restore();
}

export function drawGrain(
  ctx: CanvasRenderingContext2D,
  stage: StageRect,
  tile: HTMLCanvasElement,
  frame: number,
  reduced: boolean,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.5;
  const ts = tile.width;
  // jitter the tile origin each frame so the grain shimmers (film), unless reduced
  const jx = reduced ? 0 : (frame * 7) % ts;
  const jy = reduced ? 0 : (frame * 13) % ts;
  for (let y = stage.y - jy; y < stage.y + stage.h; y += ts) {
    for (let x = stage.x - jx; x < stage.x + stage.w; x += ts) {
      ctx.drawImage(tile, x, y);
    }
  }
  ctx.restore();
}
