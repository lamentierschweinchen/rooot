/**
 * ROOOT relics — PAINT FOUNDATION (NEW; owned by the relics lane).
 *
 * Self-contained, dependency-free (beyond the read-only theme tokens) canvas
 * primitives shared by the four print generators (card / stub / poster / scarf).
 * Kept hermetic to this lane on purpose: the renderers are PURE functions
 * (data → offscreen canvas), so nothing here touches DOM state, RAF, or the
 * live stage. Where SYSTEM.md is the law, this file is its typed hand for print.
 *
 * The world (SYSTEM.md): FLAT SPOT INK on cream. Benday halftone dots, hard
 * Press-Black keylines + cream borders, one diagonal max, honest geometry that
 * FRAYS into scattered dots, pop-geometry glyphs. No gradients, no glow, no blur,
 * no sepia, no faces, no hexagon balls. Numbers print in Doto; shouts in Anybody.
 */

import {
  NEUTRALS,
  LOUD,
  ACCENTS,
  HALFTONE,
  FRAY,
  GRID,
  FONT_URLS,
  COMPONENTS,
} from '../lib/theme';

/* =========================================================================
 * COLOR — the law's hexes resolved to rgb once; never re-typed here.
 * ===================================================================== */

export type RGB = readonly [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h,
    16,
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

export function rgb(c: RGB): string {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function rgba(c: RGB, a: number): string {
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** Mix two inks (t=0 → a, t=1 → b). Used ONLY for paper tooth, never to blend two louds. */
export function mix(a: RGB, b: RGB, t: number): RGB {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    Math.round(a[0] + (b[0] - a[0]) * u),
    Math.round(a[1] + (b[1] - a[1]) * u),
    Math.round(a[2] + (b[2] - a[2]) * u),
  ] as const;
}

export function luma(c: RGB): number {
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}

/** §1 legibility gate — type on a loud ground is black or cream, whichever contrasts. */
export function inkOn(ground: RGB): RGB {
  return luma(ground) > 150 ? INK.pressBlack : INK.newsprint;
}

/** The palette as rgb — the law's hexes, resolved once. */
export const INK = {
  newsprint: hexToRgb(NEUTRALS.newsprint),
  sunbleach: hexToRgb(NEUTRALS.sunbleach),
  pressBlack: hexToRgb(NEUTRALS.pressBlack),
  terraceGrey: hexToRgb(NEUTRALS.terraceGrey),
  medalGold: hexToRgb(NEUTRALS.medalGold),
  poppy: hexToRgb(LOUD.poppy),
  kickoffSky: hexToRgb(LOUD.kickoffSky),
  aztecaSun: hexToRgb(LOUD.aztecaSun),
  grass: hexToRgb(LOUD.grass),
  ultra: hexToRgb(LOUD.ultra),
  magenta: hexToRgb(LOUD.magenta),
  fizzPink: hexToRgb(ACCENTS.eruption),
} as const;

/* =========================================================================
 * DETERMINISTIC RNG — a seeded generator so every render is byte-stable
 * (no Math.random churn; the same relic always prints identically).
 * ===================================================================== */

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

/* =========================================================================
 * CANVAS — an offscreen buffer at print resolution.
 * ===================================================================== */

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctxOf(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('relics/paint: 2d context unavailable');
  return ctx;
}

/* =========================================================================
 * FONTS — load the four voices via FontFace from theme FONT_URLS BEFORE any
 * text paint (§4). We fetch each Google Fonts css2 stylesheet, pull its
 * embedded @font-face src URLs, register them as FontFace objects, and await
 * them. Pure-ish: the only side effect is populating document.fonts (idempotent).
 * ===================================================================== */

const FONT_FAMILIES = {
  anybody: { family: 'Anybody', url: FONT_URLS.anybody, weights: [700, 800, 900] },
  doto: { family: 'Doto', url: FONT_URLS.doto, weights: [400, 500, 600, 700] },
  youngSerif: { family: 'Young Serif', url: FONT_URLS.youngSerif, weights: [400] },
  silkscreen: { family: 'Silkscreen', url: FONT_URLS.silkscreen, weights: [400, 700] },
} as const;

let fontsPromise: Promise<void> | null = null;

/**
 * Ensure Anybody / Doto / Young Serif / Silkscreen are available in document.fonts.
 * Idempotent + memoized: many renders can await the same single load. Resolves even
 * on network failure (the per-face fallbacks in the font shorthands keep type visible).
 */
export function ensureRelicFonts(): Promise<void> {
  if (fontsPromise) return fontsPromise;
  if (typeof document === 'undefined' || !('fonts' in document)) {
    fontsPromise = Promise.resolve();
    return fontsPromise;
  }
  fontsPromise = (async () => {
    await Promise.all(
      Object.values(FONT_FAMILIES).map(async (f) => {
        try {
          // Google's css2 endpoint sniffs UA; request a broadly-supported format.
          const res = await fetch(f.url, {
            headers: {
              // ask for the woff2 payload (all evergreen engines) — no UA spoof needed for local dev
              Accept: 'text/css,*/*;q=0.1',
            },
          });
          if (!res.ok) return;
          const css = await res.text();
          // extract each @font-face's src url()
          const faceBlocks = css.split('@font-face');
          for (const block of faceBlocks) {
            const m = block.match(/src:\s*url\(([^)]+)\)/);
            if (!m || !m[1]) continue;
            const src = m[1].replace(/["']/g, '').trim();
            // Capture the FULL font-weight descriptor up to the ';'. Variable fonts (Doto,
            // Anybody) serve a RANGE like "100 900" — pinning to the first token ("100")
            // would lock the face to its THINNEST instance (why the dot-matrix looked faint).
            // Register the range so `ctx.font = "600 …"` selects a real weight in the axis.
            const wm = block.match(/font-weight:\s*([^;]+);/);
            const weight = wm && wm[1] ? wm[1].trim() : '400';
            // Anybody carries a wdth axis too; register its stretch range so the display
            // face can widen (the R-O-O-O-T stretch) where the engine honours it.
            const sm = block.match(/font-stretch:\s*([^;]+);/);
            const stretch = sm && sm[1] ? sm[1].trim() : undefined;
            try {
              const desc: FontFaceDescriptors = { weight };
              if (stretch) desc.stretch = stretch;
              const face = new FontFace(f.family, `url(${src})`, desc);
              const loaded = await face.load();
              (document.fonts as FontFaceSet).add(loaded);
            } catch {
              /* one face failing must not sink the set */
            }
          }
        } catch {
          /* offline / blocked — fall back to the honest system stacks */
        }
      }),
    );
    // best-effort: also nudge document.fonts.load for the exact sizes the renderers paint
    const f = document.fonts as FontFaceSet;
    const wants = [
      '900 100px "Anybody"',
      '800 80px "Anybody"',
      '700 60px "Anybody"',
      '400 100px "Doto"',
      '600 80px "Doto"',
      '700 60px "Doto"',
      '400 60px "Young Serif"',
      '700 60px "Silkscreen"',
    ];
    await Promise.all(wants.map((w) => f.load(w).catch(() => undefined))).catch(() => undefined);
  })();
  return fontsPromise;
}

/** Canvas font shorthands with period-honest fallbacks (visible even pre-load). */
export function fontData(px: number, weight = 400): string {
  return `${weight} ${Math.max(1, Math.round(px))}px "Doto", ui-monospace, monospace`;
}
export function fontDisplay(px: number, weight = 800): string {
  return `${weight} ${Math.max(1, Math.round(px))}px "Anybody", system-ui, sans-serif`;
}
export function fontSerif(px: number, weight = 400): string {
  return `${weight} ${Math.max(1, Math.round(px))}px "Young Serif", Georgia, serif`;
}
export function fontKnit(px: number, weight = 700): string {
  return `${weight} ${Math.max(1, Math.round(px))}px "Silkscreen", ui-monospace, monospace`;
}

/** Apply the Anybody wdth axis where supported (the stretch gesture as type). */
export function setStretch(ctx: CanvasRenderingContext2D, widthPct: number): void {
  try {
    (ctx as unknown as Record<string, unknown>)['fontStretch'] = `${widthPct}%`;
  } catch {
    /* engines without the axis still read weight + tracking as pop display */
  }
}

/**
 * Draw tracked (letter-spaced) text — canvas has no letter-spacing on measureText in
 * older engines, so we place glyph by glyph. Returns the total advance width.
 * `align`: 'left' starts at x; 'center' centers on x; 'right' ends at x.
 */
export function trackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: 'left' | 'center' | 'right' = 'left',
): number {
  const chars = [...text];
  let total = 0;
  for (const ch of chars) total += ctx.measureText(ch).width + tracking;
  total -= tracking; // no trailing gap
  let cx = align === 'left' ? x : align === 'center' ? x - total / 2 : x - total;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of chars) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  ctx.textAlign = prevAlign;
  return total;
}

/** Measure tracked text width without drawing. */
export function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  const chars = [...text];
  let total = 0;
  for (const ch of chars) total += ctx.measureText(ch).width + tracking;
  return total - tracking;
}

