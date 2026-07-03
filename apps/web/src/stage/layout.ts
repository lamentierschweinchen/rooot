/**
 * ROOOT stage — layout + the probability→position mapping (the honesty core).
 *
 * The stage composes to a phone-portrait rect, letterboxed inside whatever canvas
 * it's given (desktop letterboxes the same portrait stage gracefully — brief).
 *
 * The market mapping is EXACT and NaN-guarded (guard lives upstream in normOdds):
 *   home light edge sits at pHome of the PITCH LENGTH measured from the bottom;
 *   away light edge sits at pAway measured from the top; the fog occupies the
 *   remainder in the middle and its extent == p(draw). Halfway line == 50/50.
 */

import { GEO } from './geometry';

export interface StageRect {
  /** device-pixel rect of the composed portrait stage inside the canvas */
  x: number;
  y: number;
  w: number;
  h: number;
  dpr: number;
}

export interface PitchRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** y of the home goal line (bottom) and away goal line (top) */
  homeGoalY: number;
  awayGoalY: number;
  midY: number;
  cx: number;
}

/** Compose the portrait stage rect centered in the canvas (letterbox). */
export function computeStageRect(canvasW: number, canvasH: number, dpr: number): StageRect {
  const cw = Math.max(1, canvasW);
  const ch = Math.max(1, canvasH);
  const target = GEO.aspect; // w/h
  let w = cw;
  let h = w / target;
  if (h > ch) {
    h = ch;
    w = h * target;
  }
  return {
    x: Math.round((cw - w) / 2),
    y: Math.round((ch - h) / 2),
    w: Math.round(w),
    h: Math.round(h),
    dpr,
  };
}

export function computePitchRect(stage: StageRect): PitchRect {
  // the pitch is inset by the left touchline margin and the (wider) right RAIL margin, so
  // the honest dot fields never run under the % / ROAR rail. The crowd ends occupy the
  // top/bottom margins. computeFront (below) maps probability onto this pitch rect exactly.
  const x = stage.x + stage.w * GEO.sideMargin;
  const w = stage.w * (1 - GEO.sideMargin - GEO.railMargin);
  const y = stage.y + stage.h * GEO.endBandTop;
  const h = stage.h * (1 - GEO.endBandTop - GEO.endBandBottom);
  return {
    x,
    y,
    w,
    h,
    awayGoalY: y,
    homeGoalY: y + h,
    midY: y + h / 2,
    cx: x + w / 2,
  };
}

export interface MarketFront {
  /** y (device px) where HOME light dies into fog — pHome of pitch length up from bottom */
  homeEdgeY: number;
  /** y where AWAY light dies into fog — pAway of pitch length down from top */
  awayEdgeY: number;
  /** the fog band between the two edges (== the draw); may invert if fog≈0 */
  fogTopY: number;
  fogBottomY: number;
  /** normalized fog extent (== pDraw), 0..1 */
  fogExtent: number;
}

/**
 * Map normalized probabilities to the pitch. Inputs MUST already be normalized &
 * finite (see normOdds). homeEdge rises from the bottom by pHome; awayEdge descends
 * from the top by pAway; the gap between them is the fog (== pDraw). We never let the
 * edges cross into fiction — if rounding pushes them past each other we clamp to a
 * hairline so the fog just closes to a seam (a dead-level, fog-choked pitch).
 */
export function computeFront(pitch: PitchRect, pHome: number, pDraw: number, pAway: number): MarketFront {
  const H = pitch.h;
  const homeRise = pHome * H; // home light rises up from the bottom by pHome of the length
  const awayFall = pAway * H; // away light presses down from the top by pAway
  const homeEdgeY = pitch.homeGoalY - homeRise;
  const awayEdgeY = pitch.awayGoalY + awayFall;
  // The fog IS the draw: its band spans exactly pDraw of the pitch, centered between the
  // two edges. With normalized inputs (pHome+pDraw+pAway≈1) this coincides with the gap
  // between the edges; anchoring to pDraw keeps the draw honest even if the inputs are a
  // hair off-normalized, and guarantees the extent never goes fictional.
  let fogTopY = awayEdgeY;
  let fogBottomY = homeEdgeY;
  if (fogBottomY < fogTopY) {
    // edges crossed (numerical) — collapse fog to a seam at their midpoint
    const mid = (fogTopY + fogBottomY) / 2;
    fogTopY = mid;
    fogBottomY = mid;
  }
  const fogExtent = Math.max(0, Math.min(1, pDraw));
  return { homeEdgeY, awayEdgeY, fogTopY, fogBottomY, fogExtent };
}
