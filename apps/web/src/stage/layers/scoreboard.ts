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
  // compact header pinned to the very top of the stage — it must finish well above the
  // away goal line so it never fights the end band or the counter (r2 item 5).
  const topY = stage.y + stage.h * 0.026;
  const nameFs = Math.max(12, stage.w * 0.034);
  const scoreFs = Math.max(22, stage.w * 0.085);
  const clockFs = Math.max(10, stage.w * 0.027);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // soft dark backing stroke keeps chalk legible over lamp glow / crowd smoke
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(3,5,9,0.6)';

  // ── score line: HOME  n – n  AWAY ────────────────────────────────
  const gap = stage.w * 0.16;
  ctx.font = `600 ${scoreFs}px ui-monospace, Menlo, monospace`;
  const dash = '–';
  const dashW = ctx.measureText(dash).width;
  const scoreY = topY + scoreFs;

  // leading side gets a whisper of color in its numeral
  const homeCol =
    s.homeScore > s.awayScore ? mixRgb(RGB.chalk, s.homeTheme.primary, 0.35) : RGB.chalk;
  const awayCol =
    s.awayScore > s.homeScore ? mixRgb(RGB.chalk, s.awayTheme.primary, 0.35) : RGB.chalk;

  ctx.lineWidth = Math.max(3, scoreFs * 0.1);
  ctx.strokeText(dash, cx, scoreY);
  ctx.fillStyle = rgba(RGB.chalkDim, 0.85);
  ctx.fillText(dash, cx, scoreY);

  ctx.textAlign = 'right';
  ctx.strokeText(String(s.homeScore), cx - dashW * 0.9, scoreY);
  ctx.fillStyle = rgba(homeCol, 0.95);
  ctx.fillText(String(s.homeScore), cx - dashW * 0.9, scoreY);

  ctx.textAlign = 'left';
  ctx.strokeText(String(s.awayScore), cx + dashW * 0.9, scoreY);
  ctx.fillStyle = rgba(awayCol, 0.95);
  ctx.fillText(String(s.awayScore), cx + dashW * 0.9, scoreY);

  // ── team codes + flags flanking, serif (programme voice) ─────────
  ctx.font = `500 ${nameFs}px Georgia, 'Times New Roman', serif`;
  ctx.lineWidth = Math.max(2, nameFs * 0.14);
  ctx.textAlign = 'right';
  ctx.strokeText(`${s.homeFlag} ${s.homeCode}`, cx - gap, topY + scoreFs * 0.62);
  ctx.fillStyle = rgba(RGB.chalk, 0.82);
  ctx.fillText(`${s.homeFlag} ${s.homeCode}`, cx - gap, topY + scoreFs * 0.62);
  ctx.textAlign = 'left';
  ctx.strokeText(`${s.awayCode} ${s.awayFlag}`, cx + gap, topY + scoreFs * 0.62);
  ctx.fillText(`${s.awayCode} ${s.awayFlag}`, cx + gap, topY + scoreFs * 0.62);

  // ── clock / phase, mono, brighter than r1 (it sat unreadable on the bright band) ──
  ctx.font = `500 ${clockFs}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.lineWidth = Math.max(2, clockFs * 0.18);
  const ct = clockText(s.minute, s.phaseLabel).toUpperCase();
  const clockY = topY + scoreFs + clockFs * 1.45;
  ctx.strokeText(ct, cx, clockY);
  ctx.fillStyle = rgba(RGB.chalk, 0.85);
  ctx.fillText(ct, cx, clockY);

  // a hairline chalk rule under it — programme divider, not a UI box
  ctx.strokeStyle = rgba(RGB.chalkDim, 0.16);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - stage.w * 0.11, clockY + clockFs * 0.9);
  ctx.lineTo(cx + stage.w * 0.11, clockY + clockFs * 0.9);
  ctx.stroke();

  ctx.restore();
}
