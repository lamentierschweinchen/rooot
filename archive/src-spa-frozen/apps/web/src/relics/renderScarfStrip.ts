/**
 * ROOOT relics — renderScarfStrip (STRETCH; owned by the relics lane).
 *
 * A KNIT-RENDER SPIKE: one match as a jacquard scarf SEGMENT (a tall strip),
 * previewing the RUN SCARF (segments accumulate per match). Pure:
 * MatchRelicData → offscreen canvas (600×2100, a tall knit strip).
 *
 * The knit language:
 *  · The arc as KNIT STRIPE ROWS — each row = a match time bucket (sampled from the
 *    odds path). Row COLOUR = the LEADING side's team colour at that time (draw = cream).
 *    Row band WIDTH within the strip is modulated by |lead| (how decisive the market was).
 *  · GOALS as MEDAL-GOLD metallic weft rows — a bright gold band knit across the strip
 *    at each goal's position in the arc.
 *  · SILKSCREEN letterforms for the fixture code (the knit twin of Doto, §4).
 *  · Visible STITCH TEXTURE — a square pixel grid; every "stitch" is a little square cell
 *    with a knit V-notch, so the strip reads as woven, not printed.
 *  · Cream + black colourway (the scarf ground is Press-Black; the stitches are the inks).
 *
 * This is a SPIKE: it proves the knit render reads. It is not wired to a real scarf yet.
 */

import type { MatchRelicData, OddsPathPoint } from '@contracts/relic';
import {
  INK,
  rgb,
  type RGB,
  makeCanvas,
  ctxOf,
  fontKnit,
  trackedText,
  hexToRgb,
  mulberry32,
  type Rect,
} from './paint';

const SCARF_W = 600;
const SCARF_H = 2100;
/** stitch cell size in px (the pixel grid) — coarse enough to read as knit. */
const STITCH = 18;

function teamInk(colors: readonly [string, string]): RGB {
  return hexToRgb(colors[0]);
}

/** Sample the odds path into N rows; each row → leading side + |lead| magnitude. */
interface KnitRow {
  /** dominant ink for the row */
  ink: RGB;
  /** 0..1 how decisive (|pLead - pOther|) — modulates the stitch density/brightness */
  lead: number;
  /** true if this row sits on a goal minute → gold weft */
  goal: boolean;
}

function buildRows(match: MatchRelicData, nRows: number): KnitRow[] {
  // THE ROW AXIS IS MATCH MINUTES ("each row = a time bucket" — the football-native
  // bucket is the minute). Pre-match drift is not part of the worn story; and because
  // goals are minute-labelled on the contract, putting the stripes on the same minute
  // axis makes weft placement exact by construction (no wall-clock/stopped-clock drift).
  const inPlay = match.oddsPath.filter((p): p is OddsPathPoint & { minute: number } => p.minute !== null);
  const homeInk = teamInk(match.fixture.home.colors);
  const awayInk = teamInk(match.fixture.away.colors);
  const rows: KnitRow[] = [];
  const maxMinute = inPlay.length ? Math.max(...inPlay.map((p) => p.minute), 90) : 90;

  // goal weft rows straight from the minute axis
  const goalRows = new Set<number>();
  for (const g of match.goals) {
    if (g.minute === null) continue;
    goalRows.add(Math.round((Math.min(g.minute, maxMinute) / maxMinute) * (nRows - 1)));
  }

  // latest belief per minute bucket (later wall points win — absorbs clock-join overlap)
  const byMinute = new Map<number, OddsPathPoint>();
  for (const p of inPlay) byMinute.set(p.minute, p);

  let lastSeen: OddsPathPoint | undefined = inPlay[0];
  for (let i = 0; i < nRows; i++) {
    const m = Math.round((i / Math.max(1, nRows - 1)) * maxMinute);
    // walk to the freshest point at or before this minute
    for (let mm = m; mm >= 0; mm--) {
      const hit = byMinute.get(mm);
      if (hit) {
        lastSeen = hit;
        break;
      }
    }
    const pHome = lastSeen ? lastSeen.pHome : 1 / 3;
    const pDraw = lastSeen ? lastSeen.pDraw : 1 / 3;
    const pAway = lastSeen ? lastSeen.pAway : 1 / 3;
    // leading side = the max of home/draw/away
    let ink: RGB;
    let lead: number;
    if (pDraw >= pHome && pDraw >= pAway) {
      ink = INK.terraceGrey; // the DRAW knits the law's neutral draw ink (§1) — never cream
      lead = Math.min(1, pDraw - Math.max(pHome, pAway) + 0.25);
    } else if (pHome >= pAway) {
      ink = homeInk;
      lead = Math.min(1, pHome - Math.max(pDraw, pAway) + 0.15);
    } else {
      ink = awayInk;
      lead = Math.min(1, pAway - Math.max(pDraw, pHome) + 0.15);
    }
    rows.push({ ink, lead: Math.max(0.12, lead), goal: goalRows.has(i) });
  }
  return rows;
}

