/**
 * ROOOT relics — renderCard (NEW; owned by the relics lane).
 *
 * The fan's match as a 5:7 trading card at PRINT QUALITY (1500×2100). Pure:
 * CardData → offscreen canvas → (caller toBlob's the PNG). Fonts must be loaded
 * (ensureRelicFonts) before calling so the Doto/Anybody type paints real.
 *
 * Anatomy (SYSTEM.md §6.14 + card-front-canonical / -roarbars-refined):
 *  · Poppy brick-red loud GROUND (§1), Press-Black keyline + Newsprint cream border (§2).
 *  · A PORTRAIT WINDOW: the pitch as flat data-art — the roar-bars skyline (§6.3) rising
 *    from the fan's goal-end (their myRoar buckets), the goal STARBURST pin at its minute
 *    (§6.8), dot-fray territory hints, pitch chalk markings. NO faces, NO hexagon balls.
 *  · A mini SCOREBOARD band atop the pitch: tricodes (Anybody) · dot-matrix score (Doto).
 *  · FOUR corner stat chips LOU / FTH / FOR / PRE (§6.11), Doto numerals in keyline boxes.
 *  · ONE diagonal THE STANDS band (§6.12), END code in Doto — the card's sole diagonal.
 *  · A footer strip (§10): ROOOT · MATCH Nº · fixture, flag blocks, + the EDITION line
 *    (Doto) in the reserved footer-left serial slot.
 */

import { GRID, COMPONENTS, GEOMETRY } from '../lib/theme';
import { chooseGround } from '../lib/pop-ground';
import type { CardData } from '@contracts/relic';
import type { Side } from '@contracts/crowd';
import {
  INK,
  rgb,
  rgba,
  type RGB,
  makeCanvas,
  ctxOf,
  paintFrame,
  keyBox,
  paperTooth,
  skyline,
  starburstPin,
  popBall,
  pitchMarkings,
  goalNet,
  halftoneField,
  fontData,
  fontDisplay,
  trackedText,
  trackedWidth,
  fitTracked,
  hexToRgb,
  mulberry32,
  type Rect,
} from './paint';

const CARD_W = 1500;
const CARD_H = 2100;

/** Format a serial per the memento format (Nº 000120). */
function serialText(serial: number): string {
  const { prefix, pad } = COMPONENTS.memento.serialFormat;
  return `${prefix} ${String(serial).padStart(pad, '0')}`;
}

/** A team's primary ink from its colour pair. */
function teamInk(colors: readonly [string, string]): RGB {
  return hexToRgb(colors[0]);
}

/** Draw a small keyline-boxed flag block (two/three stripes) — the flag-block slot. */
function flagBlock(ctx: CanvasRenderingContext2D, r: Rect, colors: readonly [string, string], strokeW: number): void {
  const a = hexToRgb(colors[0]);
  const b = hexToRgb(colors[1]);
  // vertical tricolor-ish: colorA | cream | colorB (reads as a flag block, not a real flag)
  const third = r.w / 3;
  ctx.fillStyle = rgb(a);
  ctx.fillRect(r.x, r.y, third, r.h);
  ctx.fillStyle = rgb(INK.newsprint);
  ctx.fillRect(r.x + third, r.y, third, r.h);
  ctx.fillStyle = rgb(b);
  ctx.fillRect(r.x + 2 * third, r.y, r.w - 2 * third, r.h);
  ctx.strokeStyle = rgb(INK.pressBlack);
  ctx.lineWidth = strokeW;
  ctx.strokeRect(r.x + strokeW / 2, r.y + strokeW / 2, r.w - strokeW, r.h - strokeW);
}

/**
 * A corner stat chip: Press-Black header cap with the 3-letter label (Anybody, cream),
 * a cream body with the big Doto number. Matches card-front-canonical's LOU 87 boxes.
 */
