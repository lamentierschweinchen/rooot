/**
 * ROOOT — THE LOOM · the painter (a living, breathing canvas object).
 *
 * Draws the Weave's cloth (weave.ts) as a vertical woven scarf that GROWS one
 * row per match minute, knitting stitch-by-stitch at the live edge as ticks
 * arrive. Geometry + vocabulary are lifted from SHEET Nº 002
 * (design/experiments/loom-system-jul4.html): rows = minutes, chunky stitch
 * tiles split by the minute's real probability triple (home ink | draw cream |
 * away ink), a Press-Black centre seam, minute selvage ticks, quarter-circle
 * goal patches (Bauhaus tile grammar), bare selvage bands.
 *
 * THE THREE TIMESCALES (LOOM-NEXT §"Living and breathing"):
 *  · STITCH (seconds): the live row's stitches shuttle in discretely as ticks
 *    land — mechanical, no easing blur. Each new tick = new stitch columns.
 *  · ROW (minute): a completed row gets a small register snap (a 1px ink jog
 *    that decays) then the cloth advances (scroll follows the live edge).
 *  · MOMENT (events): a goal sews a quarter-circle patch with the scorer's
 *    name and throws ONE register jolt (the whole cloth kicks + settles). The
 *    90' death stops the dye (a ruled SETTLES · DIES band). ET resumes the
 *    weave in a distinguishable register (ET MARKET label, hatched selvage).
 *
 * HONESTY: every stitch = a real tick-fraction of a real minute-row. A row's
 * split is the minute's last settled tick (weave.ts). A row with no ticks yet
 * (silent minute / not-yet-woven) inherits the prior settled split and is drawn
 * calm — it encodes "the market did not speak this minute", which is a datum.
 * Nothing textural encodes nothing.
 *
 * No DOM beyond the one <canvas>; no timers (the harness drives the frame loop
 * and provides _devStep for throttled tabs).
 */

import type { Fixture } from '@contracts/match';
import type { Weave, Row, Patch } from './weave';

export type Colorway = 'newsprint' | 'press-black';

/* the canon palette (lib/theme.ts NEUTRALS + LOUD — copied as literals so the
 * loom stays self-contained and additive; where these disagree with theme.ts,
 * theme.ts is law). */
const INK = '#1A1A18';
const NEWSPRINT = '#F3ECDA';
const SUNBLEACH = '#EDE3C8';
const CREAM_STITCH = '#E8DEC6'; // the draw band's woven cream (slightly deeper than paper)
const GREY = '#B0AEA8';
const GOLD = '#D6A33B';
/* the loom's canonical END INKS (theme.ts LOUD): ultra = the favourite's ink,
 * poppy = the challenger's ink. SHEET Nº 002 assigns ARG=ultra / CPV=poppy for
 * exactly this reason — the two ends must be CHROMATICALLY DISTINCT so a stitch
 * reads as home-or-away at a glance (the legibility gate). We prefer a fixture's
 * real kit colour, but fall back to this pair when the two teams' colours are too
 * close to tell apart woven (ARG blue vs CPV blue collide — see the delete test). */
const ULTRA = '#2049AA';
const POPPY = '#C8504D';

interface Palette {
  ground: string; // page behind the cloth
  clothGap: string; // between rows / stitch gutters
  seam: string; // centre seam + rules
  cream: string; // the draw band
  creamShades: [string, string, string];
  label: string; // whisper-caps label ink
  labelDim: string;
  tick: string; // minute ticks
  selvage: string; // bare selvage band fill
}

/** Two colorways: newsprint ground (cloth on cream paper) / press-black scarf. */
function paletteFor(cw: Colorway): Palette {
  if (cw === 'press-black') {
    return {
      ground: INK,
      clothGap: '#0E0E0D',
      seam: '#000000',
      cream: '#D9CEB0',
      creamShades: ['#D9CEB0', '#CFC4A4', '#E1D7BB'],
      label: NEWSPRINT,
      labelDim: '#9A968C',
      tick: '#C7C1B2',
      selvage: '#242320',
    };
  }
  return {
    ground: NEWSPRINT,
    clothGap: '#E7DEC8',
    seam: INK,
    cream: CREAM_STITCH,
    creamShades: [CREAM_STITCH, '#E2D8BE', '#EDE4CD'],
    label: INK,
    labelDim: '#5A564E',
    tick: '#5A564E',
    selvage: SUNBLEACH,
  };
}

