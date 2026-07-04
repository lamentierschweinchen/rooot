/**
 * ROOOT app — THE SHEET (page-level paper materiality; BRIEF-PRINT-SOUL §3, Lane-A
 * slice only). The Newsprint page must not read as one flat hex across thousands of
 * pixels — no real paper is. This bakes a SUBTLE, STATIC underlay ONCE to a canvas →
 * dataURI, applied as the page background so the whole watching experience feels
 * printed on a single warm sheet:
 *
 *   · a corner VIGNETTE — 2–3% darker toward the edges (ink settles at the deckle);
 *   · a faint TOOTH — a sparse speckle, a hair more present than a flat fill;
 *   · one warm↔cool DRIFT — a single diagonal ±2 RGB ramp across the sheet.
 *
 * This is print PHYSICS, not decoration: baked, deterministic, ≤2 RGB of drift, no
 * blur, no gradient-as-ornament, no distress. It never touches a data mapping. The
 * dedicated materiality pass owns the stage/relic primitives; this is only the page.
 */

import { COLORS } from '../lib/theme';

/** parse "#rrggbb" → [r,g,b]. */
function hex(c: string): [number, number, number] {
  const h = c.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function clamp8(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : Math.round(n);
}

/** a tiny deterministic hash → [0,1) so the tooth speckle is stable across reloads. */
function hash2(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Bake the sheet to a dataURI. `w`×`h` is the baked tile/sheet resolution — we bake a
 * modest sheet (not full-window) and let CSS stretch it (`background-size: cover`);
 * the vignette + drift are low-frequency so stretching stays clean, and the tooth is
 * a high-freq speckle that reads as grain at any scale. Cheap: one bake at boot.
 */
export function bakePaperSheet(w = 480, h = 800): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const base = hex(COLORS.newsprint); // #F3ECDA
  // the warm/cool poles of the diagonal drift — ±2 RGB only (barely-there, a material)
  const warm: [number, number, number] = [2, 1, -1]; // toward warmer (more red, less blue)
  const cool: [number, number, number] = [-2, -1, 1]; // toward cooler

  const img = ctx.createImageData(w, h);
  const data = img.data;
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.hypot(cx, cy);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;

      // 1) diagonal warm↔cool drift: t in [0,1] along the ↘ diagonal
      const t = (x / w + y / h) / 2;
      const dr = warm[0] + (cool[0] - warm[0]) * t;
      const dg = warm[1] + (cool[1] - warm[1]) * t;
      const db = warm[2] + (cool[2] - warm[2]) * t;

      // 2) corner vignette: darken up to ~2.5% toward the edges (radial, discrete-ish)
      const r = Math.hypot(x - cx, y - cy) / maxR; // 0 center → 1 corner
      const vig = 1 - 0.025 * (r * r); // gentle, square-law, max ~2.5% at the corner

      // 3) faint tooth: a sparse ±1.5 speckle so the fill isn't mathematically uniform
      const n = hash2(x, y);
      const tooth = n > 0.86 ? -1.5 : n < 0.06 ? 1.0 : 0;

      data[i] = clamp8((base[0] + dr) * vig + tooth);
      data[i + 1] = clamp8((base[1] + dg) * vig + tooth);
      data[i + 2] = clamp8((base[2] + db) * vig + tooth);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  try {
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}