/** Draw one knit stitch: a small square cell with a V-notch, in the given ink. */
function knitStitch(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, ink: RGB, bright: number): void {
  // base cell
  ctx.fillStyle = rgb(ink);
  ctx.fillRect(x, y, size - 1, size - 1);
  // the knit V — two short diagonal strokes darker/lighter, giving the woven look
  const notch = size * 0.34;
  ctx.strokeStyle = rgb(INK.pressBlack);
  ctx.globalAlpha = 0.18 + 0.14 * bright;
  ctx.lineWidth = Math.max(1, size * 0.09);
  ctx.beginPath();
  ctx.moveTo(x + size * 0.5, y + size * 0.2);
  ctx.lineTo(x + size * 0.5 - notch, y + size * 0.75);
  ctx.moveTo(x + size * 0.5, y + size * 0.2);
  ctx.lineTo(x + size * 0.5 + notch, y + size * 0.75);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * Render the scarf segment. Returns the offscreen canvas.
 */
export function renderScarfStrip(match: MatchRelicData): HTMLCanvasElement {
  const c = makeCanvas(SCARF_W, SCARF_H);
  const ctx = ctxOf(c);

  // Press-Black scarf ground (the knit backing)
  ctx.fillStyle = rgb(INK.pressBlack);
  ctx.fillRect(0, 0, SCARF_W, SCARF_H);

  // a fringe/border margin of plain cream stitches down each side
  const cols = Math.floor(SCARF_W / STITCH);
  const rowsPx = Math.floor(SCARF_H / STITCH);
  const borderCols = 1;

  // ── header + footer knit panels carry the fixture code in Silkscreen (the knit voice).
  const headerRows = 5;
  const footerRows = 5;
  const arcRows = rowsPx - headerRows - footerRows;
  const rows = buildRows(match, arcRows);
  const rnd = mulberry32(7);

  // header cream band with the HOME tricode
  knitTextBand(ctx, 0, headerRows, cols, match.fixture.home.code, INK.newsprint, INK.pressBlack, rnd);

  // ── the arc: each knit row is a horizontal stripe. |lead| modulates how many center
  //    columns take the dominant ink vs. cream fringe (decisive = wider colour band).
  for (let ri = 0; ri < arcRows; ri++) {
    const row = rows[ri]!;
    const y = (headerRows + ri) * STITCH;
    // band half-width in columns (decisive lead = wider), always leaving the cream fringe
    const usable = cols - borderCols * 2;
    const bandCols = Math.round(usable * (0.35 + 0.6 * row.lead));
    const startCol = borderCols + Math.floor((usable - bandCols) / 2);
    const endCol = startCol + bandCols;
    for (let ci = 0; ci < cols; ci++) {
      const x = ci * STITCH;
      let ink: RGB;
      if (row.goal) {
        // a goal knits a full-width Medal-Gold metallic weft row
        ink = INK.medalGold;
      } else if (ci < borderCols || ci >= cols - borderCols) {
        ink = INK.newsprint; // cream side fringe
      } else if (ci >= startCol && ci < endCol) {
        ink = row.ink; // the dominant belief colour band
      } else {
        ink = INK.newsprint; // cream infill either side of the band
      }
      // slight per-stitch brightness jitter so the knit isn't a flat print
      const bright = 0.4 + 0.4 * rnd();
      knitStitch(ctx, x, y, STITCH, ink, bright);
    }
  }

  // footer cream band with the AWAY tricode
  knitTextBand(ctx, rowsPx - footerRows, footerRows, cols, match.fixture.away.code, INK.newsprint, INK.pressBlack, rnd);

  return c;
}

/**
 * A knit text band: `bandRows` rows of cream stitches with the label knit in Press-Black
 * over the top (Silkscreen). Used for the fixture-code header/footer panels.
 */
function knitTextBand(
  ctx: CanvasRenderingContext2D,
  startRow: number,
  bandRows: number,
  cols: number,
  label: string,
  ground: RGB,
  inkColor: RGB,
  rnd: () => number,
): void {
  const y0 = startRow * STITCH;
  const h = bandRows * STITCH;
  // cream knit ground
  for (let ri = 0; ri < bandRows; ri++) {
    for (let ci = 0; ci < cols; ci++) {
      knitStitch(ctx, ci * STITCH, (startRow + ri) * STITCH, STITCH, ground, 0.4 + 0.4 * rnd());
    }
  }
  // the label knit in Press-Black (Silkscreen), snapped to the stitch grid
  ctx.save();
  // clip so glyph ink lands ON the stitch cells and reads pixelly
  const bandRect: Rect = { x: 0, y: y0, w: cols * STITCH, h };
  ctx.beginPath();
  ctx.rect(bandRect.x, bandRect.y, bandRect.w, bandRect.h);
  ctx.clip();
  ctx.fillStyle = rgb(inkColor);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const px = h * 0.62;
  ctx.font = fontKnit(px, 700);
  trackedText(ctx, label, bandRect.w / 2, y0 + h / 2 + px * 0.02, px * 0.16, 'center');
  ctx.restore();
}

export const SCARF_SIZE = { w: SCARF_W, h: SCARF_H } as const;
