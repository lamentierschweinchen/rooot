/**
 * ROOOT stage — THE RAIL: % legibility chips + ROAR ring-meter + pop-ball (§6.5/§6.6/§6.10).
 *
 * The pct-chips-donor canon puts a rail of keyline chips down the right edge: ENG 39% /
 * DRAW 27% / MEX 34%, each a color-header cap + a big Doto percentage + a block-meter grid
 * (filled cells ≈ the percentage, read bottom-up). They update with the EASED market values
 * so the number always matches the picture (§5). The number is Doto (measured), the label
 * cap is Anybody (a shouted tricode / DRAW). A DRAW chip uses terraceGrey.
 *
 * Below the chips (canon bottom rail): a ROAR ring-meter (off-center concentric rings that
 * pulse OUTWARD with cheer rate — Wyman op-art, the off-center source dot is the signature)
 * and a pop-ball glyph (the 5-segment Wyman pinwheel — NEVER a hexagon soccer ball).
 *
 * Every rail cell carries a JOB (§2 — a cell with no data job is sticker-bomb, banned).
 */

import { COMPONENTS, GRID } from '../../lib/theme';
import { INK, fontData, fontDisplay, setStretch, luma } from '../pop';
import type { PopTheme } from '../pop';
import type { StageRect, PitchRect } from '../layout';
import { rgba, clamp01 } from '../../lib/stage-math';
import type { RGBTuple } from '../../lib/stage-math';
import { inkStrokeRect, inkTooth } from '../../lib/ink';

export interface RailInputs {
  /** eased shown probabilities (the same values driving the fronts — number matches picture) */
  pHome: number;
  pDraw: number;
  pAway: number;
  homeCode: string;
  awayCode: string;
  homeTheme: PopTheme;
  awayTheme: PopTheme;
  /** roar 0..1 (max of the two ends) → the ring pulse rate; and phase clock */
  roar: number;
  t: number;
  reducedMotion: boolean;
}

/** one % chip: color header cap → big Doto % → block-meter grid. */
function drawPctChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  pct: number,
  headerInk: RGBTuple,
  numberInk: RGBTuple,
): void {
  // chip body = the warm printed paper (PRINT-SOUL item 3 — a chip face is a small sheet,
  // not a flat hex) then a PANEL-weight Press-Black keyline (item 4).
  ctx.fillStyle = rgba(INK.newsprint, 1);
  ctx.fillRect(x, y, w, h);
  inkTooth(ctx, { x, y, w, h });

  // header cap — the team color (or terraceGrey for DRAW), label in Anybody. The loud cap
  // gets a whisper of tooth too so it prints on paper, not as a sterile swatch.
  const headH = h * 0.24;
  ctx.fillStyle = rgba(headerInk, 1);
  ctx.fillRect(x, y, w, headH);
  inkTooth(ctx, { x, y, w, h: headH }, 0.05);
  ctx.fillStyle = rgba(luma(headerInk) > 150 ? INK.pressBlack : INK.newsprint, 1);
  ctx.font = fontDisplay(headH * 0.62, 800);
  setStretch(ctx, 108);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + headH / 2);

  // big Doto percentage
  const pctText = `${Math.round(clamp01(pct) * 100)}%`;
  const numY = y + headH + (h - headH) * 0.24;
  ctx.font = fontData((h - headH) * 0.34, 600);
  ctx.fillStyle = rgba(numberInk, 1);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(pctText, x + w / 2, numY);

  // block-meter grid — filled cells ≈ pct, read bottom-up
  const cols = COMPONENTS.pctChip.meterCols;
  const rows = COMPONENTS.pctChip.meterRows;
  const meterTop = numY + (h - headH) * 0.16;
  const meterX = x + w * 0.14;
  const meterW = w * 0.72;
  const meterH = y + h - meterTop - h * 0.06;
  const gap = COMPONENTS.pctChip.meterGap;
  const cw = meterW / cols;
  const chh = meterH / rows;
  const total = cols * rows;
  const filled = Math.round(clamp01(pct) * total);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // fill bottom-up: index counts from the bottom row
      const idx = r * cols + c;
      const isFilled = idx < filled;
      const cellX = meterX + c * cw + cw * gap * 0.5;
      const cellY = meterTop + (rows - 1 - r) * chh + chh * gap * 0.5;
      const cellW = cw * (1 - gap);
      const cellH = chh * (1 - gap);
      ctx.fillStyle = isFilled ? rgba(numberInk, 1) : rgba(INK.terraceGrey, 0.32);
      ctx.fillRect(cellX, cellY, cellW, cellH);
    }
  }

  // chip keyline last (crisp over everything) — PANEL weight, a breathing pressed rule
  inkStrokeRect(ctx, x, y, w, h, w, 'panel', INK.pressBlack, Math.round(pct * 100));
}