function statChip(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  value: number,
  strokeW: number,
): void {
  // body
  keyBox(ctx, r, INK.newsprint, strokeW);
  const headH = r.h * 0.34;
  // header cap (press-black)
  ctx.fillStyle = rgb(INK.pressBlack);
  ctx.fillRect(r.x + strokeW, r.y + strokeW, r.w - strokeW * 2, headH - strokeW);
  // label
  ctx.fillStyle = rgb(INK.newsprint);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labelPx = headH * 0.62;
  ctx.font = fontDisplay(labelPx, 800);
  const trk = labelPx * 0.06;
  trackedText(ctx, label, r.x + r.w / 2, r.y + strokeW + (headH - strokeW) / 2 + labelPx * 0.02, trk, 'center');
  // number (Doto)
  ctx.fillStyle = rgb(INK.pressBlack);
  const numPx = (r.h - headH) * 0.74;
  ctx.font = fontData(numPx, 600);
  ctx.fillText(String(value), r.x + r.w / 2, r.y + headH + (r.h - headH) / 2 + numPx * 0.02);
}

/** The mini scoreboard band atop the portrait: TRI (color) · score box · TRI (color). */
function miniScoreboard(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  card: CardData,
  strokeW: number,
): void {
  const { fixture, finalScore } = card.matchRelic;
  keyBox(ctx, r, INK.newsprint, strokeW);
  const inX = r.x + strokeW;
  const inW = r.w - strokeW * 2;
  const inY = r.y + strokeW;
  const inH = r.h - strokeW * 2;
  // three cells: home tricode | score | away tricode
  const scoreW = inW * 0.3;
  const triW = (inW - scoreW) / 2;
  // home tricode on the home team's primary
  const homeInk = teamInk(fixture.home.colors);
  const awayInk = teamInk(fixture.away.colors);
  ctx.fillStyle = rgb(homeInk);
  ctx.fillRect(inX, inY, triW, inH);
  ctx.fillStyle = rgb(awayInk);
  ctx.fillRect(inX + triW + scoreW, inY, triW, inH);
  // score box (press-black)
  ctx.fillStyle = rgb(INK.pressBlack);
  ctx.fillRect(inX + triW, inY, scoreW, inH);
  // dividers
  ctx.strokeStyle = rgb(INK.pressBlack);
  ctx.lineWidth = strokeW;
  ctx.beginPath();
  ctx.moveTo(inX + triW, inY);
  ctx.lineTo(inX + triW, inY + inH);
  ctx.moveTo(inX + triW + scoreW, inY);
  ctx.lineTo(inX + triW + scoreW, inY + inH);
  ctx.stroke();
  // tricodes (Anybody) — legibility gate: pick black/cream per team ground
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const triPx = inH * 0.5;
  ctx.font = fontDisplay(triPx, 900);
  const midY = inY + inH / 2 + triPx * 0.02;
  ctx.fillStyle = rgb(labelInkOn(homeInk));
  trackedText(ctx, fixture.home.code, inX + triW / 2, midY, triPx * 0.04, 'center');
  ctx.fillStyle = rgb(labelInkOn(awayInk));
  trackedText(ctx, fixture.away.code, inX + triW + scoreW + triW / 2, midY, triPx * 0.04, 'center');
  // score (Doto, cream on black)
  ctx.fillStyle = rgb(INK.newsprint);
  ctx.font = fontData(inH * 0.56, 600);
  ctx.fillText(`${finalScore.home}-${finalScore.away}`, inX + triW + scoreW / 2, midY);
}

/** legibility gate for a team ground (black or cream). */
function labelInkOn(ground: RGB): RGB {
  const lum = 0.299 * ground[0] + 0.587 * ground[1] + 0.114 * ground[2];
  return lum > 150 ? INK.pressBlack : INK.newsprint;
}

/**
 * The data-portrait: pitch chalk, the two dot-fray territory HINTS, the roar-bars
 * skyline rising from the fan's end, and the goal starburst pin at its minute.
 */
