/**
 * ROOOT stage — palette + geometry tokens, pinned to design/REFERENCES.md.
 *
 * The world is charcoal / chalk / fog (near-monochrome). ONE accent per moment:
 *   · team color only in the ends' smoke + a whisper of tint in each side's light
 *   · fire owns goals · cyan owns the tunnel/entry · (gold owns relics — not here)
 *
 * These are NOT "dark-mode UI" values. The dark is atmospheric (floodlight-and-fog.jpg):
 * charcoal with a cold blue undertone, never #000 paint.
 */

import { hexToRgb } from '../lib/stage-math';

export const PALETTE = {
  /** The void behind everything — charcoal with a cold cast, top of floodlight-and-fog.jpg */
  voidTop: '#070A0C',
  voidBottom: '#0A0E10',
  /** grass barely-there under floodlight — green-black, only breathes green in the light pool */
  grassDark: '#0C120E',
  grassLit: '#1C3A22',
  grassGlow: '#3E7C48',
  /** chalk — the halfway line, scoreboard type, counters. Warm off-white, never pure #fff. */
  chalk: '#E9E4D6',
  chalkDim: '#9FA096',
  chalkFaint: '#5C625B',
  /** the light itself — floodlight white, faintly warm at the source, cool in the shaft */
  lightCore: '#F4F1E8',
  lightShaft: '#C9D3D6',
  /** the fog bank = the draw. Cool grey haze (floodlight-and-fog.jpg fog body). */
  fog: '#8A939A',
  fogDeep: '#5A636B',
  /** fire — the goal eruption (halftime-show.jpg): white-hot core → orange → smoke */
  fireCore: '#FFF3D0',
  fireMid: '#FF9B3D',
  fireDeep: '#C2410C',
  /** cyan — tunnel / backstage / "connecting" only (stadium-tunnel.jpg) */
  cyan: '#39C6D8',
} as const;

export const RGB = {
  voidTop: hexToRgb(PALETTE.voidTop),
  voidBottom: hexToRgb(PALETTE.voidBottom),
  grassDark: hexToRgb(PALETTE.grassDark),
  grassLit: hexToRgb(PALETTE.grassLit),
  grassGlow: hexToRgb(PALETTE.grassGlow),
  chalk: hexToRgb(PALETTE.chalk),
  chalkDim: hexToRgb(PALETTE.chalkDim),
  lightCore: hexToRgb(PALETTE.lightCore),
  lightShaft: hexToRgb(PALETTE.lightShaft),
  fog: hexToRgb(PALETTE.fog),
  fogDeep: hexToRgb(PALETTE.fogDeep),
  fireCore: hexToRgb(PALETTE.fireCore),
  fireMid: hexToRgb(PALETTE.fireMid),
  fireDeep: hexToRgb(PALETTE.fireDeep),
  cyan: hexToRgb(PALETTE.cyan),
} as const;

/**
 * Portrait stage geometry, in fractions of the *stage rect* (the letterboxed
 * portrait area). y=0 is the top (their goal), y=1 the bottom (your goal).
 *
 * The playable pitch is inset from the stage rect so the ends (crowd) live in the
 * margins top & bottom — market horizontal on the pitch, crowd vertical at the ends.
 */
export const GEO = {
  /** portrait aspect the stage composes to; desktop letterboxes this. */
  aspect: 9 / 16,
  /** pitch top/bottom insets (crowd ends occupy these bands) */
  endBandTop: 0.14,
  endBandBottom: 0.14,
  /** side margins (touchline breathing room) */
  sideMargin: 0.06,
  /** goal-mouth width as fraction of pitch width */
  goalWidth: 0.34,
} as const;

/** A team's two colors resolved to rgb, with a light-tint kept subtle (rule 2: monochrome + one accent). */
export interface SideTheme {
  primary: [number, number, number];
  secondary: [number, number, number];
  /** the faint warmth the side's floodlight carries — pulled far toward white */
  lightTint: [number, number, number];
}

export function resolveSide(colors: [string, string]): SideTheme {
  const primary = hexToRgb(colors[0]);
  const secondary = hexToRgb(colors[1]);
  // light tint = floodlight white with only a WHISPER (~10%) of the side's color, so the
  // shafts read as white light — not a colored wash. The accent lives in the crowd smoke.
  const w = RGB.lightCore;
  const lightTint: [number, number, number] = [
    Math.round(primary[0] * 0.1 + w[0] * 0.9),
    Math.round(primary[1] * 0.1 + w[1] * 0.9),
    Math.round(primary[2] * 0.1 + w[2] * 0.9),
  ];
  return { primary, secondary, lightTint };
}