/** the ROAR ring-meter — off-center concentric rings pulsing outward with cheer rate. */
function drawRoarMeter(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  roar: number,
  t: number,
  reduced: boolean,
): void {
  const rings = COMPONENTS.roarMeter.rings;
  const off = r * COMPONENTS.roarMeter.sourceOffset;
  // off-center source dot (the signature)
  const sx = cx - off;
  const sy = cy + off * 0.4;
  ctx.save();
  ctx.strokeStyle = rgba(INK.pressBlack, 1);
  ctx.lineWidth = Math.max(1, r * COMPONENTS.roarMeter.ringWeight);
  // discrete expansion: a ring "births" at the source and steps outward; period tracks roar
  const steps = 4;
  const period = reduced ? 1e9 : 0.9 / (0.4 + roar * 1.4); // faster at higher roar
  const phase = reduced ? 0 : (t % period) / period; // 0..1 birth→edge
  for (let i = 0; i < rings; i++) {
    const baseR = ((i + 1) / rings) * r;
    // animate a discrete outward step by nudging each ring's radius on the beat
    const stepR = reduced ? baseR : baseR + (phase * (r / rings)) * ((i % steps) === Math.floor(phase * steps) ? 1 : 0.4);
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(1, stepR), 0, Math.PI * 2);
    ctx.stroke();
  }
  // the source dot, filled
  ctx.fillStyle = rgba(INK.pressBlack, 1);
  ctx.beginPath();
  ctx.arc(sx, sy, Math.max(2, r * 0.1), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** the pop-ball — a FIVE-segment Wyman pinwheel on a disc. NEVER a hexagon soccer ball. */
export function drawPopBall(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  a: RGBTuple,
  b: RGBTuple,
  rot = 0,
): void {
  const segs = COMPONENTS.popBall.segments; // 5
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  // five pinwheel segments alternating two inks + black gaps
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    // swirl: pull each segment's outer edge around for the pinwheel spin
    const swirl = 0.55;
    ctx.fillStyle = rgba(i % 2 ? a : b, 1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, a0, a1);
    ctx.closePath();
    ctx.fill();
    // black spoke between segments (the pinwheel blades)
    ctx.strokeStyle = rgba(INK.pressBlack, 1);
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a0 + swirl * 0.0) * r, Math.sin(a0) * r);
    ctx.stroke();
  }
  // center hub + outer keyline ring
  ctx.fillStyle = rgba(INK.pressBlack, 1);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(INK.pressBlack, 1);
  ctx.lineWidth = Math.max(1, r * COMPONENTS.popBall.ring);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draw the full right-edge rail: three % chips (home / draw / away order per canon: leader
 * top) + a ROAR ring-meter cell + a pop-ball cell at the bottom. All inside keyline cells.
 */
export function drawRail(
  ctx: CanvasRenderingContext2D,
  stage: StageRect,
  pitch: PitchRect,
  inp: RailInputs,
): void {
  const border = Math.max(2, Math.round(stage.w * GRID.border));
  // the rail lives in the right margin between the pitch and the frame
  const railX = pitch.x + pitch.w + stage.w * 0.012;
  const railR = stage.x + stage.w - border - stage.w * 0.01;
  const railW = Math.max(24, railR - railX);
  const top = pitch.y;
  const bottom = pitch.y + pitch.h;
  const totalH = bottom - top;

  // three chips take ~72% of the height, meter ~14%, ball ~10%, gaps between
  const gap = totalH * 0.02;
  const chipH = (totalH * 0.72 - gap * 2) / 3;
  let y = top;

  // HOME chip
  drawPctChip(ctx, railX, y, railW, chipH, inp.homeCode, inp.pHome, inp.homeTheme.primary, inp.homeTheme.primary);
  y += chipH + gap;
  // DRAW chip (terraceGrey header + number)
  drawPctChip(ctx, railX, y, railW, chipH, 'DRAW', inp.pDraw, INK.terraceGrey, INK.terraceGrey);
  y += chipH + gap;
  // AWAY chip
  drawPctChip(ctx, railX, y, railW, chipH, inp.awayCode, inp.pAway, inp.awayTheme.primary, inp.awayTheme.primary);
  y += chipH + gap * 1.6;

  // ROAR meter cell — warm paper face + PANEL keyline
  const meterH = totalH * 0.14;
  ctx.save();
  ctx.fillStyle = rgba(INK.newsprint, 1);
  ctx.fillRect(railX, y, railW, meterH);
  inkTooth(ctx, { x: railX, y, w: railW, h: meterH });
  inkStrokeRect(ctx, railX, y, railW, meterH, railW, 'panel', INK.pressBlack, 7);
  drawRoarMeter(ctx, railX + railW / 2, y + meterH * 0.5, Math.min(railW, meterH) * 0.36, inp.roar, inp.t, inp.reducedMotion);
  ctx.restore();
  y += meterH + gap;

  // pop-ball cell — warm paper face + PANEL keyline
  const ballH = Math.min(totalH * 0.1, bottom - y);
  if (ballH > 8) {
    ctx.save();
    ctx.fillStyle = rgba(INK.newsprint, 1);
    ctx.fillRect(railX, y, railW, ballH);
    inkTooth(ctx, { x: railX, y, w: railW, h: ballH });
    inkStrokeRect(ctx, railX, y, railW, ballH, railW, 'panel', INK.pressBlack, 9);
    const rr = Math.min(railW, ballH) * 0.34;
    const rot = inp.reducedMotion ? 0 : Math.floor((inp.t * 4) % 10) * (Math.PI * 2 / 10); // stepped spin
    drawPopBall(ctx, railX + railW / 2, y + ballH / 2, rr, INK.poppy, INK.aztecaSun, rot);
    ctx.restore();
  }
}
