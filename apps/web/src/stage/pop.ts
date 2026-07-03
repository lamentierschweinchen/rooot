/**
 * ROOOT stage — POP-PRINT foundation (NEW; owned by the stage lane).
 *
 * The night-fog world is gone. This file is the stage's bridge to the LOCKED design
 * system: it pulls the flat-ink tokens from `../lib/theme.ts` (READ-ONLY — never
 * re-derive a hex here) and resolves them into the rgb tuples + tiny helpers the
 * rendering layers need. Where SYSTEM.md is the law, this file is just its typed hand.
 *
 * Two jobs beyond token resolution:
 *  1. GROUND SELECTION per fixture (§1 Topps rule): pick a loud ground NEITHER team
 *     owns; fall back to terraceGrey; never hand out fizzPink (accent-only).
 *  2. WEBFONT LOADING (§4): Anybody / Doto / Young Serif / Silkscreen must be loaded
 *     via document.fonts before the first paint of canvas type, or the dot-matrix
 *     numbers fall back to mono. We kick the loads on construct and expose a ready flag.
 */

import { NEUTRALS, LOUD, LOUD_ROTATION, ACCENTS, FONT_URLS } from '../lib/theme';
import { hexToRgb } from '../lib/stage-math';
import type { RGBTuple } from '../lib/stage-math';

/* ── palette as rgb (resolved once; the law's hexes, never re-typed) ─────── */

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

/** hex strings kept alongside for the rare CSS-string need (DOM harness, not canvas). */
export const HEX = { ...NEUTRALS, ...LOUD, fizzPink: ACCENTS.eruption } as const;

const LOUD_RGB: RGBTuple[] = LOUD_ROTATION.map(hexToRgb);

/* ── ground selection (§1) ───────────────────────────────────────────────── */

/** squared distance in rgb — cheap "do these two inks clash / read as the same". */
function dist2(a: RGBTuple, b: RGBTuple): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * Pick the loud ground for a fixture: the first rotation loud (leads-first: Poppy,
 * Sky, …) that neither team's territory color sits close to. If everything clashes,
 * fall back to terraceGrey (§1.2). fizzPink is never in the rotation, so it can never
 * be returned — the accent-only law holds by construction.
 */
export function chooseGround(homeTeam: RGBTuple, awayTeam: RGBTuple): RGBTuple {
  const CLASH = 70 * 70 * 3; // within ~70/channel of a team ink → too close, skip it
  for (const g of LOUD_RGB) {
    if (dist2(g, homeTeam) > CLASH && dist2(g, awayTeam) > CLASH) return g;
  }
  return INK.terraceGrey;
}

/** Type on a loud ground is black / white / contrasting-loud — pick by luminance (§1 legibility gate). */
export function inkOn(ground: RGBTuple): RGBTuple {
  const lum = 0.299 * ground[0] + 0.587 * ground[1] + 0.114 * ground[2];
  return lum > 150 ? INK.pressBlack : INK.newsprint;
}

/** Relative luminance 0..255 (for the legibility gate + score-band contrast). */
export function luma(c: RGBTuple): number {
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}

/* ── a fixture's resolved pop palette ────────────────────────────────────── */

export interface PopTheme {
  /** team primary as an ink (territory / flag-block / score-chip / crowd) */
  primary: RGBTuple;
  secondary: RGBTuple;
}

export function resolvePop(colors: readonly [string, string]): PopTheme {
  return { primary: hexToRgb(colors[0]), secondary: hexToRgb(colors[1]) };
}

/* ── webfont loading (§4) ────────────────────────────────────────────────── */

/**
 * The four voices as canvas font-family names. We DON'T ship the stacks here — the
 * canvas needs the exact family name once the FontFace resolves; the fallback family
 * is baked into each helper below so type never disappears mid-load.
 */
export const FONT = {
  /** scream / display / tricodes / GOOOL — the wdth axis is the stretch */
  display: 'Anybody',
  /** ALL numbers — score, clock, %, counts, serials */
  data: 'Doto',
  /** programme / caption editorial — OFF loud grounds */
  serif: 'Young Serif',
  /** relic knit (unused on the stage but resolved for completeness) */
  knit: 'Silkscreen',
} as const;

let fontsReady = false;
let kicked = false;

/**
 * Load the webfonts once. Uses the stylesheet <link> route (so the variable axes match
 * type-lab exactly) AND document.fonts.load() so we can await actual glyph availability
 * before the first type paint. Safe to call many times; resolves fontsReady when done.
 */
export function ensureFonts(): Promise<void> {
  if (fontsReady) return Promise.resolve();
  if (typeof document === 'undefined') return Promise.resolve();
  if (!kicked) {
    kicked = true;
    // inject the exact Google Fonts stylesheets (variable axes verbatim from theme.ts)
    for (const url of [FONT_URLS.anybody, FONT_URLS.doto, FONT_URLS.youngSerif, FONT_URLS.silkscreen]) {
      if (document.querySelector(`link[href="${url}"]`)) continue;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = url;
      document.head.appendChild(link);
    }
  }
  const f = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!f || typeof f.load !== 'function') {
    fontsReady = true;
    return Promise.resolve();
  }
  // load the weights/widths the stage actually paints so the first frame has real type
  const wants = [
    '900 32px "Anybody"',
    '800 24px "Anybody"',
    '700 18px "Anybody"',
    '400 32px "Doto"',
    '600 32px "Doto"',
    '700 24px "Doto"',
    '400 16px "Young Serif"',
  ];
  return Promise.all(wants.map((w) => f.load(w).catch(() => undefined)))
    .then(() => {
      fontsReady = true;
    })
    .catch(() => {
      fontsReady = true;
    });
}

export function areFontsReady(): boolean {
  return fontsReady;
}

/** Canvas font shorthand builders with period-honest fallbacks (used before + after load). */
export function fontData(px: number, weight = 400): string {
  return `${weight} ${Math.max(1, Math.round(px))}px "Doto", ui-monospace, monospace`;
}
export function fontDisplay(px: number, weight = 800, width = 100): string {
  // Anybody is a variable-width face; canvas can't set font-stretch axis directly via
  // shorthand reliably, so we lean on weight + the family and let letterSpacing carry the
  // Topps punch. `width` is accepted for callers that set ctx.fontStretch when supported.
  return `${weight} ${Math.max(1, Math.round(px))}px "Anybody", system-ui, sans-serif`;
}
export function fontSerif(px: number, weight = 400): string {
  return `${weight} ${Math.max(1, Math.round(px))}px "Young Serif", Georgia, serif`;
}

/** Apply the Anybody wdth axis when the platform supports fontStretch (progressive). */
export function setStretch(ctx: CanvasRenderingContext2D, widthPct: number): void {
  try {
    // fontStretch percentages are valid CSS but the DOM lib types it as a keyword enum;
    // assign through an index so a supporting engine gets the wdth axis, others ignore it.
    (ctx as unknown as Record<string, unknown>)['fontStretch'] = `${widthPct}%`;
  } catch {
    /* older engines ignore this; weight + tracking still read as pop display */
  }
}
