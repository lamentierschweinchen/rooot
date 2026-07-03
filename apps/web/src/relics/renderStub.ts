/**
 * ROOOT relics — renderStub (NEW; owned by the relics lane).
 *
 * The call receipt as a ~2:1 landscape ticket at PRINT QUALITY (1600×800). Pure:
 * StubData → offscreen canvas. Fonts loaded first (ensureRelicFonts).
 *
 * Anatomy (SYSTEM.md §6.13 + stub-canonical-iconic / -labeled-microrow-donor):
 *  · Sunbleach paper ground, Press-Black keyline + cream border.
 *  · A rotated CALLED IT rail (Anybody 90°) down a MAGENTA left edge (§ magenta strip pink).
 *  · A top DATA LINE (Doto): "MINUTE {m} · THE WORLD SAID {p}%".
 *  · A PICTOGRAM ROW (3 cells): GATE / SECTION / SEAT — drawn geometric pictograms →
 *    END {end} · ROW {row} · SEAT {seat}.
 *  · A GLYPH ROW: pop-ball pinwheel + three roar-ring glyphs.
 *  · The SERIAL Nº repeated TWICE (top + bottom) on the gold tab (real ticket lineage, §10).
 *  · A gold PROVED tab (Medal Gold ground) with a DIE-CUT punch hole (cream circle + ring)
 *    rendered ONLY when proved === true.
 *  · A PERFORATION tear-edge on the tab side — THE SOLE LEGAL TOOTH in the whole system (§9.2).
 */

import { GRID, COMPONENTS } from '../lib/theme';
import type { StubData } from '@contracts/relic';
import {
  INK,
  rgb,
  type RGB,
  makeCanvas,
  ctxOf,
  paintFrame,
  keyBox,
  paperTooth,
  popBall,
  roarRings,
  fontData,
  fontDisplay,
  trackedText,
  fitTracked,
  type Rect,
} from './paint';

const STUB_W = 1600;
const STUB_H = 800;

function serialText(serial: number): string {
  const { prefix, pad } = COMPONENTS.memento.serialFormat;
  return `${prefix} ${String(serial).padStart(pad, '0')}`;
}

/* =========================================================================
 * PICTOGRAMS — simple geometric ticket icons (no faces, flat ink).
 * ===================================================================== */

/** A turnstile / gate arch pictogram (GATE). */
function gatePictogram(ctx: CanvasRenderingContext2D, r: Rect, ink: RGB): void {
  ctx.save();
  ctx.fillStyle = rgb(ink);
  const w = r.w;
  const h = r.h;
  const x = r.x;
  const y = r.y;
  // canon gate: two fat posts with rounded caps, a lintel, and a pair of barred
  // gate leaves swinging inward — clean flat ink, no perspective
  const postW = w * 0.1;
  const postL = x + w * 0.16;
  const postR = x + w * 0.74;
  ctx.fillRect(postL, y + h * 0.16, postW, h * 0.78);
  ctx.fillRect(postR, y + h * 0.16, postW, h * 0.78);
  // rounded post caps
  ctx.beginPath();
  ctx.arc(postL + postW / 2, y + h * 0.16, postW / 2, Math.PI, 0);
  ctx.arc(postR + postW / 2, y + h * 0.16, postW / 2, Math.PI, 0);
  ctx.fill();
  // lintel spanning the posts
  ctx.fillRect(postL + postW, y + h * 0.2, postR - postL - postW, h * 0.1);
  // gate leaves: vertical bars hanging from a leaf rail on each side of the middle
  const railY = y + h * 0.36;
  const railH = h * 0.07;
  const leafGap = w * 0.04; // the opening between the two leaves
  const midX = x + w * 0.5;
  const leafL: [number, number] = [postL + postW, midX - leafGap / 2];
  const leafR: [number, number] = [midX + leafGap / 2, postR];
  for (const [lx0, lx1] of [leafL, leafR]) {
    ctx.fillRect(lx0, railY, lx1 - lx0, railH);
    const bars = 3;
    const span = lx1 - lx0;
    const barW = span * 0.16;
    for (let i = 0; i < bars; i++) {
      const bx = lx0 + (span * (i + 0.5)) / bars - barW / 2;
      ctx.fillRect(bx, railY, barW, h * 0.56);
    }
  }
  ctx.restore();
}

/** A stadium section block-grid pictogram (SECTION). */
function sectionPictogram(ctx: CanvasRenderingContext2D, r: Rect, ink: RGB): void {
  ctx.save();
  ctx.fillStyle = rgb(ink);
  const cols = 5;
  const rows = 3;
  const gx = r.w * 0.06;
  const gy = r.h * 0.1;
  const cw = (r.w - gx * (cols + 1)) / cols;
  const chh = (r.h * 0.7 - gy * (rows + 1)) / rows;
  const y0 = r.y + r.h * 0.18;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      ctx.fillRect(r.x + gx + i * (cw + gx), y0 + j * (chh + gy), cw, chh);
    }
  }
  ctx.restore();
}