/**
 * Fit a tracked string to a max width by shrinking the font px until it fits.
 * `mkFont(px)` builds the font shorthand at a size. Returns the px actually used.
 */
export function fitTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  tracking: number,
  mkFont: (px: number) => string,
): number {
  let px = startPx;
  for (let i = 0; i < 40; i++) {
    ctx.font = mkFont(px);
    const trk = tracking * (px / startPx);
    if (trackedWidth(ctx, text, trk) <= maxWidth || px <= 6) break;
    px *= 0.94;
  }
  ctx.font = mkFont(px);
  return px;
}

/* =========================================================================
 * FRAME — the memento anatomy (§2, §10): loud ground, Press-Black keyline,
 * cream border. Every collectible surface wears this so it reads as a print.
 * Returns the INNER rect (inside the border+keyline) for content.
 * ===================================================================== */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameResult {
  /** the loud-ground field inside the cream border (border NOT painted over it) */
  ground: Rect;
  /** the content rect inside the keyline that rings the ground */
  inner: Rect;
  border: number;
  keyline: number;
}

/**
 * Paint the mandatory print frame: cream border (§2, ~5% of width, all four sides),
 * then the loud ground filling the inside, then a Press-Black keyline ringing the
 * ground (~2% of width). Two loud grounds NEVER touch — the cream border guarantees it.
 */
