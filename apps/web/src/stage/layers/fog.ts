/**
 * ROOOT stage — THE FOG BANK == THE DRAW.
 *
 * The fog occupies the band between the two dying light fronts. Its vertical extent
 * IS p(draw): a decisive match → a thin seam of fog; a dead-level match → a thick,
 * choking bank across the middle. It DRIFTS (ambient) and, late in a level game,
 * THICKENS — penalties approaching, as weather (brief).
 *
 * Reference: floodlight-and-fog.jpg fog body — soft, particulate, cool grey, with NO
 * hard edges anywhere; it dissolves into darkness on every side.
 *
 * CRAFT NOTE (fixes the v1/v2 "hard grey rectangle"): the fog is composited on its OWN
 * transparent offscreen buffer. Only there does destination-in feathering actually cut
 * the edges to zero (on the opaque main canvas it would erase the pitch instead). We:
 *   1. clear the buffer
 *   2. paint a soft vertical haze (0 → peak → 0 across the band)
 *   3. multiply in a horizontal falloff (destination-in) so it dies at the touchlines
 *   4. texture it with drifting noise (source-atop) so the haze churns but keeps its shape
 * then the caller draws the buffer over the pitch. No rectangle is ever visible.
 */

import { RGB } from '../theme';
import type { PitchRect, MarketFront } from '../layout';
import { rgba, clamp01 } from '../../lib/stage-math';

export interface FogDrawArgs {
  /** the MAIN ctx (where the finished fog lands) */
  ctx: CanvasRenderingContext2D;
  /** a transparent offscreen buffer sized to the canvas (cleared here) */
  buf: CanvasRenderingContext2D;
  pitch: PitchRect;
  front: MarketFront;
  tile: HTMLCanvasElement;
  t: number;
  /** 0..1 — late + level → thicker, stiller fog (penalties as weather) */
  tension: number;
  reducedMotion: boolean;
}

export function drawFog(a: FogDrawArgs): void {
  const { ctx, buf, pitch, front, tile, t, tension, reducedMotion } = a;
  const H = pitch.h;

  const rawTop = front.fogTopY;
  const rawBot = front.fogBottomY;
  const rawH = rawBot - rawTop;
  const minSeam = H * 0.015;
  const mid = (rawTop + rawBot) / 2;
  const coreTop = rawH < minSeam ? mid - minSeam / 2 : rawTop;
  const coreBot = rawH < minSeam ? mid + minSeam / 2 : rawBot;
  const coreH = coreBot - coreTop;

  const extent = clamp01(coreH / H); // == pDraw
  const density = clamp01(0.3 + extent * 0.85 + tension * 0.3);

  // the fog bleeds a bit past the core into the light on both sides (the smear), so the
  // draw has no seam against the shafts.
  const bleed = H * (0.06 + extent * 0.14);
  const top = coreTop - bleed;
  const bot = coreBot + bleed;
  const bandH = bot - top;
  if (bandH <= 0) return;

  const cx = pitch.cx;
  const w = pitch.w;
  const hpad = w * 0.16;
  const bx = cx - w / 2 - hpad;
  const bw = w + hpad * 2;

  // clear only the region we touch (cheap; whole buffer clear also fine)
  buf.save();
  buf.setTransform(1, 0, 0, 1, 0, 0);
  buf.clearRect(bx - 4, top - 4, bw + 8, bandH + 8);
  buf.restore();

  buf.save();

  // 1) vertical haze profile (0 → peak → 0)
  const featherFrac = clamp01(bleed / (bandH * 0.5 + 1e-3));
  const vgrad = buf.createLinearGradient(0, top, 0, bot);
  vgrad.addColorStop(0, rgba(RGB.fog, 0));
  vgrad.addColorStop(clamp01(featherFrac * 0.85), rgba(RGB.fog, 0.06 * density));
  vgrad.addColorStop(0.5, rgba(RGB.fog, 0.34 * density));
  vgrad.addColorStop(clamp01(1 - featherFrac * 0.85), rgba(RGB.fog, 0.06 * density));
  vgrad.addColorStop(1, rgba(RGB.fog, 0));
  buf.fillStyle = vgrad;
  buf.fillRect(bx, top, bw, bandH);

  // 2) horizontal falloff — die into the void at the touchlines
  buf.globalCompositeOperation = 'destination-in';
  const hgrad = buf.createLinearGradient(bx, 0, bx + bw, 0);
  hgrad.addColorStop(0, 'rgba(0,0,0,0)');
  hgrad.addColorStop(0.16, 'rgba(0,0,0,1)');
  hgrad.addColorStop(0.84, 'rgba(0,0,0,1)');
  hgrad.addColorStop(1, 'rgba(0,0,0,0)');
  buf.fillStyle = hgrad;
  buf.fillRect(bx, top, bw, bandH);

  // 3) drifting noise texture — only where haze exists (source-atop), churns the bank
  buf.globalCompositeOperation = 'source-atop';
  const drift = reducedMotion ? 0 : t;
  const speedK = 1 - tension * 0.55;
  const ts = tile.width;
  const scale = Math.max(bandH * 1.3, w * 0.7) / ts;
  const layers: Array<{ dx: number; dy: number; a: number; s: number }> = [
    { dx: drift * 5 * speedK, dy: -drift * 2.4 * speedK, a: 0.4, s: scale },
    { dx: -drift * 3 * speedK, dy: drift * 1.5 * speedK, a: 0.3, s: scale * 1.6 },
  ];
  for (const L of layers) {
    const sw = ts * L.s;
    const sh = ts * L.s;
    const startX = bx - sw + (((L.dx % sw) + sw) % sw) - sw;
    const startY = top - sh + (((L.dy % sh) + sh) % sh) - sh;
    buf.globalAlpha = L.a;
    for (let y = startY; y < bot + sh; y += sh) {
      for (let x = startX; x < bx + bw + sw; x += sw) {
        buf.drawImage(tile, x, y, sw, sh);
      }
    }
  }
  buf.globalAlpha = 1;
  buf.restore();

  // land the finished fog on the main canvas
  ctx.drawImage(buf.canvas, bx - 4, top - 4, bw + 8, bandH + 8, bx - 4, top - 4, bw + 8, bandH + 8);

  // a faint additive scatter lip where fog meets each front (light dying into haze)
  drawScatterLip(ctx, pitch, front.homeEdgeY, -1, density, extent);
  drawScatterLip(ctx, pitch, front.awayEdgeY, +1, density, extent);
}

function drawScatterLip(
  ctx: CanvasRenderingContext2D,
  pitch: PitchRect,
  edgeY: number,
  into: 1 | -1,
  density: number,
  extent: number,
): void {
  if (extent < 0.02) return;
  const h = pitch.h * 0.06;
  const cx = pitch.cx;
  const w = pitch.w;
  const yTop = Math.min(edgeY, edgeY + into * h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - w / 2, yTop, w, h);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, edgeY, 0, edgeY + into * h);
  g.addColorStop(0, rgba(RGB.fog, 0.1 * density));
  g.addColorStop(1, rgba(RGB.fog, 0));
  ctx.fillStyle = g;
  ctx.fillRect(cx - w / 2, yTop, w, h);
  ctx.restore();
}