/** A single numbered stadium seat pictogram (SEAT) — front view, number on the backrest. */
function seatPictogram(ctx: CanvasRenderingContext2D, r: Rect, ink: RGB, seatNo: number): void {
  ctx.save();
  ctx.fillStyle = rgb(ink);
  const w = r.w * 0.46;
  const x = r.x + (r.w - w) / 2;
  const y = r.y + r.h * 0.08;
  const h = r.h * 0.84;
  // backrest: a tall rounded-top slab (the canon's tombstone silhouette)
  const backH = h * 0.62;
  const radius = w * 0.5;
  ctx.beginPath();
  ctx.moveTo(x, y + backH);
  ctx.lineTo(x, y + radius);
  ctx.arc(x + radius, y + radius, radius, Math.PI, 0);
  ctx.lineTo(x + w, y + backH);
  ctx.closePath();
  ctx.fill();
  // seat pan: a wider slab under the backrest
  const panW = w * 1.34;
  const panX = x - (panW - w) / 2;
  ctx.fillRect(panX, y + backH + h * 0.02, panW, h * 0.14);
  // legs
  const legW = panW * 0.1;
  ctx.fillRect(panX + panW * 0.08, y + backH + h * 0.16, legW, h * 0.2);
  ctx.fillRect(panX + panW * 0.82, y + backH + h * 0.16, legW, h * 0.2);
  // the seat number ON the backrest (Doto, cream reversed out)
  ctx.fillStyle = rgb(INK.newsprint);
  ctx.font = fontData(backH * 0.46, 600);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(seatNo), x + w / 2, y + backH * 0.55);
  ctx.restore();
}

/**
 * Render the call stub. Returns the offscreen canvas.
 */
