/**
 * ROOOT relics — renderPoster (NEW; owned by the relics lane).
 *
 * The MATCH as the ownable print — a 2:3 portrait poster at PRINT QUALITY
 * (1400×2100). Pure: MatchRelicData → offscreen canvas. Fonts loaded first.
 *
 * Per the memento law (§10) + stage-prematch-canonical framing:
 *  · Loud ground FRAME (Poppy), cream border + Press-Black keyline (§2).
 *  · A SCOREBOARD band up top: pop-ball, flag blocks, tricodes, dot-matrix FINAL score.
 *  · The PITCH with the FINAL-STATE dot-fray territories (extent = the LAST odds belief,
 *    the real end-of-match tide) + ALL goal STARBURST pins at their minutes (§6.8).
 *  · Two ROOTED-count bands (both ends), honest counts (Doto) with pictogram people —
 *    NEVER a percentage (§3). [rooted counts here are SYNTHETIC dev specimens — see the
 *    builder; the poster prints them as counts, never dressed as market data.]
 *  · A VERDICT line if the stands verdict names a winner (Anybody).
 *  · A caption strip (fixture · date · frame name) + the EDITION line (caption-left slot).
 */

import { GRID, COMPONENTS, GEOMETRY } from '../lib/theme';
import { chooseGround } from '../lib/pop-ground';
import type { MatchRelicData, OddsPathPoint } from '@contracts/relic';
import type { Side } from '@contracts/crowd';
import {
  INK,
  rgb,
  type RGB,
  makeCanvas,
  ctxOf,
  paintFrame,
  keyBox,
  paperTooth,
  starburstPin,
  popBall,
  halftoneField,
  goalNet,
  fontData,
  fontDisplay,
  trackedText,
  trackedWidth,
  fitTracked,
  hexToRgb,
  type Rect,
} from './paint';

const POSTER_W = 1400;
const POSTER_H = 2100;

function serialText(serial: number): string {
  const { prefix, pad } = COMPONENTS.memento.serialFormat;
  return `${prefix} ${String(serial).padStart(pad, '0')}`;
}
function teamInk(colors: readonly [string, string]): RGB {
  return hexToRgb(colors[0]);
}
function labelInkOn(ground: RGB): RGB {
  const lum = 0.299 * ground[0] + 0.587 * ground[1] + 0.114 * ground[2];
  return lum > 150 ? INK.pressBlack : INK.newsprint;
}