export function paintFrame(
  ctx: CanvasRenderingContext2D,
  full: Rect,
  ground: RGB,
  paperBorder: RGB = INK.newsprint,
): FrameResult {
  const border = Math.max(2, Math.round(full.w * GRID.border));
  const keyline = Math.max(2, Math.round(full.w * GRID.keyline));

  // cream border = the whole surface painted paper first
  ctx.fillStyle = rgb(paperBorder);
  ctx.fillRect(full.x, full.y, full.w, full.h);

  // the loud ground sits inside the border
  const gx = full.x + border;
  const gy = full.y + border;
  const gw = full.w - border * 2;
  const gh = full.h - border * 2;
  ctx.fillStyle = rgb(ground);
  ctx.fillRect(gx, gy, gw, gh);

  // Press-Black keyline ringing the ground (drawn as a stroked rect on the seam)
  ctx.strokeStyle = rgb(INK.pressBlack);
  ctx.lineWidth = keyline;
  ctx.strokeRect(gx + keyline / 2, gy + keyline / 2, gw - keyline, gh - keyline);

  const inner: Rect = {
    x: gx + keyline,
    y: gy + keyline,
    w: gw - keyline * 2,
    h: gh - keyline * 2,
  };
  return { ground: { x: gx, y: gy, w: gw, h: gh }, inner, border, keyline };
}

/** A keyline-boxed cell: cream fill (or given fill) + Press-Black stroke. */
export function keyBox(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  fill: RGB,
  strokeW: number,
  stroke: RGB = INK.pressBlack,
): void {
  ctx.fillStyle = rgb(fill);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = rgb(stroke);
  ctx.lineWidth = strokeW;
  ctx.strokeRect(r.x + strokeW / 2, r.y + strokeW / 2, r.w - strokeW, r.h - strokeW);
}

/* =========================================================================
 * PAPER TOOTH — a faint even speckle over a ground (§5 offset grain).
 * A whisper of "printed on paper", never distress. Multiply-blended.
 * ===================================================================== */

let grainTile: HTMLCanvasElement | null = null;