const DOTO = "'Doto', Menlo, 'Courier New', monospace";
const ANY = "'Anybody', 'Arial Black', system-ui, sans-serif";

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = n >> 16,
    g = (n >> 8) & 255,
    b = n & 255;
  // f>0 lighten toward paper, f<0 darken toward ink
  const t = f < 0 ? 26 : 243,
    tg = f < 0 ? 24 : 236,
    tb = f < 0 ? 24 : 218;
  const a = Math.abs(f);
  const mix = (x: number, y: number): number => Math.round(x + (y - x) * a);
  return `rgb(${mix(r, t)},${mix(g, tg)},${mix(b, tb)})`;
}

/** deterministic per-cell jitter so the knit reads as wool, not a bar chart.
 * (Chooses among 3 yarn shades per stitch — encodes nothing, but is bounded to
 * the woven ink of a real datum's band, i.e. it is TEXTURE OF a datum, never a
 * mark that stands for absent data. Documented as the one allowed texture.) */
function yarn(seed: number): number {
  let x = (seed * 1664525 + 1013904223) >>> 0;
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

export interface LoomView {
  /** the canvas resize hook (call on container resize) */
  resize(): void;
  /** set colorway */
  setColorway(cw: Colorway): void;
  getColorway(): Colorway;
  /** jump the view to a given match-minute (centre it) — used by jump controls */
  focusMinute(minute: number, et: boolean): void;
  /** follow the live edge (default true; jump controls set false until played) */
  setFollow(v: boolean): void;
  /** a goal jolt — the whole cloth kicks once */
  jolt(): void;
  /** a row-complete register snap at a minute */
  snap(minute: number, et: boolean): void;
  /** the 90' death — freeze the dye */
  markDeath(): void;
  /** render one frame (dtMs) — the harness calls this from rAF / _devStep */
  frame(dtMs: number): void;
  /** export the current canvas as a PNG data URL */
  toPNG(): string;
  destroy(): void;
}

interface LiveStitchAnim {
  /** how many stitch-columns of the live row are currently "shuttled in" */
  shown: number;
  target: number;
}

/**
 * Create the loom painter bound to a canvas + a Weave.
 * @param reduced prefers-reduced-motion → rows appear settled, no stitch anim.
 */
export function createLoom(
  canvas: HTMLCanvasElement,
  weave: Weave,
  fixture: Fixture,
  reduced: boolean,
  initialColorway: Colorway = 'newsprint',
): LoomView {
  const ctx = canvas.getContext('2d')!;
  let cw: Colorway = initialColorway;
  let pal = paletteFor(cw);

  // team inks: prefer each team's real kit colour, but the loom's job is to make
  // "home ink | draw cream | away ink" legible at the stitch — so if the two kit
  // colours are too close to distinguish woven (hue + luminance both near), fall
  // back to the canonical distinct pair (ultra favourite / poppy challenger), as
  // SHEET Nº 002 does for this very fixture (ARG blue vs CPV blue).
  const { home: HOME, away: AWAY } = endInks(fixture.home.colors[0], fixture.away.colors[0]);
  const homeShades: [string, string, string] = [HOME, shade(HOME, -0.14), shade(HOME, 0.12)];
  const awayShades: [string, string, string] = [AWAY, shade(AWAY, -0.14), shade(AWAY, 0.12)];

  let W = 0,
    H = 0,
    DPR = 1;

  // layout (CSS px)
  const PAD_TOP = 116; // masthead
  const PAD_BOTTOM = 30;
  let clothX = 0,
    clothW = 0;
  const SELVAGE = 26; // bare selvage band each side
  const GUTTER = 34; // minute-label gutter outside the left selvage
  let rowH = 13; // fixed row height — the cloth GROWS, rows never squash

  // scroll: the cloth grows downward; the view follows the live edge.
  let scrollY = 0; // px offset (top of cloth to top of viewport content area)
  let follow = true;
  let focusTarget: number | null = null; // px scroll target when jumping

  // motion state
  let joltT = 0; // goal jolt envelope (ms remaining)
  const snaps: { minute: number; et: boolean; t: number }[] = []; // register snaps
  let deathFlash = 0;
  const liveAnim: LiveStitchAnim = { shown: 0, target: 0 };
  let etLiveAnim: LiveStitchAnim = { shown: 0, target: 0 };

  function resize(): void {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(280, rect.width);
    H = Math.max(320, rect.height);
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // cloth spans the width minus the label gutter (left) and a matching right margin
    clothX = GUTTER;
    clothW = W - GUTTER - 12;
    // rows sized so ~a full 90' cloth is legible on a phone but stitches stay chunky
    rowH = Math.max(11, Math.min(16, Math.round(W / 26)));
  }

  function setColorway(next: Colorway): void {
    cw = next;
    pal = paletteFor(next);
  }

  /* ── stitch band painter: one row's split into chunky stitches ──────── */
  // returns the number of stitch columns in a row (its "capacity")
  function stitchCols(): number {
    return Math.max(10, Math.floor(clothW / 7));
  }

  function paintRow(
    row: Row,
    y: number,
    opts: { liveShown?: number; dim?: number },
  ): void {
    const cols = stitchCols();
    const stitchW = clothW / cols;
    const split = row.settled;
    const dim = opts.dim ?? 0;

    // a row with no settled split at all (before the first tick): draw the raw
    // wool ground (undyed) — honest "not woven yet".
    if (!split) {
      ctx.fillStyle = cw === 'press-black' ? '#201F1C' : '#EBE2CC';
      ctx.fillRect(clothX, y + 0.6, clothW, rowH - 1.2);
      return;
    }

    const homeEdge = split.pHome * clothW;
    const awayStart = clothW - split.pAway * clothW;

    // how many columns to actually draw (live row shuttles in; settled = all)
    const shown = opts.liveShown != null ? Math.min(cols, opts.liveShown) : cols;

    for (let c = 0; c < cols; c++) {
      const px = c * stitchW;
      const cx = px + stitchW / 2;
      // which band does this stitch's CENTRE fall in → its dyed ink (the datum)
      let base: [string, string, string];
      if (cx <= homeEdge) base = homeShades;
      else if (cx >= awayStart) base = awayShades;
      else base = pal.creamShades;

      const drawn = c < shown;
      const h = (yarn((row.minute + 1) * 733 + c * 31) * 3) | 0;
      let col = base[h] ?? base[0];
      if (!drawn) {
        // not-yet-shuttled columns of the LIVE row: the bare warp (undyed thread),
        // so you SEE the row filling in as ticks arrive.
        col = cw === 'press-black' ? '#1C1B18' : '#E4DBC4';
      } else if (dim > 0) {
        col = mixHex(col, pal.ground, dim);
      }
      ctx.fillStyle = col;
      // chunky stitch: a rounded-ish tile with a 1px gutter (the knit loop)
      ctx.fillRect(clothX + px + 0.4, y + 0.7, stitchW - 0.8, rowH - 1.4);
      // stitch highlight (the loop's crown) — a thin lighter cap, drawn only when shuttled
      if (drawn) {
        ctx.fillStyle = mixHex(col, cw === 'press-black' ? '#000000' : NEWSPRINT, 0.22);
        ctx.fillRect(clothX + px + 0.4, y + 0.7, stitchW - 0.8, 1.3);
      }
    }

    // the inter-row weft shadow (the ridge between knit rows)
    ctx.fillStyle = cw === 'press-black' ? 'rgba(0,0,0,0.5)' : 'rgba(26,24,24,0.06)';
    ctx.fillRect(clothX, y + rowH - 0.7, clothW * (shown / cols), 0.7);
  }

  /* ── goal patch: a quarter-circle pinwheel sewn into the row (Bauhaus) ── */
  function paintPatch(patch: Patch, y: number): void {
    const ink = patch.side === 'home' ? HOME : AWAY;
    const cx = clothX + clothW - 30;
    const cy = y + rowH / 2;
    const r = Math.min(15, rowH * 1.05);
    // pinwheel of four quarter-circles (calmer, more woven than a star)
    ctx.save();
    ctx.translate(cx, cy);
    for (let q = 0; q < 4; q++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, (q * Math.PI) / 2, (q * Math.PI) / 2 + Math.PI / 2);
      ctx.closePath();
      ctx.fillStyle = q % 2 ? ink : shade(ink, -0.16);
      ctx.fill();
    }
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = pal.ground;
    ctx.stroke();
    ctx.restore();

    // the label plate to the LEFT of the patch: "GOAL 58' · SCORER · 1–1"
    // (whisper-caps). On narrow cloth, drop the scorer so it always fits; the
    // score always rides in the same plate (never clips past the cloth edge).
    const conf = patch.confirmed;
    const scoreStr = patch.score ? `${patch.score.home}–${patch.score.away}` : '';
    const narrow = clothW < 520;
    const who =
      narrow || !patch.scorer
        ? patch.scorer || conf
          ? ''
          : 'CHECKING'
        : patch.own
          ? `${lastName(patch.scorer)} (OG)`
          : lastName(patch.scorer);
    const label =
      `GOAL ${patch.minute}′` +
      (who ? ' · ' + who.toUpperCase() : '') +
      (scoreStr ? '  ' + scoreStr : '');
    ctx.font = `700 10px ${DOTO}`;
    try {
      ctx.letterSpacing = '0.4px';
    } catch {
      /* older engines */
    }
    const tw = ctx.measureText(label).width + 12;
    const bx = Math.max(clothX + 2, cx - r - 6 - tw);
    ctx.fillStyle = patch.side === 'home' ? HOME : AWAY;
    ctx.fillRect(bx, cy - 8, tw, 16);
    ctx.fillStyle = inkOn(patch.side === 'home' ? HOME : AWAY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, bx + 6, cy + 0.5);
    try {
      ctx.letterSpacing = '0px';
    } catch {
      /* noop */
    }
  }

  /* ── the frame ──────────────────────────────────────────────────────── */

  function totalClothHeight(): number {
    const cloth = weave.cloth;
    const full = cloth.rows.length * rowH;
    const etGap = cloth.etRows.length > 0 ? 44 : 0; // the SETTLES·DIES + ET MARKET band
    const et = cloth.etRows.length * rowH;
    return full + etGap + et;
  }

  function frame(dtMs: number): void {
    const dt = Math.min(64, dtMs);
    const cloth = weave.cloth;

    // advance live-stitch shuttle animation (discrete-ish: step columns toward target)
    const cols = stitchCols();
    const liveRow = cloth.rows[cloth.rows.length - 1];
    if (liveRow) {
      // target columns = fraction of the minute the ticks have covered. We reveal
      // proportional to how many stitches this minute has earned: 1 tick reveals
      // a chunk, and the row fully reveals once complete.
      const frac = liveRow.complete
        ? 1
        : Math.min(1, liveRow.stitches.length / 6); // ~6 ticks ≈ a full live row reveal
      liveAnim.target = Math.round(frac * cols);
      if (reduced) liveAnim.shown = liveAnim.target;
      else {
        // shuttle mechanically: move a few columns per frame toward target
        const step = Math.max(1, Math.round((cols / 22) * (dt / 16)));
        if (liveAnim.shown < liveAnim.target) liveAnim.shown = Math.min(liveAnim.target, liveAnim.shown + step);
        else liveAnim.shown = liveAnim.target;
      }
    }
    const etLiveRow = cloth.etRows[cloth.etRows.length - 1];
    if (etLiveRow) {
      const frac = etLiveRow.complete ? 1 : Math.min(1, etLiveRow.stitches.length / 6);
      etLiveAnim.target = Math.round(frac * cols);
      if (reduced) etLiveAnim.shown = etLiveAnim.target;
      else {
        const step = Math.max(1, Math.round((cols / 22) * (dt / 16)));
        if (etLiveAnim.shown < etLiveAnim.target) etLiveAnim.shown = Math.min(etLiveAnim.target, etLiveAnim.shown + step);
        else etLiveAnim.shown = etLiveAnim.target;
      }
    }

    // scroll: follow the live edge (keep the growing edge ~62% down the view)
    const contentTop = PAD_TOP;
    const contentH = H - contentTop - PAD_BOTTOM;
    const clothH = totalClothHeight();
    const liveEdgeY = clothH; // bottom of cloth
    let desiredScroll = scrollY;
    if (focusTarget != null) {
      desiredScroll = focusTarget;
      // ease to focus target, then release
      scrollY += (desiredScroll - scrollY) * Math.min(1, dt / 120);
      if (Math.abs(desiredScroll - scrollY) < 1) {
        scrollY = desiredScroll;
        focusTarget = null;
      }
    } else if (follow) {
      desiredScroll = Math.max(0, liveEdgeY - contentH * 0.62);
      // smooth-follow (mechanical but not jarring)
      scrollY += (desiredScroll - scrollY) * Math.min(1, dt / 90);
    }

    // decay motion envelopes
    if (joltT > 0) joltT = Math.max(0, joltT - dt);
    if (deathFlash > 0) deathFlash = Math.max(0, deathFlash - dt);
    for (const s of snaps) s.t = Math.max(0, s.t - dt);
    for (let i = snaps.length - 1; i >= 0; i--) if (snaps[i]!.t <= 0) snaps.splice(i, 1);

    // ── DRAW ──
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, 0, W, H);

    // the jolt: a small vertical kick of the whole cloth (goal register jolt)
    const joltY = joltT > 0 ? Math.sin((joltT / 260) * Math.PI) * 3.5 : 0;

    // clip the cloth to the content area so it scrolls under the masthead
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, contentTop, W, contentH);
    ctx.clip();

    const baseY = contentTop - scrollY + joltY;

    // selvage bands (bare — v1, no crowd wireable). Draw behind the cloth edges.
    paintSelvages(baseY, clothH);

    // FULL rows
    for (let i = 0; i < cloth.rows.length; i++) {
      const row = cloth.rows[i]!;
      const y = baseY + i * rowH;
      if (y + rowH < contentTop - 4 || y > contentTop + contentH + 4) continue; // cull
      const isLive = i === cloth.rows.length - 1 && !cloth.fullMarketDead;
      const snap = snaps.find((s) => !s.et && s.minute === row.minute);
      const snapJog = snap ? Math.sin((snap.t / 180) * Math.PI) * 1.5 : 0;
      paintRow(row, y + snapJog, { liveShown: isLive ? liveAnim.shown : undefined });
    }

    // the centre seam (Press-Black warp down the middle of the cloth)
    if (cloth.rows.length > 0) {
      const fullBottom = baseY + cloth.rows.length * rowH;
      ctx.strokeStyle = pal.seam;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(clothX + clothW / 2, Math.max(contentTop, baseY));
      ctx.lineTo(clothX + clothW / 2, Math.min(contentTop + contentH, fullBottom));
      ctx.stroke();
    }

    // minute ticks in the left gutter (every 5', plus the live edge)
    paintMinuteTicks(baseY, cloth.rows);

    // FULL patches (goals) — drawn over the cloth
    for (const p of weave.cloth.patches) {
      if (p.et) continue;
      const idx = p.minute;
      const rowIndex = cloth.rows.findIndex((r) => r.minute === idx);
      if (rowIndex < 0) continue;
      const y = baseY + rowIndex * rowH;
      if (y + rowH < contentTop - 20 || y > contentTop + contentH + 20) continue;
      paintPatch(p, y);
    }

    // the 90' death band + ET band
    let etBaseY = baseY + cloth.rows.length * rowH;
    if (cloth.fullMarketDead && cloth.rows.length > 0) {
      etBaseY = paintDeathBand(etBaseY);
    }
    // ET rows (resumed market)
    if (cloth.etRows.length > 0) {
      for (let i = 0; i < cloth.etRows.length; i++) {
        const row = cloth.etRows[i]!;
        const y = etBaseY + i * rowH;
        if (y + rowH < contentTop - 4 || y > contentTop + contentH + 4) continue;
        const isLive = i === cloth.etRows.length - 1;
        const snap = snaps.find((s) => s.et && s.minute === row.minute);
        const snapJog = snap ? Math.sin((snap.t / 180) * Math.PI) * 1.5 : 0;
        paintRow(row, y + snapJog, { liveShown: isLive ? etLiveAnim.shown : undefined });
      }
      // ET seam
      const etBottom = etBaseY + cloth.etRows.length * rowH;
      ctx.strokeStyle = pal.seam;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(clothX + clothW / 2, Math.max(contentTop, etBaseY));
      ctx.lineTo(clothX + clothW / 2, Math.min(contentTop + contentH, etBottom));
      ctx.stroke();
      paintMinuteTicks(etBaseY, cloth.etRows);
      for (const p of weave.cloth.patches) {
        if (!p.et) continue;
        const rowIndex = cloth.etRows.findIndex((r) => r.minute === p.minute);
        if (rowIndex < 0) continue;
        const y = etBaseY + rowIndex * rowH;
        if (y + rowH < contentTop - 20 || y > contentTop + contentH + 20) continue;
        paintPatch(p, y);
      }
    }

    ctx.restore(); // unclip

    // masthead (over everything, opaque)
    paintMasthead();

    // the live-edge NOW readout (bottom), + scroll affordance
    paintLiveEdge();

    if (deathFlash > 0) {
      ctx.fillStyle = `rgba(214,163,59,${(deathFlash / 500) * 0.12})`;
      ctx.fillRect(0, contentTop, W, contentH);
    }
  }

  function paintSelvages(baseY: number, clothH: number): void {
    // bare selvage — a calm ribbed band each side of the cloth (the border the
    // crowd will one day weave; v1 leaves it honest & empty).
    const top = Math.max(PAD_TOP, baseY);
    const bottom = Math.min(H - PAD_BOTTOM, baseY + clothH);
    if (bottom <= top) return;
    // left + right (they sit INSIDE the cloth edge — the outermost ~SELVAGE px)
    for (const sx of [clothX, clothX + clothW - SELVAGE]) {
      ctx.fillStyle = pal.selvage;
      ctx.fillRect(sx, top, SELVAGE, bottom - top);
      // fine vertical rib
      ctx.strokeStyle = cw === 'press-black' ? 'rgba(255,255,255,0.05)' : 'rgba(26,24,24,0.05)';
      ctx.lineWidth = 0.6;
      for (let x = sx + 4; x < sx + SELVAGE; x += 5) {
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
      }
    }
  }

  function paintMinuteTicks(baseY: number, rows: Row[]): void {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = `400 9.5px ${DOTO}`;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const showEvery = 5;
      const isEdge = i === rows.length - 1;
      if (row.minute % showEvery !== 0 && !isEdge) continue;
      const y = baseY + i * rowH + rowH / 2;
      if (y < PAD_TOP - 2 || y > H - PAD_BOTTOM + 2) continue;
      ctx.strokeStyle = pal.tick;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(clothX - 5, y);
      ctx.lineTo(clothX - 1, y);
      ctx.stroke();
      ctx.fillStyle = isEdge ? pal.label : pal.labelDim;
      ctx.fillText(`${row.minute}′`, clothX - 8, y);
    }
  }

  function paintDeathBand(y: number): number {
    const bandH = 44;
    const top = y;
    // the ruled SETTLES · DIES band + ET MARKET header
    ctx.fillStyle = pal.seam;
    ctx.fillRect(clothX, top + 6, clothW, 2);
    ctx.font = `700 10px ${DOTO}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = pal.seam;
    const t1 = "90′ — FULL MARKET SETTLES · DIES";
    const w1 = ctx.measureText(t1).width + 12;
    ctx.fillRect(clothX, top + 12, w1, 15);
    ctx.fillStyle = pal.ground;
    ctx.fillText(t1, clothX + 6, top + 20);
    // ET MARKET label (gold — the honest resumed-market flag)
    if (weave.cloth.etRows.length > 0 || weave.cloth.etResumed) {
      ctx.fillStyle = GOLD;
      const t2 = 'EXTRA-TIME MARKET · RESUMED';
      const w2 = ctx.measureText(t2).width + 12;
      ctx.fillRect(clothX + clothW - w2, top + 26, w2, 15);
      ctx.fillStyle = INK;
      ctx.fillText(t2, clothX + clothW - w2 + 6, top + 34);
    }
    return top + bandH;
  }

  function paintMasthead(): void {
    // opaque band so cloth scrolls under it
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, 0, W, PAD_TOP - 6);
    // the ink masthead block
    ctx.fillStyle = pal.seam;
    ctx.fillRect(0, 0, W, 46);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `900 22px ${ANY}`;
    ctx.fillStyle = pal.ground;
    ctx.fillText('THE L', 14, 25);
    const lw = ctx.measureText('THE L').width;
    ctx.fillStyle = GOLD;
    ctx.fillText('OO', 14 + lw, 25);
    const ow = ctx.measureText('OO').width;
    ctx.fillStyle = pal.ground;
    ctx.fillText('M', 14 + lw + ow, 25);

    const narrow = W < 640;
    ctx.textAlign = 'right';
    ctx.font = `400 10px ${DOTO}`;
    ctx.fillStyle = cw === 'press-black' ? '#B7B2A6' : GREY;
    const cl = weave.cloth;
    const phaseLabel = cl.fullMarketDead && cl.etResumed ? 'ET MARKET' : marketPhaseLabel(cl.phase);
    ctx.fillText(`${fixture.home.code} v ${fixture.away.code} · ${phaseLabel}`, W - 14, narrow ? 25 : 18);
    if (!narrow) ctx.fillText('LIVE MARKET BELIEF, WOVEN', W - 14, 32);

    // the sub-legend row (what a stitch is)
    ctx.fillStyle = pal.seam;
    ctx.fillRect(0, 46, W, 30);
    ctx.textAlign = 'left';
    ctx.font = `400 9px ${DOTO}`;
    ctx.fillStyle = cw === 'press-black' ? '#CFC9BB' : '#CFC7B6';
    // three swatches
    let lx = 14;
    const sw = 12;
    const drawSwatch = (color: string, label: string): void => {
      ctx.fillStyle = color;
      ctx.fillRect(lx, 55, sw, 12);
      ctx.fillStyle = cw === 'press-black' ? '#CFC9BB' : '#CFC7B6';
      ctx.fillText(label, lx + sw + 5, 61.5);
      lx += sw + 6 + ctx.measureText(label).width + 14;
    };
    ctx.textBaseline = 'middle';
    drawSwatch(HOME, fixture.home.code);
    drawSwatch(pal.cream, 'DRAW');
    drawSwatch(AWAY, fixture.away.code);
    // the "one row = one minute" caption only when it won't collide with swatches
    ctx.textAlign = 'right';
    ctx.fillStyle = cw === 'press-black' ? '#8F8A7E' : '#96907F';
    const cap = narrow ? 'ROW = MINUTE · STITCH = TICK' : 'ONE ROW = ONE MINUTE · ONE STITCH = A REAL TICK';
    if (W - 14 - ctx.measureText(cap).width > lx + 8) ctx.fillText(cap, W - 14, 61.5);
  }

  function paintLiveEdge(): void {
    const cl = weave.cloth;
    const t = cl.lastTick;
    // bottom NOW panel: the live triple in Doto, whisper label
    const y = H - PAD_BOTTOM + 4;
    ctx.fillStyle = pal.ground;
    ctx.fillRect(0, H - PAD_BOTTOM - 2, W, PAD_BOTTOM + 2);
    ctx.strokeStyle = pal.tick;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(0, H - PAD_BOTTOM - 2);
    ctx.lineTo(W, H - PAD_BOTTOM - 2);
    ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `400 10px ${DOTO}`;
    ctx.fillStyle = pal.labelDim;
    const minLabel =
      cl.clockMinute > 0 ? `${Math.floor(cl.clockMinute)}′` : cl.phase === 'PRE' ? 'PRE' : '—';
    ctx.fillText(`NOW  ${minLabel}`, 14, y + 8);
    if (t) {
      ctx.textAlign = 'right';
      ctx.font = `700 12px ${DOTO}`;
      const parts = `${fixture.home.code} ${(t.pHome * 100).toFixed(0)}  ·  DRAW ${(t.pDraw * 100).toFixed(0)}  ·  ${fixture.away.code} ${(t.pAway * 100).toFixed(0)}`;
      ctx.fillStyle = pal.label;
      ctx.fillText(parts, W - 14, y + 8);
      if (t.period === 'et') {
        ctx.textAlign = 'left';
        ctx.font = `700 9px ${DOTO}`;
        ctx.fillStyle = GOLD;
        ctx.fillText('ET', 14 + 54, y + 8);
      }
    } else {
      ctx.textAlign = 'right';
      ctx.font = `400 10px ${DOTO}`;
      ctx.fillStyle = pal.labelDim;
      ctx.fillText('AWAITING FIRST TICK', W - 14, y + 8);
    }
  }

  /* ── controls ───────────────────────────────────────────────────────── */
  function focusMinute(minute: number, et: boolean): void {
    const cl = weave.cloth;
    follow = false;
    let px = 0;
    if (!et) {
      const idx = cl.rows.findIndex((r) => r.minute >= minute);
      px = (idx < 0 ? cl.rows.length : idx) * rowH;
    } else {
      const full = cl.rows.length * rowH + 44;
      const idx = cl.etRows.findIndex((r) => r.minute >= minute);
      px = full + (idx < 0 ? cl.etRows.length : idx) * rowH;
    }
    const contentH = H - PAD_TOP - PAD_BOTTOM;
    focusTarget = Math.max(0, px - contentH * 0.45);
  }

  return {
    resize,
    setColorway,
    getColorway: () => cw,
    focusMinute,
    setFollow: (v: boolean) => {
      follow = v;
      if (v) focusTarget = null;
    },
    jolt: () => {
      if (!reduced) joltT = 260;
    },
    snap: (minute: number, et: boolean) => {
      if (!reduced) snaps.push({ minute, et, t: 180 });
    },
    markDeath: () => {
      if (!reduced) deathFlash = 500;
    },
    frame,
    toPNG: () => canvas.toDataURL('image/png'),
    destroy: () => {
      /* nothing retained beyond the canvas */
    },
  };

  /* ── small color utils ──────────────────────────────────────────────── */
  function mixHex(a: string, b: string, t: number): string {
    const pa = toRGB(a),
      pb = toRGB(b);
    const m = (x: number, y: number): number => Math.round(x + (y - x) * t);
    return `rgb(${m(pa[0], pb[0])},${m(pa[1], pb[1])},${m(pa[2], pb[2])})`;
  }
  function toRGB(c: string): [number, number, number] {
    if (c.startsWith('#')) {
      const n = parseInt(c.slice(1), 16);
      return [n >> 16, (n >> 8) & 255, n & 255];
    }
    const m = c.match(/\d+/g);
    return m ? [Number(m[0]), Number(m[1]), Number(m[2])] : [0, 0, 0];
  }
  function inkOn(hex: string): string {
    const [r, g, b] = toRGB(hex);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum > 150 ? INK : NEWSPRINT;
  }
}

/** pick two distinguishable end inks: real kits if they read apart, else the
 * canonical ultra/poppy pair. "Apart" = enough combined hue + luminance gap that
 * a stitch of one never reads as the other (the legibility gate). */
function endInks(homeHex: string, awayHex: string): { home: string; away: string } {
  const hue = (c: string): number => {
    const n = parseInt(c.replace('#', ''), 16);
    const r = (n >> 16) / 255,
      g = ((n >> 8) & 255) / 255,
      b = (n & 255) / 255;
    const max = Math.max(r, g, b),
      min = Math.min(r, g, b),
      d = max - min;
    if (d < 0.001) return -1; // greyscale — no hue
    let h: number;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    return h < 0 ? h + 360 : h;
  };
  const h1 = hue(homeHex),
    h2 = hue(awayHex);
  // hue distance on the wheel (0..180). Two ends whose inks share a hue family
  // (both blues, both reds) read as ONE colour woven — the ends stop being
  // legible. When they're within ~45°, use the canonical distinct pair (SHEET
  // Nº 002's ARG-ultra / CPV-poppy assignment) so home vs away is unmistakable.
  const dHue = h1 < 0 || h2 < 0 ? 999 : Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
  if (dHue < 45) return { home: ULTRA, away: POPPY };
  return { home: homeHex, away: awayHex };
}

function lastName(full: string): string {
  // wire names arrive "Last, First Middle" (preferredName) — surface the family name
  const comma = full.indexOf(',');
  if (comma > 0) return full.slice(0, comma).trim();
  const parts = full.trim().split(/\s+/);
  return parts[parts.length - 1] ?? full;
}

function marketPhaseLabel(phase: string): string {
  switch (phase) {
    case 'PRE':
      return 'PRE-MATCH';
    case 'FIRST_HALF':
      return '1ST HALF';
    case 'HALF_TIME':
      return 'HALF-TIME';
    case 'SECOND_HALF':
      return '2ND HALF';
    case 'EXTRA_TIME':
      return 'EXTRA TIME';
    case 'PENALTIES':
      return 'PENALTIES';
    case 'FULL_TIME':
      return 'FULL-TIME';
    default:
      return phase;
  }
}
