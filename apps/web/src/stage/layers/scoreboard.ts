/**
 * ROOOT stage — THE SCOREBOARD BAND (§6.9). A Press-Black band across the top:
 * flags as keyline-boxed color-BLOCKS (drawn geometric flags, real colors from fixture
 * data — no emoji at final quality), TRICODES in Anybody (a name = shouted → display),
 * SCORE + CLOCK in Doto (measured data → dot voice). Status strip below (KICK OFF SOON,
 * CHEERS COUNT DOUBLE handled at the ends). Score/clock flip on change (§7 scoreFlip).
 *
 * Legibility gate (§1): on the Press-Black band, type is Newsprint cream; a leading
 * tricode may take a keyline-boxed team color-chip behind it (the scoreChip slot, §2).
 */

import { GRID, COMPONENTS } from '../../lib/theme';
import { INK, fontData, fontDisplay, setStretch, luma } from '../pop';
import type { StageRect, PitchRect } from '../layout';
import type { PopTheme } from '../pop';
import { rgba, clamp01 } from '../../lib/stage-math';
import type { RGBTuple } from '../../lib/stage-math';
import { drawFlagBlock } from './flags';
import { inkStrokeRect } from '../../lib/ink';

export interface ScoreboardInputs {
  homeCode: string;
  awayCode: string;
  homeFlag: string;
  awayFlag: string;
  homeScore: number;
  awayScore: number;
  minute: number | null;
  phaseLabel: string;
  homeTheme: PopTheme;
  awayTheme: PopTheme;
  /** 0..1 flip progress on the most recent score change (drives the dot-print snap) */
  flip: number;
}

function clockText(minute: number | null, phaseLabel: string): string {
  if (minute === null) return phaseLabel;
  return `${Math.max(0, Math.floor(minute))}'`;
}

export function drawScoreboard(
  ctx: CanvasRenderingContext2D,
  stage: StageRect,
  _pitch: PitchRect,
  s: ScoreboardInputs,
): void {
  const w = stage.w;
  const border = Math.max(2, Math.round(w * GRID.border));
  const bandH = Math.max(30, stage.h * COMPONENTS.scoreboard.height);
  const x = stage.x + border;
  const y = stage.y + border;
  const bw = stage.w - border * 2;

  ctx.save();
  // the Press-Black band + FRAME-weight keyline (PRINT-SOUL item 4 — the band is a top-tier
  // object; its keyline is the fat frame weight, a breathing pressed rule).
  ctx.fillStyle = rgba(INK.pressBlack, 1);
  ctx.fillRect(x, y, bw, bandH);
  inkStrokeRect(ctx, x, y, bw, bandH, w, 'frame', INK.pressBlack, 20);

  const cx = x + bw / 2;
  const midY = y + bandH * 0.44;
  const flagAsp = COMPONENTS.scoreboard.flagAspect; // 3:2
  const flagH = bandH * 0.44;
  const flagW = flagH * flagAsp;
  const pad = bandH * 0.22;

  // flags as keyline-boxed color blocks at each end
  drawFlagBlock(ctx, s.homeFlag, x + pad, midY - flagH / 2, flagW, flagH, s.homeTheme);
  drawFlagBlock(ctx, s.awayFlag, x + bw - pad - flagW, midY - flagH / 2, flagW, flagH, s.awayTheme);

  // SCORE — Doto dot-matrix, dead center, with a flip snap on change. Reserve its box
  // first so the tricodes can be pushed clear of it (no overlap on a narrow band).
  const scoreFs = Math.max(18, bandH * 0.52);
  ctx.font = fontData(scoreFs, 600);
  const scoreText = `${s.homeScore}-${s.awayScore}`;
  const scoreHalf = ctx.measureText(scoreText).width / 2;
  drawDotScore(ctx, scoreText, cx, midY, scoreFs, s.flip);

  // tricodes (Anybody, cream, tight tracking) — hug the flags, clamped to stay clear of
  // the score's box in the middle so glyphs never collide on a phone-narrow band.
  const codeFs = Math.max(12, bandH * 0.34);
  ctx.textBaseline = 'middle';
  ctx.font = fontDisplay(codeFs, 800);
  setStretch(ctx, 108);
  const codeLeftX = x + pad + flagW + bandH * 0.2;
  const codeRightX = x + bw - pad - flagW - bandH * 0.2;
  const scoreGuardL = cx - scoreHalf - bandH * 0.26;
  const scoreGuardR = cx + scoreHalf + bandH * 0.26;
  ctx.textAlign = 'left';
  drawTricodeChip(ctx, s.homeCode, codeLeftX, midY, codeFs, s.homeTheme, s.homeScore > s.awayScore, 'left', scoreGuardL);
  ctx.textAlign = 'right';
  drawTricodeChip(ctx, s.awayCode, codeRightX, midY, codeFs, s.awayTheme, s.awayScore > s.homeScore, 'right', scoreGuardR);

  // status / clock strip below the score line (Doto, dim cream)
  const clockFs = Math.max(9, bandH * 0.18);
  const clockY = y + bandH * 0.82;
  ctx.font = fontData(clockFs, 400);
  ctx.fillStyle = rgba(INK.newsprint, 0.62);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const status = `· ${clockText(s.minute, s.phaseLabel)} ·`.toUpperCase();
  ctx.fillText(status, cx, clockY);

  ctx.restore();
}

