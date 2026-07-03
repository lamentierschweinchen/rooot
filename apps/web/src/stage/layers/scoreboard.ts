/**
 * ROOOT stage — the chalk scoreboard (score + clock), matchday-programme voice.
 *
 * Minimal chalk type: serif for the names, mono for the numbers/clock. Part of the
 * STAGE, not UI chrome — it sits in the top end-band like a programme header, chalked,
 * never a boxed HUD. One accent allowed: the leading team's score can carry a hair of
 * its color; otherwise chalk.
 *
 * No FIFA marks; team CODES + unicode flags only (honesty / rule 4).
 */

import { RGB } from '../theme';
import type { StageRect, PitchRect } from '../layout';
import type { SideTheme } from '../theme';
import { rgba, mixRgb } from '../../lib/stage-math';

export interface ScoreboardInputs {
  homeCode: string;
  awayCode: string;
  homeFlag: string;
  awayFlag: string;
  homeScore: number;
  awayScore: number;
  /** match minute (null before KO) */
  minute: number | null;
  /** phase label, e.g. "HALF TIME", "FULL TIME", "1ST HALF" */
  phaseLabel: string;
  homeTheme: SideTheme;
  awayTheme: SideTheme;
}

function clockText(minute: number | null, phaseLabel: string): string {
  if (minute === null) return phaseLabel;
  const m = Math.max(0, Math.floor(minute));
  return `${m}'`;
}

export function drawScoreboard(
  ctx: CanvasRenderingContext2D,
  stage: StageRect,
  _pitch: PitchRect,
  s: ScoreboardInputs,
): void {
  const cx = stage.x + stage.w / 2;
  const topY = stage.y + stage.h * 0.04;
  const nameFs = Math.max(12, stage.w * 0.036);
  const scoreFs = Math.max(24, stage.w * 0.095);
  const clockFs = Math.max(10, stage.w * 0.028);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  // ── score line: HOME  n – n  AWAY ────────────────────────────────
  const gap = stage.w * 0.16;
  ctx.font = `600 ${scoreFs}px ui-monospace, Menlo, monospace`;
  const dash = '–';
  const dashW = ctx.measureText(dash).width;

  // leading side gets a whisper of color in its numeral
  const homeCol =
    s.homeScore > s.awayScore ? mixRgb(RGB.chalk, s.homeTheme.primary, 0.35) : RGB.chalk;
  const awayCol =
    s.awayScore > s.homeScore ? mixRgb(RGB.chalk, s.awayTheme.primary, 0.35) : RGB.chalk;

  ctx.fillStyle = rgba(RGB.chalkDim, 0.85);
  ctx.fillText(dash, cx, topY + scoreFs);

  ctx.fillStyle = rgba(homeCol, 0.95);
  ctx.textAlign = 'right';
  ctx.fillText(String(s.homeScore), cx - dashW * 0.9, topY + scoreFs);

  ctx.fillStyle = rgba(awayCol, 0.95);
  ctx.textAlign = 'left';
  ctx.fillText(String(s.awayScore), cx + dashW * 0.9, topY + scoreFs);

  // ── team codes + flags flanking, serif (programme voice) ─────────
  ctx.font = `500 ${nameFs}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = 'right';
  ctx.fillStyle = rgba(RGB.chalk, 0.8);
  ctx.fillText(`${s.homeFlag} ${s.homeCode}`, cx - gap, topY + scoreFs * 0.62);
  ctx.textAlign = 'left';
  ctx.fillText(`${s.awayCode} ${s.awayFlag}`, cx + gap, topY + scoreFs * 0.62);

  // ── clock / phase, mono, dim, centered under the score ───────────
  ctx.font = `500 ${clockFs}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = rgba(RGB.chalkDim, 0.75);
  const ct = clockText(s.minute, s.phaseLabel);
  ctx.fillText(ct.toUpperCase(), cx, topY + scoreFs + clockFs * 1.6);

  // a hairline chalk rule under it — programme divider, not a UI box
  ctx.strokeStyle = rgba(RGB.chalkDim, 0.18);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - stage.w * 0.12, topY + scoreFs + clockFs * 2.6);
  ctx.lineTo(cx + stage.w * 0.12, topY + scoreFs + clockFs * 2.6);
  ctx.stroke();

  ctx.restore();
}
