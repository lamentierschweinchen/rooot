/**
 * ROOOT stage — baked texture sources (fog body + film grain).
 *
 * Cheap by design (brief: "fog can be cheap — blurred noise layers + composite ops").
 * We bake a couple of small tiling value-noise canvases ONCE, then the fog layer
 * just draws them scrolled/scaled with 'screen'/'lighter' compositing. The grain is
 * a small tile re-seeded occasionally and stamped with low alpha over everything
 * (the rain/sweat register — rain-&-floodlights.jpg, droplets-and-ball.jpg).
 */

import { mulberry32, clamp01 } from '../lib/stage-math';

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  return c;
}

/**
 * Smoothed value noise baked into a greyscale tile (alpha carries the value).
 * `floor` lifts the minimum alpha: 0 → pure texture (wisps on transparent, for churn);
 * ~0.45 → a MASK tile (destination-in keeps most of the target but noise dips eat
 * irregular bites — how the fog's edges break into tendrils instead of clean lines).
 */
export function bakeFogTile(size = 256, seed = 1337, octaves = 4, floor = 0): HTMLCanvasElement {
  const rnd = mulberry32(seed);
  // low-res lattice we bilinearly upsample for softness
  const lat = 32;
  const grid: number[] = new Array((lat + 1) * (lat + 1));
  for (let i = 0; i < grid.length; i++) grid[i] = rnd();

  const sample = (u: number, v: number): number => {
    // fractal: sum octaves of the lattice at increasing frequency
    let amp = 0.6;
    let freq = 1;
    let val = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const x = ((u * freq) % 1) * lat;
      const y = ((v * freq) % 1) * lat;
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      const i00 = (yi % lat) * (lat + 1) + (xi % lat);
      const i10 = (yi % lat) * (lat + 1) + ((xi + 1) % lat);
      const i01 = ((yi + 1) % lat) * (lat + 1) + (xi % lat);
      const i11 = ((yi + 1) % lat) * (lat + 1) + ((xi + 1) % lat);
      const sx = xf * xf * (3 - 2 * xf);
      const sy = yf * yf * (3 - 2 * yf);
      const top = (grid[i00] ?? 0.5) * (1 - sx) + (grid[i10] ?? 0.5) * sx;
      const bot = (grid[i01] ?? 0.5) * (1 - sx) + (grid[i11] ?? 0.5) * sx;
      val += (top * (1 - sy) + bot * sy) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return norm > 0 ? val / norm : 0.5;
  };

  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = sample(x / size, y / size);
      // push contrast so wisps read; store value in RGB (white) + alpha
      const v = clamp01(floor + (1 - floor) * clamp01((n - 0.35) * 1.9));
      const idx = (y * size + x) * 4;
      img.data[idx] = 255;
      img.data[idx + 1] = 255;
      img.data[idx + 2] = 255;
      img.data[idx + 3] = Math.round(v * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Monochrome grain tile. Alpha noise on white, so drawing it with low alpha adds a
 * fine speckle; drawing the same tile with 'multiply' would darken — we use 'overlay'
 * at the call site for a balanced film grain.
 */
export function bakeGrainTile(size = 128, seed = 7): HTMLCanvasElement {
  const rnd = mulberry32(seed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const g = rnd();
    const idx = i * 4;
    // signed grain rendered as grey around mid; overlay makes mid neutral
    const v = Math.round(110 + g * 60);
    img.data[idx] = v;
    img.data[idx + 1] = v;
    img.data[idx + 2] = v;
    img.data[idx + 3] = Math.round(g * 90);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** A soft radial sprite (white core → transparent) for embers, phone-lights, glitter. */
export function bakeGlowSprite(size = 64, hardness = 0.0): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(clamp01(0.18 + hardness * 0.5), 'rgba(255,255,255,0.85)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Soft vertical smoke puff sprite (for bengalo columns) — brighter low, fading up. */
export function bakeSmokeSprite(size = 128): HTMLCanvasElement {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d')!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}
