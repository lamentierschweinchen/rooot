/**
 * ROOOT stage — FLAG BLOCKS (§2 flagBlock slot, §6.9). A team's flag drawn as a
 * simplified geometric keyline-boxed color BLOCK — never an emoji at final quality,
 * never a crest (banned). We draw real national tricolor/cross geometry for the teams
 * the demo + likely fixtures use, keyed by the unicode flag glyph OR the tricode; any
 * unknown flag falls back to the team's own [primary, secondary] color-pair block.
 *
 * Colors here are the FLAG's real inks (national colors), resolved locally — these are
 * NOT design-system louds; a flag is honest identity data, drawn once, flat. The block
 * always wears a Press-Black (or cream, on a dark band) keyline so it reads as a printed
 * patch on the scoreboard / belief end.
 */

import { INK } from '../pop';
import type { PopTheme } from '../pop';
import { rgba, hexToRgb } from '../../lib/stage-math';
import type { RGBTuple } from '../../lib/stage-math';

type Painter = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;

const C = (hex: string): RGBTuple => hexToRgb(hex);

/** vertical tricolor helper (left→right bands). */
function vtri(a: string, b: string, c: string): Painter {
  const ca = C(a), cb = C(b), cc = C(c);
  return (ctx, x, y, w, h) => {
    ctx.fillStyle = rgba(ca, 1); ctx.fillRect(x, y, w / 3, h);
    ctx.fillStyle = rgba(cb, 1); ctx.fillRect(x + w / 3, y, w / 3, h);
    ctx.fillStyle = rgba(cc, 1); ctx.fillRect(x + (2 * w) / 3, y, w / 3, h);
  };
}
/** horizontal tricolor helper (top→bottom bands). */
function htri(a: string, b: string, c: string): Painter {
  const ca = C(a), cb = C(b), cc = C(c);
  return (ctx, x, y, w, h) => {
    ctx.fillStyle = rgba(ca, 1); ctx.fillRect(x, y, w, h / 3);
    ctx.fillStyle = rgba(cb, 1); ctx.fillRect(x, y + h / 3, w, h / 3);
    ctx.fillStyle = rgba(cc, 1); ctx.fillRect(x, y + (2 * h) / 3, w, h / 3);
  };
}
/** St George / cross flag (field + cross). */
function cross(field: string, bar: string): Painter {
  const cf = C(field), cb = C(bar);
  return (ctx, x, y, w, h) => {
    ctx.fillStyle = rgba(cf, 1); ctx.fillRect(x, y, w, h);
    const tw = Math.max(2, w * 0.16);
    ctx.fillStyle = rgba(cb, 1);
    ctx.fillRect(x + w / 2 - tw / 2, y, tw, h);
    ctx.fillRect(x, y + h / 2 - tw / 2, w, tw);
  };
}

/** the known geometric flags, keyed by unicode flag glyph. */
const FLAGS: Record<string, Painter> = {
  '🇲🇽': vtri('#006847', '#F3ECDA', '#CE1126'), // Mexico (green/white/red) — cream for white
  '🇦🇷': (ctx, x, y, w, h) => {
    // Argentina: light-blue / white / light-blue horizontal
    const lb = C('#74ACDF');
    ctx.fillStyle = rgba(lb, 1); ctx.fillRect(x, y, w, h / 3);
    ctx.fillStyle = rgba(INK.newsprint, 1); ctx.fillRect(x, y + h / 3, w, h / 3);
    ctx.fillStyle = rgba(lb, 1); ctx.fillRect(x, y + (2 * h) / 3, w, h / 3);
    ctx.fillStyle = rgba(C('#F6B40E'), 1);
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h * 0.13, 0, Math.PI * 2); ctx.fill();
  },
  '🇪🇳': cross('#F3ECDA', '#CE1126'), // (fallback key)
  '🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}': cross('#F3ECDA', '#CE1126'), // England St George
  '🇬🇧': cross('#F3ECDA', '#CE1126'),
  '🇫🇷': vtri('#0055A4', '#F3ECDA', '#EF4135'), // France
  '🇧🇷': (ctx, x, y, w, h) => {
    ctx.fillStyle = rgba(C('#009C3B'), 1); ctx.fillRect(x, y, w, h);
    ctx.fillStyle = rgba(C('#FFDF00'), 1);
    ctx.beginPath();
    ctx.moveTo(x + w / 2, y + h * 0.14);
    ctx.lineTo(x + w * 0.86, y + h / 2);
    ctx.lineTo(x + w / 2, y + h * 0.86);
    ctx.lineTo(x + w * 0.14, y + h / 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba(C('#002776'), 1);
    ctx.beginPath(); ctx.arc(x + w / 2, y + h / 2, h * 0.16, 0, Math.PI * 2); ctx.fill();
  },
  '🇩🇪': htri('#000000', '#DD0000', '#FFCE00'), // Germany
  '🇮🇹': vtri('#009246', '#F3ECDA', '#CE2B37'), // Italy
  '🇪🇸': (ctx, x, y, w, h) => {
    // Spain: red / yellow(2x) / red
    ctx.fillStyle = rgba(C('#AA151B'), 1); ctx.fillRect(x, y, w, h * 0.25);
    ctx.fillStyle = rgba(C('#F1BF00'), 1); ctx.fillRect(x, y + h * 0.25, w, h * 0.5);
    ctx.fillStyle = rgba(C('#AA151B'), 1); ctx.fillRect(x, y + h * 0.75, w, h * 0.25);
  },
  '🇳🇬': (ctx, x, y, w, h) => { // Nigeria green/white/green (appears in one reference)
    ctx.fillStyle = rgba(C('#008751'), 1); ctx.fillRect(x, y, w / 3, h);
    ctx.fillStyle = rgba(INK.newsprint, 1); ctx.fillRect(x + w / 3, y, w / 3, h);
    ctx.fillStyle = rgba(C('#008751'), 1); ctx.fillRect(x + (2 * w) / 3, y, w / 3, h);
  },
};

/**
 * Draw a flag block. Prefers a known geometric flag by glyph; else a two-band block from
 * the team's own color-pair (honest identity, still flat + keylined). `onDark` picks the
 * keyline color (cream on the Press-Black band, Press-Black on paper).
 */
export function drawFlagBlock(
  ctx: CanvasRenderingContext2D,
  glyph: string,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: PopTheme,
  onDark = true,
): void {
  ctx.save();
  // clip to the block so flag geometry never spills the keyline
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const painter = FLAGS[glyph];
  if (painter) {
    painter(ctx, x, y, w, h);
  } else {
    // fallback: team color-pair as two vertical blocks
    ctx.fillStyle = rgba(theme.primary, 1);
    ctx.fillRect(x, y, w * 0.5, h);
    ctx.fillStyle = rgba(theme.secondary, 1);
    ctx.fillRect(x + w * 0.5, y, w * 0.5, h);
  }
  ctx.restore();
  // keyline
  ctx.save();
  ctx.strokeStyle = rgba(onDark ? INK.newsprint : INK.pressBlack, 0.9);
  ctx.lineWidth = Math.max(1, w * 0.04);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

/** small square flag-patch (for the crowd bunting rows / rail cells). */
export function drawFlagPatch(
  ctx: CanvasRenderingContext2D,
  glyph: string,
  x: number,
  y: number,
  s: number,
  theme: PopTheme,
  onDark = true,
): void {
  drawFlagBlock(ctx, glyph, x, y, s, s * 0.72, theme, onDark);
}
