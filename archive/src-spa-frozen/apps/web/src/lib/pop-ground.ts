/**
 * ROOOT — GROUND SELECTION (§1 Topps rule), the shared law.
 *
 * One implementation for every surface that grounds a fixture in a loud —
 * the live stage AND the relic printers (card, poster). Lifted out of
 * stage/pop.ts the night the relic lane hardcoded poppy next to Egypt
 * crimson: a law that lives in one lane's file gets re-derived, and
 * re-derived laws drift. Tokens come from lib/theme (never re-typed).
 */

import { NEUTRALS, LOUD_ROTATION } from './theme';
import { hexToRgb } from './stage-math';
import type { RGBTuple } from './stage-math';

const LOUD_RGB: RGBTuple[] = LOUD_ROTATION.map(hexToRgb);
const TERRACE_GREY: RGBTuple = hexToRgb(NEUTRALS.terraceGrey);

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
  return TERRACE_GREY;
}
