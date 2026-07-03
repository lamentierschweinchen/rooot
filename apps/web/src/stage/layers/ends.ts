/**
 * ROOOT stage — THE ENDS: pictogram crowd bands behind each goal (§6.7). Replaces the
 * night-smoke ends. This is the best crowd rendering in the canon (stage-dark-crowd-canon,
 * stage-dark-faith-crowd): a dense field of GEOMETRIC FAN GLYPHS — heads, torsos, raised
 * arms, held flag-blocks — NO faces, packed on a tight grid, capped by a BUNTING row of
 * flag patches. Density/animation track the ROAR via setCrowd; a ROOTED counter prints in
 * Doto on a keylined chip; "CHEERS COUNT DOUBLE" (Medal Gold) shows when that side trails.
 *
 * Honesty (§3): the crowd is COUNTS/roar, NEVER a percentage, never blended with market.
 *
 * PERF: the crowd is a fixed lattice of glyphs baked per side into an offscreen buffer;
 * a cheer just swaps a cheap "raised-arm" overlay pattern + brightens a few flag-blocks —
 * a PATTERN change, not character acting, not a re-bake per frame.
 */

import { GRID, COMPONENTS } from '../../lib/theme';
import { INK, fontData, fontDisplay, setStretch } from '../pop';
import type { PopTheme } from '../pop';
import type { PitchRect, StageRect } from '../layout';
import { rgba, clamp01, hash11, hash21 } from '../../lib/stage-math';
import type { RGBTuple } from '../../lib/stage-math';

export interface EndInputs {
  roarHome: number;
  roarAway: number;
  countHome: number;
  countAway: number;
  homeBehind: boolean;
  awayBehind: boolean;
}

interface BakedCrowd {
  canvas: HTMLCanvasElement;
  w: number;
  h: number;
  color: string;
  rows: number;
  cols: number;
}

