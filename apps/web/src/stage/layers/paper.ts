/**
 * ROOOT stage — THE PRINTED OBJECT: ground, keyline, cream border, caption + serial.
 *
 * SYSTEM.md §10 (memento law) + §2 (grid/frame). Any paused stage frame must read as an
 * OWNABLE POSTER — grounded, framed, captioned, edition-marked, no dangling UI. This layer
 * lays the print anatomy the whole stage lives inside:
 *  · the loud fixture GROUND fills the page area around the pitch (SURFACE_GROUND / the
 *    chosen ground for this fixture — a loud neither team owns; demo → kickoffSky);
 *  · a Press-Black KEYLINE (§2 ≈2% of width) + a Newsprint BORDER (≈5%) frame the object;
 *  · a caption/footer STRIP along the bottom — fixture · date · frame label (Doto);
 *  · a serial/edition LINE — Nº 000000 placeholder in the reserved slot (accepts a real
 *    number later) — the "this one is yours" mark.
 */

import { GRID, COMPONENTS } from '../../lib/theme';
import { INK, inkOn, fontData } from '../pop';
import type { StageRect } from '../layout';
import { rgba } from '../../lib/stage-math';
import type { RGBTuple } from '../../lib/stage-math';
import { inkStrokeRect, inkTooth, tierPx } from '../../lib/ink';

export interface PaperArgs {
  ground: RGBTuple; // the loud fixture ground (fills around the pitch)
  fixtureLabel: string; // "MEX · ENG"
  dateLabel: string; // "03 JUL 2026"
  frameLabel: string; // "KICK OFF SOON" / "GOOOL" / "FULL TIME" …
  serial: string; // "Nº 000120" placeholder
  posed: boolean; // true → poster-ready (drop any live-only hints); reserved for future
}

/** Fill the whole page with the loud ground (the memento's paper stock behind the pitch). */
export function drawGround(ctx: CanvasRenderingContext2D, stage: StageRect, ground: RGBTuple): void {
  ctx.fillStyle = rgba(ground, 1);
  ctx.fillRect(stage.x, stage.y, stage.w, stage.h);
  // PRINT-SOUL item 3: even the loud posed ground is INK ON PAPER — a whisper of tooth over
  // the flat loud so it reads as a printed poster stock, not a sterile vector fill. Static,
  // ≤ a whisper of alpha, no vignette on the loud (the border carries the sheet warmth).
  inkTooth(ctx, { x: stage.x, y: stage.y, w: stage.w, h: stage.h }, 0.055);
}

/**
 * The frame: a Press-Black keyline inset from the stage edge by the cream border, with the
 * cream border itself painted as a clean margin. Drawn AFTER the ground so the border reads
 * as Newsprint breathing-room separating the loud ground from the stage edge (§2).
 */
export function drawFrame(ctx: CanvasRenderingContext2D, stage: StageRect): void {
  const w = stage.w;
  const outer = tierPx(w, 'frame'); // the FAT frame tier (PRINT-SOUL item 4) ≈2%
  const inset = Math.max(2, Math.round(w * GRID.border * 0.5)); // half-border inset for the keyline

  // Press-Black FRAME keyline around the composed stage — a breathing pressed rule (the
  // object-defining line, top of the weight hierarchy).
  const kx = stage.x + inset;
  const ky = stage.y + inset;
  const kw = stage.w - inset * 2;
  const kh = stage.h - inset * 2;
  inkStrokeRect(ctx, kx, ky, kw, kh, w, 'frame', INK.pressBlack, 60);
  void outer;
}

/**
 * The caption strip along the bottom of the loud ground: a keyline-boxed Newsprint band
 * carrying the fixture caption + frame label (left/center) and the serial/edition line
 * (right). Doto throughout (printer's voice, §4/§10). Sits ON the ground, inside the frame.
 */
export function drawCaption(
  ctx: CanvasRenderingContext2D,
  stage: StageRect,
  a: PaperArgs,
): void {
  const w = stage.w;
  const border = Math.max(2, Math.round(w * GRID.border));
  const stripH = Math.max(16, Math.round(stage.h * COMPONENTS.memento.footerHeight * 0.7));
  const x = stage.x + border;
  const y = stage.y + stage.h - border - stripH;
  const ww = stage.w - border * 2;

  ctx.save();
  // the strip is a Newsprint band (warm printed plate — item 3 tooth) with a PANEL-weight
  // Press-Black keyline (item 4 — a caption plate on the ground).
  ctx.fillStyle = rgba(INK.newsprint, 1);
  ctx.fillRect(x, y, ww, stripH);
  inkTooth(ctx, { x, y, w: ww, h: stripH });
  inkStrokeRect(ctx, x, y, ww, stripH, w, 'panel', INK.pressBlack, 5);

  const fs = Math.max(9, stripH * 0.46);
  const cy = y + stripH / 2;
  const pad = stripH * 0.5;
  ctx.textBaseline = 'middle';

  // right: the serial / edition line first (reserved slot; accepts a real Nº later) — we
  // measure it so the left caption can be truncated to never collide with it.
  ctx.font = fontData(fs, 500);
  const serial = a.serial.toUpperCase();
  const serialW = ctx.measureText(serial).width;
  ctx.textAlign = 'right';
  ctx.fillStyle = rgba(INK.pressBlack, 0.7);
  ctx.fillText(serial, x + ww - pad, cy);

  // a thin faint Press-Black divider between caption and serial (a plate seam — a texture
  // hairline below the DETAIL tier, kept faint on purpose so it reads as a seam not a rule)
  const divX = x + ww - pad - serialW - pad * 0.8;
  ctx.strokeStyle = rgba(INK.pressBlack, 0.3);
  ctx.lineWidth = Math.max(1, tierPx(w, 'detail') * 0.55);
  ctx.beginPath();
  ctx.moveTo(divX, y + stripH * 0.22);
  ctx.lineTo(divX, y + stripH * 0.78);
  ctx.stroke();

  // left: fixture · date · frame label (Doto), FITTED to the space before the
  // serial by dropping whole " · "-segments from the right (frame label goes
  // first, then the date) — a caption plate never breaks a glyph mid-stroke
  // (memento law: the strip is print anatomy, it must always read as SET type).
  ctx.textAlign = 'left';
  ctx.fillStyle = rgba(INK.pressBlack, 0.92);
  const maxW = divX - x - pad * 1.8;
  const segs = [a.fixtureLabel, a.dateLabel, a.frameLabel].filter(Boolean);
  let left = segs.join(' · ').toUpperCase();
  while (segs.length > 1 && ctx.measureText(left).width > maxW) {
    segs.pop();
    left = segs.join(' · ').toUpperCase();
  }
  ctx.fillText(left, x + pad, cy, Math.max(1, maxW)); // maxWidth = condense, never clip


  ctx.restore();
  void inkOn;
}

/** the strip's reserved height (so callers can keep the pitch clear of it). */
export function captionStripHeight(stage: StageRect): number {
  return Math.max(16, Math.round(stage.h * COMPONENTS.memento.footerHeight * 0.7));
}