/** Small keyline flag block (color | cream | color). */
function flagBlock(ctx: CanvasRenderingContext2D, r: Rect, colors: readonly [string, string], strokeW: number): void {
  const a = hexToRgb(colors[0]);
  const b = hexToRgb(colors[1]);
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

/** A row of little pictogram people (crowd headcount glyph) — no faces. */
function peopleRow(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, count: number, ink: RGB): number {
  ctx.save();
  ctx.fillStyle = rgb(ink);
  const pw = h * 0.5;
  const gap = pw * 0.34;
  let cx = x;
  for (let i = 0; i < count; i++) {
    // head
    ctx.beginPath();
    ctx.arc(cx + pw / 2, y + h * 0.24, h * 0.16, 0, Math.PI * 2);
    ctx.fill();
    // torso (a rounded trapezoid)
    ctx.beginPath();
    ctx.moveTo(cx + pw * 0.12, y + h);
    ctx.lineTo(cx + pw * 0.2, y + h * 0.44);
    ctx.quadraticCurveTo(cx + pw / 2, y + h * 0.32, cx + pw * 0.8, y + h * 0.44);
    ctx.lineTo(cx + pw * 0.88, y + h);
    ctx.closePath();
    ctx.fill();
    cx += pw + gap;
  }
  ctx.restore();
  return cx - x;
}

/** The final belief from the last odds point (the real end-of-match tide). */
function finalBelief(path: OddsPathPoint[]): { pHome: number; pDraw: number; pAway: number } {
  const last = path.length ? path[path.length - 1] : undefined;
  if (!last) return { pHome: 1 / 3, pDraw: 1 / 3, pAway: 1 / 3 };
  return { pHome: last.pHome, pDraw: last.pDraw, pAway: last.pAway };
}

/**
 * The pitch: FINAL-state dot-fray territories (extent = final belief, clamped to the
 * legible band) + all goal pins. away descends from the top goal, home rises from the
 * bottom goal, the draw collapse sits at the seam.
 */
function pitch(ctx: CanvasRenderingContext2D, r: Rect, match: MatchRelicData, strokeW: number): void {
  const { fixture } = match;
  keyBox(ctx, r, INK.newsprint, strokeW);
  const inner: Rect = { x: r.x + strokeW, y: r.y + strokeW, w: r.w - strokeW * 2, h: r.h - strokeW * 2 };
  paperTooth(ctx, inner, 0.05);

  const belief = finalBelief(match.oddsPath);
  const clampP = (p: number): number => Math.max(GEOMETRY.minRenderP, Math.min(GEOMETRY.maxRenderP, p));
  const pHome = clampP(belief.pHome);
  const pAway = clampP(belief.pAway);
  // each field's extent = its win probability, measured as a fraction of the HALF-pitch
  // from the goal-end to the seam (so a 42% team fills 84% of its half; the draw collapse
  // is the remaining sliver around the seam).
  const homeInk = teamInk(fixture.home.colors);
  const awayInk = teamInk(fixture.away.colors);
  // print-scale benday cell (~canon dot coarseness: ≈1.5% of the pitch width)
  const printCell = Math.max(8, Math.round(inner.w * 0.016));
  drawTerritory(ctx, inner, awayInk, pAway, -1, printCell);
  drawTerritory(ctx, inner, homeInk, pHome, 1, printCell);

  // the constant Press-Black 50% seam (§3 — survives, never moves)
  const seamY = inner.y + inner.h * GEOMETRY.halfwaySeam;
  ctx.strokeStyle = rgb(INK.pressBlack);
  ctx.lineWidth = Math.max(2, inner.h * GEOMETRY.seamWeight);
  ctx.beginPath();
  ctx.moveTo(inner.x, seamY);
  ctx.lineTo(inner.x + inner.w, seamY);
  ctx.stroke();

  // pitch chalk markings (light, on top of the fields)
  drawPitchLines(ctx, inner, INK.pressBlack, Math.max(2, inner.w * 0.005));
  goalNet(ctx, inner.x + inner.w / 2, inner.y, inner.w * 0.16, inner.h * 0.014, INK.pressBlack);
  goalNet(ctx, inner.x + inner.w / 2, inner.y + inner.h - inner.h * 0.014, inner.w * 0.16, inner.h * 0.014, INK.pressBlack);

  // ── all goal starburst pins at their minutes. x = minute across the width; y biased to
  //    the scoring side's half so the pin sits over the territory that earned it.
  ctx.save();
  ctx.beginPath();
  ctx.rect(inner.x, inner.y, inner.w, inner.h);
  ctx.clip();
  for (const g of match.goals) {
    if (g.minute === null) continue;
    const mx = inner.x + inner.w * (0.12 + 0.76 * Math.min(1, g.minute / 95));
    // HONESTY (§3): the eruption lives at the CONCEDING side's goal mouth — home scored
    // → the away net (top half); away scored → the home net (bottom half).
    const my = g.side === 'home' ? inner.y + inner.h * 0.3 : inner.y + inner.h * 0.7;
    const pinR = inner.w * 0.075;
    // stem to the conceding goal line
    const anchorY = g.side === 'home' ? inner.y + inner.h * 0.015 : inner.y + inner.h * 0.985;
    ctx.strokeStyle = rgb(INK.pressBlack);
    ctx.lineWidth = Math.max(2, inner.w * 0.006);
    ctx.beginPath();
    ctx.moveTo(mx, anchorY);
    ctx.lineTo(mx, my);
    ctx.stroke();
    starburstPin(ctx, mx, my, pinR, `${g.minute}'`, INK.pressBlack, INK.newsprint);
  }
  ctx.restore();
}

/** One final-state dot-fray territory field. dir=1 rises from bottom, -1 from top. */
function drawTerritory(ctx: CanvasRenderingContext2D, area: Rect, ink: RGB, prob: number, dir: 1 | -1, cell?: number): void {
  const half = area.h / 2;
  const goalY = dir === 1 ? area.y + area.h : area.y;
  // extent as a fraction of the half; prob in [0..1] → reaches prob*2 of the half toward seam
  const reach = Math.min(1, prob * 2) * half;
  const edge = dir === 1 ? goalY - reach : goalY + reach;
  const bandTop = Math.min(goalY, edge);
  const bandBot = Math.max(goalY, edge);
  const bounds: Rect = { x: area.x, y: bandTop, w: area.w, h: Math.max(1, bandBot - bandTop) };
  // LEGIBLE-SLIVER rule (GEOMETRY.minRenderP intent): when the whole field is only a few
  // dot rows tall (a 2% tail), skip the fray — print it as a solid-coverage band so the
  // sliver reads as a deliberate mark at the goal mouth, never as stray noise.
  const sliver = Math.abs(goalY - edge) < (cell ?? 14) * 4;
  ctx.save();
  ctx.beginPath();
  ctx.rect(area.x, area.y, area.w, area.h);
  ctx.clip();
  halftoneField(
    ctx,
    bounds,
    ink,
    (_px, py) => {
      if (sliver) return 1;
      const span = Math.abs(goalY - edge) || 1;
      const along = Math.max(0, Math.min(1, Math.abs(py - goalY) / span));
      // dense core → fray to floor at the working edge (the honest collapse toward the draw)
      if (along <= 0.5) return 0.92;
      const u = (along - 0.5) / 0.5;
      return Math.max(0.04, 0.92 * (1 - Math.pow(u, 2.2)));
    },
    { seed: dir === 1 ? 21 : 87, cell },
  );
  ctx.restore();
}

/** Pitch chalk lines (touchline, centre circle, penalty boxes) — thin strokes. */
function drawPitchLines(ctx: CanvasRenderingContext2D, r: Rect, ink: RGB, weight: number): void {
  ctx.save();
  ctx.strokeStyle = rgb(ink);
  ctx.lineWidth = weight;
  ctx.lineCap = 'square';
  ctx.strokeRect(r.x + weight / 2, r.y + weight / 2, r.w - weight, r.h - weight);
  ctx.beginPath();
  ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w * 0.15, 0, Math.PI * 2);
  ctx.stroke();
  const boxW = r.w * 0.46;
  const boxH = r.h * 0.14;
  const sixW = r.w * 0.24;
  const sixH = r.h * 0.06;
  for (const top of [true, false]) {
    const bx = r.x + (r.w - boxW) / 2;
    const by = top ? r.y : r.y + r.h - boxH;
    ctx.strokeRect(bx, by, boxW, boxH);
    const sx = r.x + (r.w - sixW) / 2;
    const sy = top ? r.y : r.y + r.h - sixH;
    ctx.strokeRect(sx, sy, sixW, sixH);
    ctx.beginPath();
    ctx.arc(r.x + r.w / 2, top ? r.y + boxH * 0.66 : r.y + r.h - boxH * 0.66, weight * 1.2, 0, Math.PI * 2);
    ctx.fillStyle = rgb(ink);
    ctx.fill();
  }
  ctx.restore();
}

