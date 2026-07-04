/**
 * ROOOT stage — FLAG BLOCKS (§2 flagBlock slot, §6.9), now a THIN ADAPTER over the unified
 * `flagBlock` primitive in lib/ink.ts (PRINT-SOUL bonus: one drawn-flag implementation for
 * the whole app — the stage AND the relics AND, later, the app shell — so the emoji flags in
 * the interstitial/scoreband can be replaced by the SAME drawn block). The flag table, the
 * cross/tricolor geometry, and the keyline all live in ink.ts now; this file only maps the
 * stage's call shape (glyph + PopTheme + onDark) onto it.
 *
 * A flag is honest identity data (real national inks), drawn flat + keylined — NOT a
 * design-system loud, NEVER an emoji at final quality, NEVER a crest (banned). Unknown flag
 * → the team's own [primary, secondary] two-band block.
 */

import { INK } from '../pop';
import type { PopTheme } from '../pop';
import { flagBlock as inkFlagBlock } from '../../lib/ink';

/**
 * Draw a flag block (§2 flagBlock slot). Prefers a known geometric flag by glyph; else a
 * two-band block from the team's own color-pair. `onDark` picks the keyline color (cream on
 * the Press-Black band, Press-Black on paper). Delegates to lib/ink.ts `flagBlock` — the
 * keyline is a PANEL-weight pressed rule there, so a flag reads as a printed patch.
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
  inkFlagBlock(
    ctx,
    glyph,
    x,
    y,
    w,
    h,
    [theme.primary, theme.secondary],
    onDark ? INK.newsprint : INK.pressBlack,
    'panel',
    w,
  );
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