export function renderStub(stub: StubData): HTMLCanvasElement {
  const c = makeCanvas(STUB_W, STUB_H);
  const ctx = ctxOf(c);

  const full: Rect = { x: 0, y: 0, w: STUB_W, h: STUB_H };
  // Sunbleach paper ground, cream border, Press-Black keyline
  const frame = paintFrame(ctx, full, INK.sunbleach, INK.newsprint);
  const g = frame.ground; // the sunbleach field inside the border
  const strokeW = Math.max(2, STUB_W * GRID.keyline * 0.5);
  paperTooth(ctx, g, 0.06);

  // ── layout: [ magenta rail | body | gold PROVED tab ]
  const railW = g.w * COMPONENTS.stub.railWidth;
  const tabW = g.w * 0.2;
  const bodyX = g.x + railW;
  const bodyW = g.w - railW - tabW;

  // ── the magenta CALLED IT rail (rotated 90°)
  const rail: Rect = { x: g.x, y: g.y, w: railW, h: g.h };
  ctx.fillStyle = rgb(INK.magenta);
  ctx.fillRect(rail.x, rail.y, rail.w, rail.h);
  paperTooth(ctx, rail, 0.05);
  // divider keyline between rail and body
  ctx.strokeStyle = rgb(INK.pressBlack);
  ctx.lineWidth = strokeW;
  ctx.beginPath();
  ctx.moveTo(bodyX, g.y);
  ctx.lineTo(bodyX, g.y + g.h);
  ctx.stroke();
  // CALLED IT, rotated (reads bottom-to-top)
  ctx.save();
  ctx.translate(rail.x + rail.w / 2, rail.y + rail.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = rgb(INK.pressBlack);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const railPx = railW * 0.62;
  ctx.font = fontDisplay(railPx, 900);
  fitTracked(ctx, 'CALLED IT', g.h * 0.9, railPx, railPx * 0.02, (px) => fontDisplay(px, 900));
  trackedText(ctx, 'CALLED IT', 0, railPx * 0.02, ctx.measureText(' ').width * 0.1 + railPx * 0.02, 'center');
  ctx.restore();

  // ── body: three stacked rows (data line / pictogram row / glyph row + text)
  const bodyPad = g.h * 0.06;
  const rowGap = strokeW;
  const bx = bodyX + bodyPad;
  const bw = bodyW - bodyPad * 2;
  const row1H = g.h * 0.2;
  const row2H = g.h * 0.42;
  const row3H = g.h - row1H - row2H - bodyPad * 2 - rowGap * 2;
  const by1 = g.y + bodyPad;
  const by2 = by1 + row1H + rowGap;
  const by3 = by2 + row2H + rowGap;

  // Row 1: MINUTE {m} · THE WORLD SAID {p}% (Doto), on a keyline box
  const r1: Rect = { x: bx, y: by1, w: bw, h: row1H };
  keyBox(ctx, r1, INK.sunbleach, strokeW);
  const minute = stub.receipt.minute;
  // "the world said" = the market probability for the side the fan called, at call time
  const side = stub.receipt.side;
  const p = side === 'home' ? stub.receipt.marketP.home : side === 'away' ? stub.receipt.marketP.away : stub.receipt.marketP.draw;
  const pctText = `${Math.round(p * 100)}%`;
  const dataLine = `MINUTE ${minute ?? '—'} · THE WORLD SAID ${pctText}`;
  ctx.fillStyle = rgb(INK.pressBlack);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const dpx = fitTracked(ctx, dataLine, r1.w * 0.9, r1.h * 0.5, r1.h * 0.02, (px) => fontData(px, 500));
  trackedText(ctx, dataLine, r1.x + r1.w / 2, r1.y + r1.h / 2 + dpx * 0.02, dpx * 0.02, 'center');

  // Row 2: pictogram row — GATE | SECTION | SEAT (three cells)
  const r2: Rect = { x: bx, y: by2, w: bw, h: row2H };
  keyBox(ctx, r2, INK.sunbleach, strokeW);
  const cellW = (r2.w - strokeW * 2) / 3;
  const picH = r2.h * 0.6;
  const picY = r2.y + r2.h * 0.08;
  // dividers
  ctx.strokeStyle = rgb(INK.pressBlack);
  ctx.lineWidth = strokeW;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(r2.x + strokeW + i * cellW, r2.y);
    ctx.lineTo(r2.x + strokeW + i * cellW, r2.y + r2.h);
    ctx.stroke();
  }
  gatePictogram(ctx, { x: r2.x + strokeW, y: picY, w: cellW, h: picH }, INK.pressBlack);
  sectionPictogram(ctx, { x: r2.x + strokeW + cellW, y: picY, w: cellW, h: picH }, INK.pressBlack);
  seatPictogram(ctx, { x: r2.x + strokeW + cellW * 2, y: picY, w: cellW, h: picH }, INK.pressBlack, stub.seat);
  // labels under each pictogram (Doto)
  ctx.fillStyle = rgb(INK.pressBlack);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const labY = r2.y + r2.h - r2.h * 0.08;
  const labPx = r2.h * 0.14;
  ctx.font = fontData(labPx, 600);
  trackedText(ctx, `END ${stub.end}`, r2.x + strokeW + cellW * 0.5, labY, labPx * 0.06, 'center');
  trackedText(ctx, `ROW ${stub.row}`, r2.x + strokeW + cellW * 1.5, labY, labPx * 0.06, 'center');
  trackedText(ctx, `SEAT ${stub.seat}`, r2.x + strokeW + cellW * 2.5, labY, labPx * 0.06, 'center');

  // Row 3: glyph row — pop-ball + three roar-rings (§ stub glyph row, canon-iconic's
  // bottom register: generous glyphs, evenly slotted)
  const r3: Rect = { x: bx, y: by3, w: bw, h: row3H };
  const glyphR = Math.min(r3.h * 0.46, r3.w / 9);
  const gy = r3.y + r3.h / 2;
  const slots = 4;
  const slotW = r3.w / slots;
  // pop-ball first (magenta + gold, per canon)
  popBall(ctx, r3.x + slotW * 0.5, gy, glyphR, INK.magenta, INK.aztecaSun, 0.4);
  // three roar-rings (5 crisp rings + the off-center source dot)
  for (let i = 1; i < slots; i++) {
    roarRings(ctx, r3.x + slotW * (i + 0.5), gy, glyphR, INK.pressBlack, 5);
  }

  // ── the gold PROVED tab
  const tab: Rect = { x: g.x + g.w - tabW, y: g.y, w: tabW, h: g.h };
  drawProvedTab(ctx, tab, stub, strokeW);

  return c;
}

/**
 * The gold PROVED tab: Medal Gold ground, serial Nº repeated top + bottom (Doto),
 * "PROVED" curved around a DIE-CUT punch hole (cream circle + ring) that is rendered
 * ONLY when proved === true; a PERFORATION tear-edge (the sole legal tooth) on the tab
 * side (its inner edge, where it detaches from the body).
 */