/** The scoreboard band: pop-ball · flag · TRI · FINAL score · TRI · flag. */
function scoreboard(ctx: CanvasRenderingContext2D, r: Rect, match: MatchRelicData, strokeW: number): void {
  const { fixture, finalScore } = match;
  keyBox(ctx, r, INK.newsprint, strokeW);
  const inX = r.x + strokeW;
  const inY = r.y + strokeW;
  const inH = r.h - strokeW * 2;
  const inW = r.w - strokeW * 2;
  // pop-ball at the left
  const ballR = inH * 0.42;
  popBall(ctx, inX + inH * 0.5, inY + inH * 0.5, ballR, teamInk(fixture.home.colors), teamInk(fixture.away.colors), 0.3);
  // flag blocks flanking the score
  const flagW = inH * 0.9;
  const flagH = inH * 0.62;
  const flagY = inY + (inH - flagH) / 2;
  // center score box
  const scoreW = inW * 0.24;
  const scoreX = inX + inW / 2 - scoreW / 2;
  ctx.fillStyle = rgb(INK.pressBlack);
  ctx.fillRect(scoreX, inY, scoreW, inH);
  ctx.fillStyle = rgb(INK.newsprint);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = fontData(inH * 0.56, 600);
  ctx.fillText(`${finalScore.home}-${finalScore.away}`, scoreX + scoreW / 2, inY + inH / 2 + inH * 0.02);
  // home tricode + flag left of the score (fillStyle re-set per tricode — flagBlock
  // mutates fillStyle, and inheriting it once printed the away code in a team colour)
  ctx.font = fontDisplay(inH * 0.4, 900);
  const triY = inY + inH / 2 + inH * 0.02;
  ctx.fillStyle = rgb(INK.pressBlack);
  trackedText(ctx, fixture.home.code, scoreX - inW * 0.1, triY, inH * 0.02, 'center');
  flagBlock(ctx, { x: inX + inH * 1.05, y: flagY, w: flagW, h: flagH }, fixture.home.colors, Math.max(1.5, strokeW * 0.6));
  // away tricode + flag right of the score
  ctx.font = fontDisplay(inH * 0.4, 900);
  ctx.fillStyle = rgb(INK.pressBlack);
  trackedText(ctx, fixture.away.code, scoreX + scoreW + inW * 0.1, triY, inH * 0.02, 'center');
  flagBlock(ctx, { x: inX + inW - inH * 1.05 - flagW, y: flagY, w: flagW, h: flagH }, fixture.away.colors, Math.max(1.5, strokeW * 0.6));
}

