/**
 * ROOOT stage — PRESS TEXTURE (§5 / §9). NOT wear, NEVER distress. The honest signature
 * of a real offset press: a subtle uniform paper tooth over the grounds + a hair of CMYK
 * misregistration on the frame. Clean saturated ink is the target (Topps / Mexico-70) —
 * if it looks distressed or glowing, it's wrong. No vignette, no glow, no sepia.
 *
 * The letterbox bars around the composed portrait are Press-Black (the mount's ink), not
 * a void. Grain is STATIC (a printed tooth doesn't crawl) so nothing shimmers frame to
 * frame; reduced-motion changes nothing here — texture is already still.
 */

import { INK } from '../pop';
import { HALFTONE } from '../../lib/theme';
import type { StageRect } from '../layout';

/** Press-Black letterbox bars — the mount around the portrait poster. */
export function drawLetterbox(ctx: CanvasRenderingContext2D, stage: StageRect): void {
  ctx.save();
  ctx.fillStyle = `rgb(${INK.pressBlack[0]},${INK.pressBlack[1]},${INK.pressBlack[2]})`;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  if (stage.x > 0) {
    ctx.fillRect(0, 0, stage.x, ch);
    ctx.fillRect(stage.x + stage.w, 0, cw - (stage.x + stage.w), ch);
  }
  if (stage.y > 0) {
    ctx.fillRect(0, 0, cw, stage.y);
    ctx.fillRect(0, stage.y + stage.h, cw, ch - (stage.y + stage.h));
  }
  ctx.restore();
}

/**
 * Uniform offset grain over the composed stage — a faint paper tooth (§5, HALFTONE.grain).
 * Multiply-blend a fine speckle tile at low alpha so it darkens the tooth without lifting
 * black or greying the cream. Tiled at a fixed origin (static — a printed tooth is still).
 */
export function drawGrain(
  ctx: CanvasRenderingContext2D,
  stage: StageRect,
  tile: HTMLCanvasElement,
  _frame: number,
  _reduced: boolean,
): void {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = HALFTONE.grain * 1.6; // subtle — the "printed on paper" whisper
  const ts = tile.width;
  for (let y = stage.y; y < stage.y + stage.h; y += ts) {
    for (let x = stage.x; x < stage.x + stage.w; x += ts) {
      ctx.drawImage(tile, x, y);
    }
  }
  ctx.restore();
}