/** one fan glyph: a head disc + a shoulders/torso block; arms drawn live when cheering. */
function drawFan(
  ctx: CanvasRenderingContext2D,
  cx: number,
  baseY: number,
  cell: number,
  ink: RGBTuple,
  raised: boolean,
): void {
  const headR = cell * 0.17;
  const headY = baseY - cell * 0.62;
  ctx.fillStyle = rgba(ink, 1);
  // head
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  // torso — a rounded shoulders block
  const tw = cell * 0.44;
  const th = cell * 0.5;
  const ty = headY + headR * 0.6;
  roundRect(ctx, cx - tw / 2, ty, tw, th, cell * 0.08);
  ctx.fill();
  // arms
  ctx.strokeStyle = rgba(ink, 1);
  ctx.lineWidth = Math.max(1, cell * 0.09);
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (raised) {
    // both arms up — the cheer pose
    ctx.moveTo(cx - tw * 0.4, ty + th * 0.3);
    ctx.lineTo(cx - tw * 0.7, headY - headR * 0.4);
    ctx.moveTo(cx + tw * 0.4, ty + th * 0.3);
    ctx.lineTo(cx + tw * 0.7, headY - headR * 0.4);
  } else {
    // arms down/rest
    ctx.moveTo(cx - tw * 0.4, ty + th * 0.2);
    ctx.lineTo(cx - tw * 0.62, ty + th * 0.8);
    ctx.moveTo(cx + tw * 0.4, ty + th * 0.2);
    ctx.lineTo(cx + tw * 0.62, ty + th * 0.8);
  }
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export class Ends {
  private homeGlow = 0;
  private awayGlow = 0;
  private homeBaked: BakedCrowd | null = null;
  private awayBaked: BakedCrowd | null = null;

  layout(_stage: StageRect): void {
    // buffers are lazily (re)baked in draw when the band size / color changes
    this.homeBaked = null;
    this.awayBaked = null;
  }

  update(dt: number, inp: EndInputs, _reduced: boolean): void {
    // roar → glow (saturating). roar is decayed cheers/sec; map softly.
    const gh = clamp01(1 - Math.exp(-inp.roarHome / 8));
    const ga = clamp01(1 - Math.exp(-inp.roarAway / 8));
    const k = 1 - Math.exp(-dt / 0.5);
    this.homeGlow += (gh - this.homeGlow) * k;
    this.awayGlow += (ga - this.awayGlow) * k;
  }

  /** bake the resting crowd lattice for one side (fans in team ink on Press-Black). */
  private bake(bandW: number, bandH: number, color: RGBTuple): BakedCrowd {
    const w = Math.max(1, Math.round(bandW));
    const h = Math.max(1, Math.round(bandH));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;

    // Press-Black stand ground
    ctx.fillStyle = rgba(INK.pressBlack, 1);
    ctx.fillRect(0, 0, w, h);

    // fan lattice — tight grid, rows recede upward (deeper rows smaller)
    const cell = Math.max(10, h / 4.4);
    const cols = Math.max(6, Math.round(w / (cell * 0.82)));
    const rows = Math.max(3, Math.round((h - cell) / (cell * 0.72)));
    const colStep = w / cols;
    const rowStep = (h - cell * 0.4) / rows;

    for (let r = 0; r < rows; r++) {
      // rows deeper in the stand (higher r) are smaller + dimmer
      const depth = r / Math.max(1, rows - 1);
      const rc = cell * (0.72 + (1 - depth) * 0.42);
      const baseY = h - rowStep * r - cell * 0.2;
      const jitterX = (r % 2) * colStep * 0.5;
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const cx = colStep * (cIdx + 0.5) + jitterX + (hash21(r * 3.1, cIdx * 7.7) - 0.5) * colStep * 0.2;
        if (cx < -rc || cx > w + rc) continue;
        // team-ink fan; a fraction hold a flag-block instead (patchwork identity)
        const isFlag = hash21(r * 13.7, cIdx * 4.3) > 0.82;
        if (isFlag) {
          drawStandFlag(ctx, cx, baseY - rc * 0.5, rc * 0.62, color);
        } else {
          drawFan(ctx, cx, baseY, rc, color, false);
        }
      }
    }

    return { canvas: c, w, h, color: color.join(','), rows, cols };
  }

  private ensure(slot: BakedCrowd | null, bandW: number, bandH: number, color: RGBTuple): BakedCrowd {
    const w = Math.round(bandW);
    const h = Math.round(bandH);
    const key = color.join(',');
    if (slot && slot.w === w && slot.h === h && slot.color === key) return slot;
    return this.bake(bandW, bandH, color);
  }

  /**
   * Draw one end's crowd band. dir +1 = home (bottom band), -1 = away (top band). The band
   * fills the margin between the goal line and the frame; the baked lattice is composited,
   * then a live cheer overlay (raised-arm glyphs) rides the roar. Bunting row caps the top.
   */
  private drawEnd(
    ctx: CanvasRenderingContext2D,
    stage: StageRect,
    pitch: PitchRect,
    theme: PopTheme,
    dir: 1 | -1,
    glow: number,
    t: number,
    reduced: boolean,
    glyph: string,
  ): void {
    const border = Math.max(2, Math.round(stage.w * GRID.border));
    const bandW = pitch.w;
    // home band: from home goal line down to (frame - caption strip); away: frame top → away goal
    const bandX = pitch.x;
    let bandY: number;
    let bandH: number;
    if (dir === 1) {
      const bottomLimit = stage.y + stage.h - border - stage.h * 0.055; // clear of caption strip
      bandY = pitch.homeGoalY;
      bandH = Math.max(20, bottomLimit - bandY);
    } else {
      // start just below the scoreboard band (border + band height) so the away crowd +
      // its ROOTED counter never sit under the scoreboard status line.
      const scoreboardBottom = stage.y + border + stage.h * COMPONENTS.scoreboard.height + stage.h * 0.006;
      bandY = scoreboardBottom;
      bandH = Math.max(20, pitch.awayGoalY - bandY);
    }

    const baked = dir === 1
      ? (this.homeBaked = this.ensure(this.homeBaked, bandW, bandH, theme.primary))
      : (this.awayBaked = this.ensure(this.awayBaked, bandW, bandH, theme.primary));

    ctx.save();
    ctx.beginPath();
    ctx.rect(bandX, bandY, bandW, bandH);
    ctx.clip();
    // away band's crowd faces DOWN toward its goal — flip vertically so heads point at the pitch
    if (dir === -1) {
      ctx.translate(bandX, bandY + bandH);
      ctx.scale(1, -1);
      ctx.drawImage(baked.canvas, 0, 0);
    } else {
      ctx.drawImage(baked.canvas, bandX, bandY);
    }
    ctx.restore();

    // BUNTING row — a row of flag patches capping the crowd (top of the band, toward pitch)
    drawBunting(ctx, bandX, dir === 1 ? bandY : bandY, bandW, Math.max(8, bandH * 0.14), theme, glyph, dir);

    // live cheer overlay: at higher roar, a scatter of raised-arm fans light up in team ink
    if (!reduced && glow > 0.15) {
      const cell = Math.max(10, bandH / 4.4);
      const n = Math.round(glow * 18);
      ctx.save();
      ctx.beginPath();
      ctx.rect(bandX, bandY, bandW, bandH);
      ctx.clip();
      for (let i = 0; i < n; i++) {
        // pattern change, not acting: pick stable cells and toggle them on a slow beat
        const ph = hash11(i * 5.9 + (dir === 1 ? 0 : 40)) * Math.PI * 2;
        const beat = Math.sin(t * 3.2 + ph);
        if (beat < 0.2) continue;
        const fx = hash11(i * 2.3 + (dir === 1 ? 3 : 63));
        const fy = hash11(i * 8.1 + (dir === 1 ? 7 : 71));
        const cx = bandX + fx * bandW;
        const baseY = dir === 1 ? bandY + bandH - fy * bandH * 0.8 : bandY + fy * bandH * 0.8 + cell * 0.6;
        drawFan(ctx, cx, baseY, cell * 0.92, theme.primary, true);
      }
      ctx.restore();
    }
  }

  /** the ROOTED counter chips (Doto on keyline chip) + CHEERS COUNT DOUBLE (Medal Gold). */
  drawCounters(ctx: CanvasRenderingContext2D, stage: StageRect, pitch: PitchRect, inp: EndInputs): void {
    this.drawCounter(ctx, stage, pitch, 1, inp.countHome, inp.homeBehind);
    this.drawCounter(ctx, stage, pitch, -1, inp.countAway, inp.awayBehind);
  }

  private drawCounter(
    ctx: CanvasRenderingContext2D,
    stage: StageRect,
    pitch: PitchRect,
    dir: 1 | -1,
    count: number,
    behind: boolean,
  ): void {
    const cx = pitch.cx;
    // chip sits inside the crowd band, tucked against the goal line (both ends), so the
    // CHEERS line (drawn on the crowd-side of the chip) always stays within the band and
    // never collides with the scoreboard (top) or the caption strip (bottom).
    const chipH = Math.max(16, stage.h * 0.026);
    const y = dir === 1
      ? pitch.homeGoalY + chipH * 0.6 // just below the bottom goal line, into the home crowd
      : pitch.awayGoalY - chipH * 1.6; // just above the top goal line, into the away crowd
    const label = `${formatCount(count)} ROOTED`;
    const fs = chipH * 0.56;
    ctx.save();
    ctx.font = fontData(fs, 600);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(label).width;
    const padX = chipH * 0.55;
    const chipW = tw + padX * 2;
    const chipX = cx - chipW / 2;
    // Newsprint chip + Press-Black keyline (a readout plate on the dark stand)
    ctx.fillStyle = rgba(INK.newsprint, 1);
    ctx.fillRect(chipX, y, chipW, chipH);
    ctx.strokeStyle = rgba(INK.pressBlack, 1);
    ctx.lineWidth = Math.max(1, chipH * 0.08);
    ctx.strokeRect(chipX, y, chipW, chipH);
    // the count in Doto — Medal Gold if this side is trailing (the faith highlight), else black
    ctx.fillStyle = rgba(behind ? INK.medalGold : INK.pressBlack, 1);
    ctx.fillText(label, cx, y + chipH / 2);
    // CHEERS COUNT DOUBLE line when behind (Medal Gold, §6.7)
    if (behind) {
      const cy2 = dir === 1 ? y + chipH * 1.15 : y - chipH * 0.65;
      ctx.font = fontDisplay(fs * 0.8, 700);
      setStretch(ctx, 108);
      ctx.fillStyle = rgba(INK.medalGold, 1);
      ctx.fillText('CHEERS COUNT DOUBLE', cx, cy2);
    }
    ctx.restore();
  }

  draw(
    ctx: CanvasRenderingContext2D,
    stage: StageRect,
    pitch: PitchRect,
    homeTheme: PopTheme,
    awayTheme: PopTheme,
    _inp: EndInputs,
    t: number,
    reduced: boolean,
    homeGlyph: string,
    awayGlyph: string,
  ): void {
    this.drawEnd(ctx, stage, pitch, homeTheme, 1, this.homeGlow, t, reduced, homeGlyph);
    this.drawEnd(ctx, stage, pitch, awayTheme, -1, this.awayGlow, t, reduced, awayGlyph);
  }
}