/** A rooted-count band (honest counts, never a %). label side + count + people row. */
function rootedBand(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  count: number,
  teamColors: readonly [string, string],
  strokeW: number,
): void {
  // press-black band with a flag block, pictogram people, and the count in Doto (gold)
  ctx.fillStyle = rgb(INK.pressBlack);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = rgb(INK.pressBlack);
  ctx.lineWidth = strokeW;
  ctx.strokeRect(r.x + strokeW / 2, r.y + strokeW / 2, r.w - strokeW, r.h - strokeW);
  const pad = r.h * 0.18;
  const flagW = r.h * 1.4;
  const flagH = r.h - pad * 2;
  flagBlock(ctx, { x: r.x + pad, y: r.y + pad, w: flagW, h: flagH }, teamColors, Math.max(1.5, strokeW * 0.6));
  // people row near the flag
  peopleRow(ctx, r.x + pad + flagW + pad, r.y + pad, flagH, 4, teamInk(teamColors));
  // the count (Doto, gold — the rare reward ink is fine for the headcount readout)
  ctx.fillStyle = rgb(INK.medalGold);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const px = r.h * 0.46;
  ctx.font = fontData(px, 600);
  const label = `${count.toLocaleString('en-US')} ROOTED`;
  trackedText(ctx, label, r.x + r.w - pad, r.y + r.h / 2 + px * 0.02, px * 0.04, 'right');
}

/**
 * Render the match poster. Returns the offscreen canvas.
 */
export function renderPoster(match: MatchRelicData, edition: { serial: number; editionSize: number | null; caption: { fixture: string; dateISO: string; frameName: string } }): HTMLCanvasElement {
  const c = makeCanvas(POSTER_W, POSTER_H);
  const ctx = ctxOf(c);

  const full: Rect = { x: 0, y: 0, w: POSTER_W, h: POSTER_H };
  // §1 Topps rule (shared law, lib/pop-ground): ground in a loud neither team owns.
  const ground = chooseGround(hexToRgb(match.fixture.home.colors[0]), hexToRgb(match.fixture.away.colors[0]));
  const frame = paintFrame(ctx, full, ground, INK.newsprint);
  const g = frame.ground;
  const strokeW = Math.max(2, POSTER_W * GRID.keylineInner);
  paperTooth(ctx, g, 0.05);

  const margin = g.w * 0.035;
  const colX = g.x + margin;
  const colW = g.w - margin * 2;

  // ── scoreboard band
  const sbH = g.h * 0.075;
  const sbY = g.y + margin;
  scoreboard(ctx, { x: colX, y: sbY, w: colW, h: sbH }, match, strokeW);

  // ── top rooted band (away end)
  const bandH = g.h * 0.05;
  const topBandY = sbY + sbH + margin * 0.6;
  rootedBand(ctx, { x: colX, y: topBandY, w: colW, h: bandH }, awayRooted(match), match.fixture.away.colors, strokeW);

  // ── the pitch (fills the middle)
  const pitchY = topBandY + bandH + margin * 0.6;
  const captionH = g.h * 0.11;
  const bottomBandY = g.y + g.h - captionH - margin * 0.6 - bandH;
  const pitchH = bottomBandY - pitchY - margin * 0.6;
  pitch(ctx, { x: colX, y: pitchY, w: colW, h: pitchH }, match, strokeW);

  // ── bottom rooted band (home end)
  rootedBand(ctx, { x: colX, y: bottomBandY, w: colW, h: bandH }, homeRooted(match), match.fixture.home.colors, strokeW);

  // ── caption strip + verdict + edition
  const capY = g.y + g.h - captionH;
  captionStrip(ctx, { x: colX, y: capY, w: colW, h: captionH }, match, edition, strokeW);

  return c;
}