function portrait(ctx: CanvasRenderingContext2D, r: Rect, card: CardData, strokeW: number): void {
  const { fixture, finalScore } = card.matchRelic;
  const fanSide: Side = card.side;
  // paper ground for the portrait window (cream — the pitch is a light print here, per canon)
  keyBox(ctx, r, INK.newsprint, strokeW);
  const inner: Rect = { x: r.x + strokeW, y: r.y + strokeW, w: r.w - strokeW * 2, h: r.h - strokeW * 2 };

  // paper tooth on the portrait
  paperTooth(ctx, inner, 0.06);

  // ── territory HINTS: two faint dot-fray fields, one from each goal-end. CardData carries
  //    only the match SUMMARY (not the full odds path), so the hint extent is read from the
  //    FINAL SCORE: a level 1-1 reads as a near-even deadlock → both fields reach ~42% of the
  //    half and fray to a wide draw collapse at the seam. A decisive score would bias the
  //    extents; here the honest read is "deadlock". (The POSTER, which has the full path,
  //    draws the exact final-state territories — see renderPoster.)
  const decided = finalScore.home - finalScore.away;
  const homeExtent = 0.42 + Math.max(-0.16, Math.min(0.16, decided * 0.08));
  const awayExtent = 0.42 - Math.max(-0.16, Math.min(0.16, decided * 0.08));
  const homeInk = teamInk(fixture.home.colors);
  const awayInk = teamInk(fixture.away.colors);

  // print-scale halftone: the theme's cell (7px) is a 1×-screen value; canon dots run
  // ≈1% of the surface width, so scale the cell to the print canvas (benday, not static)
  const printCell = Math.max(8, Math.round(r.w * 0.0165));

  // away field descends from the TOP goal
  drawTerritoryHint(ctx, inner, awayInk, awayExtent, -1, printCell);
  // home field rises from the BOTTOM goal
  drawTerritoryHint(ctx, inner, homeInk, homeExtent, 1, printCell);

  // ── pitch chalk markings over the fields
  pitchMarkings(ctx, inner, INK.pressBlack, Math.max(2, inner.w * 0.006));
  // goal nets top & bottom
  goalNet(ctx, inner.x + inner.w / 2, inner.y + strokeW * 0.5, inner.w * 0.18, inner.h * 0.02, INK.pressBlack);
  goalNet(ctx, inner.x + inner.w / 2, inner.y + inner.h - inner.h * 0.02 - strokeW * 0.5, inner.w * 0.18, inner.h * 0.02, INK.pressBlack);

  // ── the roar-bars skyline: the fan's myRoar buckets, rising from THEIR goal-end.
  //    The fan roots home → the skyline rises from the bottom in the home team's colour.
  const skyH = inner.h * 0.46; // the skyline occupies the fan's half
  const fromBottom = fanSide === 'home';
  const skyArea: Rect = {
    x: inner.x + inner.w * 0.02,
    y: fromBottom ? inner.y + inner.h - skyH : inner.y,
    w: inner.w * 0.96,
    h: skyH,
  };
  const fanInk = fanSide === 'home' ? homeInk : awayInk;
  ctx.save();
  ctx.beginPath();
  ctx.rect(inner.x, inner.y, inner.w, inner.h);
  ctx.clip();
  // canon roarbars are SINGLE beaded dot-strings per bar: set the cell ≈ the bar width
  // so each bar is one column of chunky dots with clear cream gaps between bars
  const skyGap = 0.34;
  const skyBarW = skyArea.w / (card.myRoar.length + (card.myRoar.length - 1) * skyGap);
  skyline(ctx, skyArea, {
    values: card.myRoar,
    ink: fanInk,
    fromBottom,
    seed: 4242,
    gap: skyGap,
    cell: Math.max(6, skyBarW * 0.92),
  });
  ctx.restore();

  // re-strike the fan-end box lines OVER the skyline so the goalmouth stays legible
  // (canon: the bottom penalty box reads through the field)
  const boxW = inner.w * 0.44;
  const boxH = inner.h * 0.16;
  const sixW = inner.w * 0.22;
  const sixH = inner.h * 0.07;
  ctx.strokeStyle = rgb(INK.pressBlack);
  ctx.lineWidth = Math.max(2, inner.w * 0.006);
  if (fromBottom) {
    ctx.strokeRect(inner.x + (inner.w - boxW) / 2, inner.y + inner.h - boxH, boxW, boxH);
    ctx.strokeRect(inner.x + (inner.w - sixW) / 2, inner.y + inner.h - sixH, sixW, sixH);
  } else {
    ctx.strokeRect(inner.x + (inner.w - boxW) / 2, inner.y, boxW, boxH);
    ctx.strokeRect(inner.x + (inner.w - sixW) / 2, inner.y, sixW, sixH);
  }

  // ── the goal starburst pin(s): each goal pinned at its minute along the timeline.
  //    x = minute mapped across the pitch width (0..90+ → left..right). HONESTY (§3):
  //    a goal erupts at the REAL goal mouth — the CONCEDING side's net. home scored →
  //    the ball is in the AWAY net (top); away scored → the HOME net (bottom). The stem
  //    anchors at that goal line; the pin floats into the conceding half.
  const goals = card.matchRelic.goals;
  for (const g of goals) {
    if (g.minute === null) continue;
    const isFanGoal = g.side === fanSide;
    const concededAtTop = g.side === 'home'; // home scored → away's net at the top
    const mx = inner.x + inner.w * (0.1 + 0.8 * Math.min(1, g.minute / 95));
    const pinR = isFanGoal ? inner.w * 0.105 : inner.w * 0.09;
    const anchorY = concededAtTop ? inner.y + inner.h * 0.02 : inner.y + inner.h * 0.98;
    const pinY = concededAtTop ? inner.y + inner.h * 0.36 : inner.y + inner.h * 0.64;
    // stem from the conceding goal line to the pin
    ctx.strokeStyle = rgb(INK.pressBlack);
    ctx.lineWidth = Math.max(2, inner.w * 0.008);
    ctx.beginPath();
    ctx.moveTo(mx, anchorY);
    ctx.lineTo(mx, pinY);
    ctx.stroke();
    starburstPin(ctx, mx, pinY, pinR, `${g.minute}'`, INK.pressBlack, INK.newsprint);
  }
}