/** a held flag-block in the stand (team ink block with a cream keyline). */
function drawStandFlag(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, ink: RGBTuple): void {
  ctx.save();
  ctx.fillStyle = rgba(ink, 1);
  ctx.fillRect(cx - s / 2, cy - s * 0.36, s, s * 0.72);
  ctx.strokeStyle = rgba(INK.newsprint, 0.85);
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.strokeRect(cx - s / 2, cy - s * 0.36, s, s * 0.72);
  ctx.restore();
}

/** bunting row: a rank of small flag patches (team ink + cream), evenly gridded. */
function drawBunting(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: PopTheme,
  _glyph: string,
  _dir: 1 | -1,
): void {
  const n = Math.max(6, Math.round(w / (h * 1.4)));
  const step = w / n;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const bx = x + step * i + step * 0.1;
    const bw = step * 0.8;
    const ink = i % 2 ? theme.primary : theme.secondary;
    ctx.fillStyle = rgba(ink, 1);
    ctx.fillRect(bx, y, bw, h * 0.82);
    ctx.strokeStyle = rgba(INK.pressBlack, 0.9);
    ctx.lineWidth = Math.max(1, h * 0.08);
    ctx.strokeRect(bx, y, bw, h * 0.82);
  }
  ctx.restore();
}

function formatCount(n: number): string {
  const v = Math.max(0, Math.floor(n));
  return v.toLocaleString('en-US');
}

void (undefined as unknown as RGBTuple);
