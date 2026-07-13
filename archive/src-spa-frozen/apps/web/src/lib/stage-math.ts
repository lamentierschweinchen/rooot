/**
 * ROOOT stage — tiny pure math helpers (NEW file, additive; owned by stage lane).
 *
 * No DOM, no state, no imports. Every divide is guarded so a bad odds tick
 * (NaN / 0-sum / partial) can never smear the canvas. STRATA discipline.
 */

export function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Smooth Hermite step in [0,1]. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const d = edge1 - edge0;
  if (Math.abs(d) < 1e-9) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / d);
  return t * t * (3 - 2 * t);
}

/** Ease that STRATA used: cubic in-out — calm, no overshoot (odds never fake momentum). */
export function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/**
 * Frame-rate-independent exponential approach. `smoothing` ~= seconds to close
 * ~63% of the gap. Used to breathe values toward a target between odds ticks.
 */
export function approach(current: number, target: number, smoothing: number, dt: number): number {
  if (!Number.isFinite(current)) return target;
  if (!Number.isFinite(target)) return current;
  if (smoothing <= 0) return target;
  const k = 1 - Math.exp(-dt / smoothing);
  return current + (target - current) * k;
}

export interface NormOdds {
  home: number;
  draw: number;
  away: number;
  /** false when the input was unusable and we fell back to an even split */
  ok: boolean;
}

/**
 * De-vig-safe normalization. The market feed already de-vigs, but we never trust
 * that the three sum to exactly 1, and we refuse to render NaN. On any bad input
 * we fall back to an honest even split and flag ok=false so the caller can hold.
 */
export function normOdds(pHome: number, pDraw: number, pAway: number): NormOdds {
  const h = Number.isFinite(pHome) ? Math.max(0, pHome) : 0;
  const d = Number.isFinite(pDraw) ? Math.max(0, pDraw) : 0;
  const a = Number.isFinite(pAway) ? Math.max(0, pAway) : 0;
  const sum = h + d + a;
  if (sum < 1e-6) {
    return { home: 1 / 3, draw: 1 / 3, away: 1 / 3, ok: false };
  }
  return { home: h / sum, draw: d / sum, away: a / sum, ok: true };
}

/** Deterministic hash → [0,1). For laying out static starfields/embers without Math.random churn. */
export function hash11(n: number): number {
  let x = Math.sin(n * 127.1) * 43758.5453;
  x = x - Math.floor(x);
  return x;
}

export function hash21(x: number, y: number): number {
  let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  n = n - Math.floor(n);
  return n;
}

/** Small mulberry32 PRNG — seeded, fast, for particle jitter that must be stable per session. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Parse "#rrggbb" (or short "#rgb") to [r,g,b] 0-255. Falls back to mid-grey. */
export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  if (h.length !== 6) return [128, 128, 128];
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export type RGBTuple = readonly [number, number, number];

export function rgba(rgb: RGBTuple, a: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${clamp01(a)})`;
}

/** Mix two rgb colors, t in [0,1]. */
export function mixRgb(a: RGBTuple, b: RGBTuple, t: number): [number, number, number] {
  const k = clamp01(t);
  return [
    Math.round(lerp(a[0], b[0], k)),
    Math.round(lerp(a[1], b[1], k)),
    Math.round(lerp(a[2], b[2], k)),
  ];
}