/** a tricode with an optional team-color keyline chip behind it (leader gets the chip). */
function drawTricodeChip(
  ctx: CanvasRenderingContext2D,
  code: string,
  exRaw: number,
  cy: number,
  fs: number,
  theme: PopTheme,
  leading: boolean,
  align: 'left' | 'right',
  scoreGuard: number,
): void {
  const tw0 = ctx.measureText(code).width;
  // clamp so the tricode's inner edge never crosses the score's guard rail
  let ex = exRaw;
  if (align === 'left') ex = Math.min(exRaw, scoreGuard - tw0);
  else ex = Math.max(exRaw, scoreGuard + tw0);
  if (leading) {
    const tw = tw0;
    const px = fs * 0.32;
    const chipX = align === 'left' ? ex - px : ex - tw - px;
    const chipY = cy - fs * 0.62;
    ctx.save();
    ctx.fillStyle = rgba(theme.primary, 1);
    ctx.fillRect(chipX, chipY, tw + px * 2, fs * 1.24);
    // team scoreChip keyline = PANEL weight (cream on the dark band) — a mid-tier rule
    inkStrokeRect(ctx, chipX, chipY, tw + px * 2, fs * 1.24, tw + px * 2, 'panel', INK.newsprint);
    // type on the chip: black or cream by the chip's luminance (legibility gate)
    ctx.fillStyle = rgba(luma(theme.primary) > 150 ? INK.pressBlack : INK.newsprint, 1);
    ctx.fillText(code, ex, cy);
    ctx.restore();
    return;
  }
  ctx.fillStyle = rgba(INK.newsprint, 1);
  ctx.fillText(code, ex, cy);
}

/**
 * Doto score with a scoreboard FLIP: as `flip` runs 0→1 the changing column prints its
 * dot pattern then snaps into register — we fake the mechanical print by a one-column
 * vertical jitter + a brief cream underprint. Kept to a flicker, never a smear (§7).
 */
function drawDotScore(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  fs: number,
  flip: number,
): void {
  ctx.save();
  ctx.font = fontData(fs, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const f = clamp01(flip);
  if (f > 0 && f < 1) {
    // print flicker: a faint offset ghost that resolves as it snaps into register
    const off = Math.sin(f * Math.PI * 6) * fs * 0.06 * (1 - f);
    ctx.fillStyle = rgba(INK.newsprint, 0.28 * (1 - f));
    ctx.fillText(text, cx + off, cy);
  }
  ctx.fillStyle = rgba(INK.newsprint, 1);
  ctx.fillText(text, cx, cy);
  ctx.restore();
}

export const SCOREBOARD_H = COMPONENTS.scoreboard.height;

/** expose band bottom y so ends/rail can tuck under it. */
export function scoreboardBottomY(stage: StageRect): number {
  const border = Math.max(2, Math.round(stage.w * GRID.border));
  const bandH = Math.max(30, stage.h * COMPONENTS.scoreboard.height);
  return stage.y + border + bandH;
}

void (undefined as unknown as RGBTuple);