function drawProvedTab(ctx: CanvasRenderingContext2D, tab: Rect, stub: StubData, strokeW: number): void {
  const proved = stub.proved === true;
  // gold ground
  ctx.fillStyle = rgb(INK.medalGold);
  ctx.fillRect(tab.x, tab.y, tab.w, tab.h);
  paperTooth(ctx, tab, 0.05);

  // ── perforation tear-edge down the LEFT (inner) edge of the tab — the detach line.
  //    THE SOLE LEGAL TOOTH (§9.2): a zig of triangular teeth punched along the seam.
  const teeth = COMPONENTS.stub.tearTeeth;
  const toothH = tab.h / teeth;
  const toothW = tab.w * GRID.tooth * 1.4;
  const seamX = tab.x;
  ctx.fillStyle = rgb(INK.sunbleach); // the notches show the paper behind
  ctx.beginPath();
  ctx.moveTo(seamX, tab.y);
  for (let i = 0; i < teeth; i++) {
    const y0 = tab.y + i * toothH;
    ctx.lineTo(seamX + toothW, y0 + toothH * 0.5);
    ctx.lineTo(seamX, y0 + toothH);
  }
  ctx.lineTo(seamX - toothW, tab.y + tab.h);
  ctx.lineTo(seamX - toothW, tab.y);
  ctx.closePath();
  ctx.fill();
  // a Press-Black hairline riding the perforation seam
  ctx.strokeStyle = rgb(INK.pressBlack);
  ctx.lineWidth = Math.max(1.5, strokeW * 0.5);
  ctx.beginPath();
  ctx.moveTo(seamX, tab.y);
  for (let i = 0; i < teeth; i++) {
    const y0 = tab.y + i * toothH;
    ctx.lineTo(seamX + toothW, y0 + toothH * 0.5);
    ctx.lineTo(seamX, y0 + toothH);
  }
  ctx.stroke();

  // ── serial Nº repeated top + bottom (Doto, Press-Black on gold — legibility gate ok)
  ctx.fillStyle = rgb(INK.pressBlack);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const serPx = tab.h * 0.1;
  ctx.font = fontData(serPx, 600);
  const ser = serialText(stub.edition.serial);
  const cx = tab.x + tab.w * 0.5 + toothW * 0.3;
  trackedText(ctx, ser, cx, tab.y + tab.h * 0.14, serPx * 0.06, 'center');
  trackedText(ctx, ser, cx, tab.y + tab.h * 0.86, serPx * 0.06, 'center');

  // ── the PROVED punch + curved word (only when proved). Canon anatomy: a FAT
  //    Press-Black ring nearly filling the tab, PROVED arcing inside its top, the
  //    die-cut cream hole at dead center (the paper punched through).
  const holeCx = cx;
  const holeCy = tab.y + tab.h * 0.5;
  const discR = Math.min(tab.w * 0.4, tab.h * 0.26); // the outer ring, tab-fitted
  const holeR = Math.min(tab.h * COMPONENTS.stub.punchDia * 0.5, discR * 0.52);
  if (proved) {
    // outer fat ring
    ctx.strokeStyle = rgb(INK.pressBlack);
    ctx.lineWidth = discR * 0.14;
    ctx.beginPath();
    ctx.arc(holeCx, holeCy, discR, 0, Math.PI * 2);
    ctx.stroke();
    // "PROVED" arcing inside the ring's upper half
    curvedText(ctx, 'PROVED', holeCx, holeCy, discR * 0.72, INK.pressBlack, discR * 0.3);
    // die-cut hole: cream disc + a crisp black rim
    ctx.fillStyle = rgb(INK.newsprint);
    ctx.beginPath();
    ctx.arc(holeCx, holeCy, holeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgb(INK.pressBlack);
    ctx.lineWidth = Math.max(3, holeR * 0.1);
    ctx.beginPath();
    ctx.arc(holeCx, holeCy, holeR, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // unproved: a faint dotted ring placeholder where the punch would land (no hole)
    ctx.strokeStyle = rgb(INK.pressBlack);
    ctx.lineWidth = Math.max(2, holeR * 0.08);
    ctx.setLineDash([holeR * 0.3, holeR * 0.3]);
    ctx.beginPath();
    ctx.arc(holeCx, holeCy, holeR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = rgb(INK.pressBlack);
    ctx.font = fontDisplay(tab.h * 0.08, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    trackedText(ctx, 'PENDING', holeCx, holeCy, tab.h * 0.008, 'center');
  }
}

/** Draw text along the top arc of a circle (for PROVED around the punch). */
function curvedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  ink: RGB,
  px: number,
): void {
  ctx.save();
  ctx.fillStyle = rgb(ink);
  ctx.font = fontDisplay(px, 900);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = [...text];
  // per-char arc sized to the glyph advance at this radius so letters never collide
  const per = Math.min(0.5, (px * 0.94) / Math.max(1, radius));
  const totalA = per * (chars.length - 1);
  const startA = -Math.PI / 2 - totalA / 2;
  for (let i = 0; i < chars.length; i++) {
    const a = startA + i * per;
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(chars[i]!, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

export const STUB_SIZE = { w: STUB_W, h: STUB_H } as const;
