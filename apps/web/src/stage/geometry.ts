/**
 * ROOOT stage — portrait geometry tokens (fractions of the letterboxed stage rect).
 *
 * y=0 is the top (their goal), y=1 the bottom (your goal). The playable pitch is inset
 * from the stage rect so the pictogram crowd ENDS live in the margins top & bottom, and
 * the % / ROAR rail lives in the right margin (the pitch itself stays honest, edge to edge).
 * These are the ONLY numbers layout.ts needs — the pop palette lives in ./pop.ts.
 */

export const GEO = {
  /** portrait aspect the stage composes to; desktop letterboxes this. Phone-tall. */
  aspect: 9 / 16,
  /**
   * pitch top inset — the scoreboard band (border 5% + height 11% ≈ 16%) sits here, and
   * the away crowd end lives BELOW it, above the away goal line. Kept clear of the band so
   * the away ROOTED counter never collides with the scoreboard status (KICK OFF SOON).
   */
  endBandTop: 0.2,
  /** pitch bottom inset — the home crowd end + the caption strip occupy this margin */
  endBandBottom: 0.18,
  /** left side margin (touchline breathing room + the cream border) */
  sideMargin: 0.055,
  /** right side margin is wider — it carries the % / ROAR rail */
  railMargin: 0.2,
  /** goal-mouth width as a fraction of pitch width */
  goalWidth: 0.34,
} as const;