function bakeGrain(size = 160, seed = 7): HTMLCanvasElement {
  const rnd = mulberry32(seed);
  const c = makeCanvas(size, size);
  const g = ctxOf(c);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = rnd();
    const idx = i * 4;
    const grey = 200 + Math.round(v * 55);
    const speck = v < 0.13 ? Math.round(((0.13 - v) / 0.13) * 80) : 0;
    img.data[idx] = grey;
    img.data[idx + 1] = grey;
    img.data[idx + 2] = grey;
    img.data[idx + 3] = speck;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Deposit the paper tooth over a rect (multiply, low alpha). Clean press, not aging. */
export function paperTooth(ctx: CanvasRenderingContext2D, r: Rect, alpha: number = HALFTONE.grain): void {
  if (!grainTile) grainTile = bakeGrain();
  const prev = ctx.globalCompositeOperation;
  const prevA = ctx.globalAlpha;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = alpha;
  const tile = grainTile;
  for (let yy = r.y; yy < r.y + r.h; yy += tile.height) {
    for (let xx = r.x; xx < r.x + r.w; xx += tile.width) {
      ctx.drawImage(tile, xx, yy);
    }
  }
  ctx.restore();
  ctx.globalCompositeOperation = prev;
  ctx.globalAlpha = prevA;
}

/* =========================================================================
 * HALFTONE FILL — a benday dot field at a coverage level, clipped to a path.
 * Coverage 0..1 = density (a leading team crowds dots). Dots are FULL-INK,
 * never faded (§5). One ink. Coarse enough to read as dots.
 * ===================================================================== */

export interface HalftoneOpts {
  cell?: number;
  angleDeg?: number;
  /** dot radius fraction of cell at full coverage */
  dotMax?: number;
  seed?: number;
}

/**
 * Fill the current clip region with a halftone dot field of the given ink.
 * `coverageFn(px,py)` → 0..1 controls per-cell dot placement probability + size,
 * so callers can drive a skyline, a territory, or a flat panel through one path.
 */
export function halftoneField(
  ctx: CanvasRenderingContext2D,
  bounds: Rect,
  ink: RGB,
  coverageFn: (px: number, py: number) => number,
  opts: HalftoneOpts = {},
): void {
  const cell = opts.cell ?? HALFTONE.cell;
  const dotMax = opts.dotMax ?? HALFTONE.dotMax;
  const ang = ((opts.angleDeg ?? HALFTONE.angleDeg) * Math.PI) / 180;
  const rnd = mulberry32(opts.seed ?? 1337);
  ctx.fillStyle = rgb(ink);
  const cos = Math.cos(ang);
  const sin = Math.sin(ang);
  // iterate an axis-aligned grid, then rotate each dot center around bounds center
  const cx = bounds.x + bounds.w / 2;
  const cy = bounds.y + bounds.h / 2;
  const diag = Math.hypot(bounds.w, bounds.h);
  const cols = Math.ceil(diag / cell) + 2;
  const rows = Math.ceil(diag / cell) + 2;
  for (let gy = -rows; gy <= rows; gy++) {
    for (let gx = -cols; gx <= cols; gx++) {
      const lx = gx * cell + (gy % 2 ? cell * 0.5 : 0);
      const ly = gy * cell;
      // rotate into place
      const px = cx + lx * cos - ly * sin;
      const py = cy + lx * sin + ly * cos;
      if (px < bounds.x - cell || px > bounds.x + bounds.w + cell) continue;
      if (py < bounds.y - cell || py > bounds.y + bounds.h + cell) continue;
      const cov = coverageFn(px, py);
      if (cov <= 0) continue;
      // placement probability + size both track coverage (dropped = absent, kept = full ink)
      if (rnd() > cov) continue;
      const r = cell * dotMax * Math.sqrt(Math.min(1, cov));
      if (r < 0.4) continue;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* =========================================================================
 * EQUALIZER SKYLINE — the card's data-portrait (§6.3): vertical halftone bars
 * rising from the fan's goal-end, each bar a data reading (myRoar bucket).
 * Figurative WITHOUT a face. Fades to specks at the tips via per-column coverage.
 * ===================================================================== */

export interface SkylineOpts {
  /** normalized bar heights 0..1, left→right */
  values: number[];
  ink: RGB;
  /** gap between bars as a fraction of bar width */
  gap?: number;
  seed?: number;
  /** true = bars grow UP from the bottom of `area`; false = grow DOWN from top */
  fromBottom?: boolean;
  /** dot cell size in px — pass a print-scaled value (~1% of surface width) */
  cell?: number;
}

/**
 * Draw the roar-bars skyline into `area`. Each bar is a STRAIGHT halftone column
 * (dot columns aligned, not staggered — the canon equalizer): solid-dense at its
 * base (the goal-end), thinning to scattered specks at its tip — the honest fray
 * applied vertically. The tallest bars = the fan's loudest minutes.
 */
export function skyline(ctx: CanvasRenderingContext2D, area: Rect, o: SkylineOpts): void {
  const n = Math.max(1, o.values.length);
  const gap = o.gap ?? COMPONENTS.skyline.gap;
  const barW = area.w / (n + (n - 1) * gap);
  const step = barW * (1 + gap);
  const cell = o.cell ?? HALFTONE.cell;
  const rnd = mulberry32(o.seed ?? 4242);
  ctx.fillStyle = rgb(o.ink);
  for (let i = 0; i < n; i++) {
    const v = Math.max(0, Math.min(1, o.values[i] ?? 0));
    if (v <= 0.001) continue;
    const bx = area.x + i * step;
    const barH = v * area.h;
    const baseY = o.fromBottom ? area.y + area.h : area.y;
    // straight dot columns centered inside the bar (canon bars are neat verticals)
    const cols = Math.max(1, Math.floor(barW / cell));
    const x0 = bx + (barW - cols * cell) / 2 + cell / 2;
    const nCells = Math.max(1, Math.round(barH / cell));
    for (let cyi = 0; cyi < nCells; cyi++) {
      const along = cyi / Math.max(1, nCells - 1); // 0 at base, 1 at tip
      const py = o.fromBottom ? baseY - cell / 2 - cyi * cell : baseY + cell / 2 + cyi * cell;
      // coverage: full to ~55% of the bar, then fray to floor at the tip (dots THIN then SHRINK)
      const cov =
        along <= 0.55
          ? 1
          : FRAY.frayFloor + (1 - FRAY.frayFloor) * (1 - Math.pow((along - 0.55) / 0.45, FRAY.frayCurve));
      for (let cxi = 0; cxi < cols; cxi++) {
        const px = x0 + cxi * cell;
        if (rnd() > cov) continue;
        const rr = cell * HALFTONE.dotMax * (0.62 + 0.38 * Math.sqrt(cov));
        if (rr < 0.4) continue;
        ctx.beginPath();
        ctx.arc(px, py, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/* =========================================================================
 * POP-BALL — the house mark (§6.10): a FIVE-segment Wyman pinwheel on a disc,
 * two colours + black. NEVER a hexagon soccer ball.
 * ===================================================================== */

export function popBall(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  colA: RGB,
  colB: RGB,
  spin = 0,
): void {
  const segs = COMPONENTS.popBall.segments; // 5
  const ring = radius * COMPONENTS.popBall.ring;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(spin);
  // the five pinwheel blades — each a curved wedge, alternating the two inks
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2 - Math.PI / 2;
    const mid = (a0 + a1) / 2;
    ctx.fillStyle = rgb(i % 2 === 0 ? colA : colB);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // a swept blade with a pinwheel curl (control point pushed tangentially)
    const rr = radius - ring;
    const curl = 0.55;
    const cxp = Math.cos(mid - curl) * rr;
    const cyp = Math.sin(mid - curl) * rr;
    ctx.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
    ctx.quadraticCurveTo(cxp, cyp, Math.cos(a1) * rr, Math.sin(a1) * rr);
    ctx.closePath();
    ctx.fill();
  }
  // Press-Black disc keyline
  ctx.strokeStyle = rgb(INK.pressBlack);
  ctx.lineWidth = ring;
  ctx.beginPath();
  ctx.arc(0, 0, radius - ring / 2, 0, Math.PI * 2);
  ctx.stroke();
  // a small black hub
  ctx.fillStyle = rgb(INK.pressBlack);
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* =========================================================================
 * STARBURST PIN — the goal eruption glyph (§6.8): a drawn Press-Black spike
 * star with the minute in Doto at its core. Pins a goal at its position.
 * ===================================================================== */

export function starburstPin(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  minuteLabel: string,
  fill: RGB = INK.pressBlack,
  textInk: RGB = INK.newsprint,
): void {
  const spikes = 12;
  const inner = radius * 0.62;
  ctx.save();
  ctx.fillStyle = rgb(fill);
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? radius : inner;
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  // the minute, Doto, centered
  ctx.fillStyle = rgb(textInk);
  ctx.font = fontData(inner * 0.9, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(minuteLabel, cx, cy + inner * 0.04);
  ctx.restore();
}

/* =========================================================================
 * ROAR RING GLYPH — off-center concentric rings (§6.6): a printed sound.
 * The off-center source dot is the signature. Crisp discrete rings, no glow.
 * ===================================================================== */

export function roarRings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  ink: RGB = INK.pressBlack,
  rings: number = COMPONENTS.roarMeter.rings,
): void {
  const offset = radius * COMPONENTS.roarMeter.sourceOffset;
  const w = Math.max(1.5, radius * COMPONENTS.roarMeter.ringWeight);
  ctx.save();
  ctx.strokeStyle = rgb(ink);
  ctx.lineWidth = w;
  for (let i = rings; i >= 1; i--) {
    const r = (i / rings) * radius;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // the off-center source dot
  ctx.fillStyle = rgb(ink);
  ctx.beginPath();
  ctx.arc(cx + offset, cy + offset, Math.max(2, radius * 0.12), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* =========================================================================
 * PITCH MARKINGS — chalk lines drawn as thin strokes (penalty boxes, centre
 * circle, goals). Used on the card portrait + the poster pitch.
 * ===================================================================== */

export function pitchMarkings(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  ink: RGB,
  weight: number,
): void {
  ctx.save();
  ctx.strokeStyle = rgb(ink);
  ctx.lineWidth = weight;
  ctx.lineCap = 'square';
  // outer touchline
  ctx.strokeRect(r.x + weight / 2, r.y + weight / 2, r.w - weight, r.h - weight);
  // halfway line
  const midY = r.y + r.h / 2;
  ctx.beginPath();
  ctx.moveTo(r.x, midY);
  ctx.lineTo(r.x + r.w, midY);
  ctx.stroke();
  // centre circle
  ctx.beginPath();
  ctx.arc(r.x + r.w / 2, midY, r.w * 0.14, 0, Math.PI * 2);
  ctx.stroke();
  // centre spot
  ctx.beginPath();
  ctx.arc(r.x + r.w / 2, midY, weight * 1.1, 0, Math.PI * 2);
  ctx.fillStyle = rgb(ink);
  ctx.fill();
  // penalty boxes top & bottom
  const boxW = r.w * 0.44;
  const boxH = r.h * 0.16;
  const sixW = r.w * 0.22;
  const sixH = r.h * 0.07;
  const goalW = r.w * 0.18;
  const goalH = r.h * 0.02;
  for (const top of [true, false]) {
    const bx = r.x + (r.w - boxW) / 2;
    const by = top ? r.y : r.y + r.h - boxH;
    ctx.strokeRect(bx, by, boxW, boxH);
    const sx = r.x + (r.w - sixW) / 2;
    const sy = top ? r.y : r.y + r.h - sixH;
    ctx.strokeRect(sx, sy, sixW, sixH);
    // goal mouth (a hatched block on the line)
    const gx = r.x + (r.w - goalW) / 2;
    const gy = top ? r.y - goalH : r.y + r.h;
    ctx.strokeRect(gx, gy, goalW, goalH);
    // penalty spot
    ctx.beginPath();
    ctx.arc(r.x + r.w / 2, top ? r.y + boxH * 0.62 : r.y + r.h - boxH * 0.62, weight, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** A small hatched goal-net block (dot-matrix look) centered on x. */
export function goalNet(ctx: CanvasRenderingContext2D, cx: number, y: number, w: number, h: number, ink: RGB): void {
  ctx.save();
  ctx.fillStyle = rgb(ink);
  const x0 = cx - w / 2;
  const cols = 8;
  const rows = 4;
  const cw = w / cols;
  const ch = h / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if ((i + j) % 2 === 0) ctx.fillRect(x0 + i * cw, y + j * ch, cw * 0.9, ch * 0.9);
    }
  }
  ctx.restore();
}