/**
 * A single dot-fray territory field HINT. dir=1 rises from the bottom goal, dir=-1
 * descends from the top goal. `extent` = fraction of the half-height the field reaches
 * from its goal-end toward the 50% seam. Solid-ish core near the goal, fraying to
 * scattered specks at the working edge (the honest draw collapse), full-ink dots.
 */
function drawTerritoryHint(ctx: CanvasRenderingContext2D, area: Rect, ink: RGB, extent: number, dir: 1 | -1, cell?: number): void {
  const mid = area.y + area.h / 2;
  const half = area.h / 2;
  // the working edge y: `extent` of the half away from the goal-end toward the seam
  const goalY = dir === 1 ? area.y + area.h : area.y;
  const edge = dir === 1 ? goalY - extent * half * 2 : goalY + extent * half * 2;
  const bandTop = Math.min(goalY, edge);
  const bandBot = Math.max(goalY, edge);
  const bounds: Rect = { x: area.x, y: bandTop, w: area.w, h: bandBot - bandTop };
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  halftoneField(
    ctx,
    bounds,
    ink,
    (_px, py) => {
      // along = 0 at the goal-end, 1 at the working edge (near the seam)
      const span = Math.abs(goalY - edge) || 1;
      const along = Math.max(0, Math.min(1, Math.abs(py - goalY) / span));
      const core = 0.55; // hint is deliberately light so pitch chalk + skyline read on top
      if (along <= GEOMETRY.dissolveStart) return core;
      const u = (along - GEOMETRY.dissolveStart) / (1 - GEOMETRY.dissolveStart);
      return Math.max(0.02, core * (1 - Math.pow(u, 2.0)));
    },
    { seed: dir === 1 ? 11 : 91, cell },
  );
  ctx.restore();
  void mid;
}

/** The reserved diagonal: THE STANDS band (§6.12) at 14° across the lower third. */
function standsBand(ctx: CanvasRenderingContext2D, ground: Rect, card: CardData, endCode: string, cy: number): void {
  const angle = (COMPONENTS.standsBand.angleDeg * Math.PI) / 180;
  const bandH = ground.h * 0.1;
  ctx.save();
  // clip to the ground so the diagonal never bleeds past the keyline
  ctx.beginPath();
  ctx.rect(ground.x, ground.y, ground.w, ground.h);
  ctx.clip();
  ctx.translate(ground.x + ground.w / 2, cy);
  ctx.rotate(-angle);
  const bandW = ground.w * 1.6;
  const bx = -bandW / 2;
  ctx.fillStyle = rgb(INK.pressBlack);
  ctx.fillRect(bx, -bandH / 2, bandW, bandH);
  // Layout the band as two zones so the label + END code never collide (canon: THE STANDS
  // fills the left, END {code} sits clearly to its right, both cream on the black band).
  ctx.textBaseline = 'middle';
  const contentW = ground.w * 0.9; // the visible content span on the band
  const contentL = -contentW / 2;
  const midY = bandH * 0.04;
  // END code (Doto) reserves the right ~26%
  const endLabel = `END ${endCode}`;
  const endPx = bandH * 0.42;
  ctx.font = fontData(endPx, 600);
  const endW = trackedWidth(ctx, endLabel, endPx * 0.06);
  // THE STANDS (Anybody) fits the left zone up to where END begins
  const standsZoneW = contentW * 0.66;
  const label = 'THE STANDS';
  const standsPx = fitTracked(ctx, label, standsZoneW, bandH * 0.62, bandH * 0.02, (p) => fontDisplay(p, 900));
  ctx.fillStyle = rgb(INK.newsprint);
  trackedText(ctx, label, contentL, midY, standsPx * 0.02, 'left');
  ctx.font = fontData(endPx, 600);
  ctx.fillStyle = rgb(INK.newsprint);
  trackedText(ctx, endLabel, contentL + contentW - endW, midY, endPx * 0.06, 'left');
  ctx.restore();
  void card;
}

