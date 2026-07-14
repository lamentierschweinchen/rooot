/**
 * ROOOT app — drawn glyphs for the DOM shell (inline SVG strings).
 *
 * The shell's small marks are DRAWN, never emoji, never unicode-fallback
 * characters that drop out of the type voice (SYSTEM §8, POP-LANGUAGE §G).
 * Everything here is flat spot ink from theme tokens: the pop-ball house mark
 * (§6.10 — five-segment pinwheel, two louds + press black), the stepped swing
 * arrow, the fold caret, and the flag-BLOCK (team identity as drawn colour
 * panels — the legal slots, never an accurate flag, never an emoji).
 */

import { COLORS, STEPS } from '../lib/theme';

/** svg attrs shared by the inline marks — sized in ems so they ride the type. */
function open(vb: string, sizeEm: number, cls: string): string {
  return `<svg class="${cls}" viewBox="${vb}" width="${sizeEm}em" height="${sizeEm}em" aria-hidden="true" focusable="false">`;
}

/**
 * The pop-ball (§6.10): a five-segment pinwheel disc — poppy + azteca sun
 * segments, press-black spokes + ring, on a newsprint disc. `spinSteps` exposes
 * the hard step count so CSS can rotate it in STEPS.popBall increments.
 */
export function popBall(sizeEm = 1, cls = 'rt-popball'): string {
  const c = 50;
  const r = 44;
  const segs = 5;
  const segColors = [COLORS.poppy, COLORS.aztecaSun, COLORS.poppy, COLORS.aztecaSun, COLORS.poppy];
  let wedges = '';
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2 - Math.PI / 2;
    const x0 = c + r * Math.cos(a0);
    const y0 = c + r * Math.sin(a0);
    const x1 = c + r * Math.cos(a1);
    const y1 = c + r * Math.sin(a1);
    wedges += `<path d="M${c} ${c} L${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z" fill="${segColors[i]}"/>`;
    wedges += `<line x1="${c}" y1="${c}" x2="${x0.toFixed(1)}" y2="${y0.toFixed(1)}" stroke="${COLORS.pressBlack}" stroke-width="5"/>`;
  }
  return (
    open('0 0 100 100', sizeEm, cls) +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="${COLORS.newsprint}"/>` +
    wedges +
    `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${COLORS.pressBlack}" stroke-width="7"/>` +
    `<circle cx="${c}" cy="${c}" r="7" fill="${COLORS.pressBlack}"/>` +
    `</svg>`
  );
}

/** hard step count for the pop-ball spin (SYSTEM §7) — CSS consumes via var. */
export const POP_BALL_STEPS = STEPS.popBall;

/**
 * The stepped swing arrow — two hard segments (a stair), drawn, riding the
 * Doto baseline. `dir` up = the reading rose, down = it fell. currentColor.
 */
export function stepArrow(dir: 'up' | 'down', sizeEm = 0.72): string {
  const d =
    dir === 'up'
      ? 'M6 40 L20 40 L20 24 L34 24 L34 8' // stair climbing right-up
      : 'M6 8 L20 8 L20 24 L34 24 L34 40'; // stair falling right-down
  const head = dir === 'up' ? 'M26 8 L34 8 L34 16' : 'M26 40 L34 40 L34 32';
  return (
    open('0 0 40 48', sizeEm, 'rt-steparrow') +
    `<path d="${d}" fill="none" stroke="currentColor" stroke-width="7"/>` +
    `<path d="${head}" fill="none" stroke="currentColor" stroke-width="7"/>` +
    `</svg>`
  );
}

/** the fold caret — a drawn solid triangle (never a text ▸ that falls out of Doto). */
export function foldCaret(sizeEm = 0.6): string {
  return (
    open('0 0 32 32', sizeEm, 'rt-caret') + `<path d="M8 4 L26 16 L8 28 Z" fill="currentColor"/>` + `</svg>`
  );
}

/** the jump-to-newest mark for the unread chip — a stepped up-stair into a bar. */
export function newestMark(sizeEm = 0.7): string {
  return (
    open('0 0 32 32', sizeEm, 'rt-newest') +
    `<rect x="4" y="4" width="24" height="5" fill="currentColor"/>` +
    `<path d="M16 28 L16 14 M9 20 L16 13 L23 20" fill="none" stroke="currentColor" stroke-width="5"/>` +
    `</svg>`
  );
}

/**
 * The flag-BLOCK: team identity as two drawn colour panels in a keyline box
 * (POP-LANGUAGE §B.8 — blocks and colour-pairs, never a crest, never an emoji).
 * Vertical split reads "flag" at every size; the keyline is part of the mark.
 */
export function flagBlock(colors: readonly [string, string], cls = 'rt-flagblock'): string {
  return (
    `<span class="${cls}" aria-hidden="true">` +
    `<i style="background:${colors[0]}"></i>` +
    `<i style="background:${colors[1]}"></i>` +
    `</span>`
  );
}
