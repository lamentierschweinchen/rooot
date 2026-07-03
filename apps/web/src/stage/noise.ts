/**
 * ROOOT stage — baked press-grain tile (§5). The night-fog noise bakers are gone; the pop
 * world needs one thing from here: a fine PAPER-TOOTH tile, baked once, multiply-blended at
 * low alpha over the grounds so the flat inks carry the honest "printed on paper" whisper.
 * Cheap: a small tile stamped tiled at a fixed origin (a printed tooth is static, never
 * crawling). NOT distress — a uniform faint tooth, no scratches, no sepia.
 */

import { mulberry32 } from '../lib/stage-math';

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  return c;
}

/**
 * A near-white tile with a fine darker speckle in the alpha. Drawn with 'multiply' at low
 * alpha it deposits a faint even tooth (darkens the micro-texture) without greying the cream
 * or lifting black. Values kept high (mostly white) so the effect is a whisper, not a wash.
 */
export function bakeGrainTile(size = 128, seed = 7): HTMLCanvasElement {
  const rnd = mulberry32(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const g = rnd();
    const idx = i * 4;
    // mostly white; a scatter of slightly darker specks (the paper tooth) carried in alpha
    const v = 200 + Math.round(g * 55); // 200..255 grey
    const speck = g < 0.14 ? Math.round((0.14 - g) / 0.14 * 90) : 0; // sparse darker points
    img.data[idx] = v;
    img.data[idx + 1] = v;
    img.data[idx + 2] = v;
    img.data[idx + 3] = speck;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