/** The footer strip (§10): flag blocks + ROOOT · MATCH Nº · fixture + edition line. */
function footer(ctx: CanvasRenderingContext2D, ground: Rect, card: CardData, strokeW: number): void {
  const { fixture } = card.matchRelic;
  const fh = ground.w * COMPONENTS.card.footerHeight * 1.15;
  const fy = ground.y + ground.h - fh;
  const r: Rect = { x: ground.x, y: fy, w: ground.w, h: fh };
  keyBox(ctx, r, INK.newsprint, strokeW);
  // flag blocks at each end
  const flagW = fh * 1.5;
  const pad = strokeW + fh * 0.14;
  const flagH = fh - pad * 2;
  flagBlock(ctx, { x: r.x + pad, y: r.y + pad, w: flagW, h: flagH }, fixture.home.colors, Math.max(1.5, strokeW * 0.6));
  flagBlock(ctx, { x: r.x + r.w - pad - flagW, y: r.y + pad, w: flagW, h: flagH }, fixture.away.colors, Math.max(1.5, strokeW * 0.6));
  // center text: ROOOT · MATCH Nº 61 · AUS-EGY  (Doto)
  ctx.fillStyle = rgb(INK.pressBlack);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Tournament match number: PLACEHOLDER for the specimen (the capture carries no match
  // ordinal). Distinct from the edition serial on purpose so the two marks never conflate.
  const matchNo = 58;
  const fixtureCode = `${fixture.home.code}-${fixture.away.code}`;
  const centerText = `ROOOT · MATCH Nº ${matchNo} · ${fixtureCode}`;
  const maxW = r.w - (flagW + pad) * 2 - fh * 0.4;
  const usedPx = fitTracked(ctx, centerText, maxW, fh * 0.42, fh * 0.03, (px) => fontData(px, 500));
  trackedText(ctx, centerText, r.x + r.w / 2, r.y + r.h / 2 + usedPx * 0.02, usedPx * 0.03, 'center');
  void GRID;
}

/**
 * Render the personal trading card. Returns the offscreen canvas (call toBlob to
 * get the PNG). Fonts should be loaded first (ensureRelicFonts).
 */
export function renderCard(card: CardData): HTMLCanvasElement {
  const c = makeCanvas(CARD_W, CARD_H);
  const ctx = ctxOf(c);
  ctx.imageSmoothingEnabled = true;

  const full: Rect = { x: 0, y: 0, w: CARD_W, h: CARD_H };
  // Loud ground per the §1 Topps rule (shared law, lib/pop-ground): a rotation
  // loud NEITHER team owns — AUS–EGY grounds in Kickoff Sky, never poppy
  // beside Egypt crimson. Cream border, Press-Black keyline.
  const fx = card.matchRelic.fixture;
  const ground = chooseGround(teamInk(fx.home.colors), teamInk(fx.away.colors));
  const frame = paintFrame(ctx, full, ground, INK.newsprint);
  const g = frame.ground;
  const strokeW = Math.max(2, CARD_W * GRID.keylineInner);
  const chipStroke = Math.max(3, CARD_W * GRID.keyline * 0.7);

  // paper tooth on the loud ground (§5 whisper)
  paperTooth(ctx, g, 0.05);

  // ── layout: four corner stat chips in the true corners, the portrait window centered
  //    between them, THE STANDS diagonal in a clear band below the chips, footer at the
  //    very bottom. Mirrors card-front-canonical's vertical rhythm.
  const chipW = g.w * 0.185;
  const chipH = chipW * 1.14;
  const margin = g.w * 0.035;
  const r = card.ratings;

  // vertical zones (fractions of the ground height)
  const topChipY = g.y + margin;
  const botChipY = g.y + g.h * 0.565; // FOR / PRE sit here, clearly above the diagonal
  const bandCenterY = g.y + g.h * 0.83; // the diagonal lives between the bottom chips + footer

  // portrait window: centered column between the side chips
  const portX = g.x + chipW + margin * 1.4;
  const portW = g.w - (chipW + margin * 1.4) * 2;
  const scoreH = portW * 0.16;
  const portY = topChipY;
  const portBottom = botChipY + chipH * 0.42; // let the portrait run a touch past the chip tops
  miniScoreboard(ctx, { x: portX, y: portY, w: portW, h: scoreH }, card, strokeW);
  portrait(ctx, { x: portX, y: portY + scoreH + margin * 0.5, w: portW, h: portBottom - (portY + scoreH + margin * 0.5) }, card, strokeW);

  // ── four corner chips: LOU top-left, pop-ball + FTH top-right, FOR bottom-left, PRE bottom-right
  statChip(ctx, { x: g.x + margin, y: topChipY, w: chipW, h: chipH }, 'LOU', r.LOU, chipStroke);
  const popChip: Rect = { x: g.x + g.w - margin - chipW, y: topChipY, w: chipW, h: chipW };
  keyBox(ctx, popChip, INK.newsprint, chipStroke);
  popBall(
    ctx,
    popChip.x + popChip.w / 2,
    popChip.y + popChip.h / 2,
    popChip.w * 0.36,
    teamInk(card.matchRelic.fixture.home.colors),
    teamInk(card.matchRelic.fixture.away.colors),
    0.35,
  );
  statChip(ctx, { x: g.x + g.w - margin - chipW, y: topChipY + chipW + margin * 0.5, w: chipW, h: chipH }, 'FTH', r.FTH, chipStroke);
  statChip(ctx, { x: g.x + margin, y: botChipY, w: chipW, h: chipH }, 'FOR', r.FOR, chipStroke);
  statChip(ctx, { x: g.x + g.w - margin - chipW, y: botChipY, w: chipW, h: chipH }, 'PRE', r.PRE, chipStroke);

  // ── the reserved diagonal THE STANDS band (in the clear zone below the bottom chips)
  standsBand(ctx, g, card, endCodeFor(card), bandCenterY);

  // ── footer strip + edition line
  footer(ctx, g, card, strokeW);
  editionLine(ctx, g, card, strokeW);

  return c;
}

/** derive the END code shown on THE STANDS band from the fan's side. */
function endCodeFor(card: CardData): string {
  return card.side === 'home' ? card.matchRelic.fixture.home.code : card.matchRelic.fixture.away.code;
}

/**
 * The edition line (§10) — printed in the reserved footer-left serial slot, ABOVE the
 * footer band on the loud ground, in Doto. Format: Nº 000120 / 5000.
 */
function editionLine(ctx: CanvasRenderingContext2D, ground: Rect, card: CardData, strokeW: number): void {
  const fh = ground.w * COMPONENTS.card.footerHeight * 1.15;
  const lineY = ground.y + ground.h - fh - ground.h * 0.018;
  const px = fh * COMPONENTS.memento.serialTextScale;
  const { editionSep } = COMPONENTS.memento.serialFormat;
  const ed = card.edition.editionSize;
  const text = ed ? `${serialText(card.edition.serial)}${editionSep}${ed}` : serialText(card.edition.serial);
  ctx.fillStyle = rgb(INK.newsprint);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.font = fontData(px, 500);
  // a tiny press-black plate behind it so cream reads on the poppy ground (legibility gate)
  const w = trackedWidth(ctx, text, px * 0.06);
  const padX = px * 0.4;
  ctx.fillStyle = rgba(INK.pressBlack, 0.9);
  ctx.fillRect(ground.x + strokeW, lineY - px - px * 0.24, w + padX * 2, px + px * 0.34);
  ctx.fillStyle = rgb(INK.newsprint);
  trackedText(ctx, text, ground.x + strokeW + padX, lineY, px * 0.06, 'left');
}

export const CARD_SIZE = { w: CARD_W, h: CARD_H } as const;