/** SYNTHETIC rooted counts pulled from the verdict-adjacent specimen (render-only). */
function homeRooted(match: MatchRelicData): number {
  // derive a stable count from the specimen verdict presence score (not real attendance)
  return 12431 + Math.round(match.verdict.scores.home.presence);
}
function awayRooted(match: MatchRelicData): number {
  return 8207 + Math.round(match.verdict.scores.away.presence);
}

/** The caption strip: verdict line (Anybody) + fixture·date·frame (Doto) + edition line. */
function captionStrip(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  match: MatchRelicData,
  edition: { serial: number; editionSize: number | null; caption: { fixture: string; dateISO: string; frameName: string } },
  strokeW: number,
): void {
  // verdict band (press-black) on top, caption (cream) below
  const verdictH = r.h * 0.44;
  const vb: Rect = { x: r.x, y: r.y, w: r.w, h: verdictH };
  ctx.fillStyle = rgb(INK.pressBlack);
  ctx.fillRect(vb.x, vb.y, vb.w, vb.h);
  // verdict line: "END {WINNER} WON THE STANDS" if a winner is named
  const winner = match.verdict.winner;
  let verdictText = 'THE STANDS · DEADLOCK';
  if (winner === 'home') verdictText = `END ${match.fixture.home.code} WON THE STANDS`;
  else if (winner === 'away') verdictText = `END ${match.fixture.away.code} WON THE STANDS`;
  ctx.fillStyle = rgb(INK.newsprint);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const vpx = fitTracked(ctx, verdictText, vb.w * 0.9, verdictH * 0.5, verdictH * 0.03, (px) => fontDisplay(px, 900));
  trackedText(ctx, verdictText, vb.x + vb.w / 2, vb.y + verdictH / 2 + vpx * 0.02, vpx * 0.03, 'center');

  // caption row (cream, keyline)
  const cap: Rect = { x: r.x, y: r.y + verdictH, w: r.w, h: r.h - verdictH };
  keyBox(ctx, cap, INK.newsprint, strokeW);
  ctx.fillStyle = rgb(INK.pressBlack);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const dateNice = edition.caption.dateISO;
  const capText = `${edition.caption.fixture} · ${dateNice} · ${edition.caption.frameName}`;
  const midY = cap.y + cap.h / 2 + cap.h * 0.02;
  // edition line on the LEFT (caption-left slot §10), caption text mirrored right
  const edPx = cap.h * 0.34;
  ctx.font = fontData(edPx, 600);
  const sep = COMPONENTS.memento.serialFormat.editionSep;
  const edText = edition.editionSize ? `${serialText(edition.serial)}${sep}${edition.editionSize}` : serialText(edition.serial);
  const edW = trackedWidth(ctx, edText, edPx * 0.05);
  trackedText(ctx, edText, cap.x + strokeW + cap.h * 0.3, midY, edPx * 0.05, 'left');
  // caption text to the right, shrunk to fit remaining space
  const capMaxW = cap.w - edW - cap.h * 1.2 - strokeW * 2;
  const capPx = fitTracked(ctx, capText, capMaxW, cap.h * 0.3, cap.h * 0.02, (px) => fontData(px, 400));
  const capW = trackedWidth(ctx, capText, capPx * 0.02);
  trackedText(ctx, capText, cap.x + cap.w - strokeW - cap.h * 0.3 - capW, midY, capPx * 0.02, 'left');
}

export const POSTER_SIZE = { w: POSTER_W, h: POSTER_H } as const;
