/**
 * ROOOT — THE STAGE. The World Cup as a living mechanical PRINT (2D canvas). Pop-print
 * reskin of the tide-on-pitch renderer: the mount contract + the honesty core are
 * unchanged; the whole visual layer is the Topps/Panini flat-ink world (design/SYSTEM.md).
 *
 * Mount surface is coordinator-fixed — createStage(opts) → Stage. main.ts wires it as one
 * wire (callbacks / setCrowd / setMySide / resize / destroy). Nothing here reaches out.
 *
 * The picture (SYSTEM.md): a portrait pitch printed as an OWNABLE POSTER on the fixture's
 * loud ground, Press-Black keyline + Newsprint border + a caption/serial strip. THE MARKET
 * = each team's HALFTONE DOT FIELD advancing from its goal-end, extent == its win
 * probability, FRAYING to specks at the working edge; THE DRAW == the near-empty collapse
 * band where both densities bottom out, with the constant thin 50% seam riding inside it.
 * THE CROWD = pictogram fan bands behind each goal (counts/roar, NEVER a %). GOALS = a
 * stepped GOOOL starburst at the real mouth. Scoreboard band up top; % chips + ROAR meter
 * on the rail. Press grain over all. Stepped/snapped motion; reduced-motion → settled calm.
 *
 * Honesty: pHome/pDraw/pAway are the market's numbers, normalized + NaN-guarded, eased
 * ~1.5s toward truth (cubic in-out, no overshoot). The crowd is counts/roar, never a
 * probability, never blended. Idle = halftone breathing (dots blink) — texture, not data.
 */

import type { MatchCallbacks, Fixture, OddsTick, ScoreEvent, StatusEvent, MatchPhase } from '@contracts/match';
import type { ReactKind, Side } from '@contracts/crowd';

import { computeStageRect, computePitchRect, computeFront } from './layout';
import type { StageRect, PitchRect } from './layout';
import { bakeGrainTile } from './noise';
import { chooseGround, resolvePop, ensureFonts, INK } from './pop';
import type { PopTheme } from './pop';
import { drawGround, drawFrame, drawCaption } from './layers/paper';
import { drawPitchPaper, drawChalkOver, drawGoalNets } from './layers/pitch';
import { Territories } from './layers/territory';
import { Ends } from './layers/ends';
import { Goool } from './layers/goool';
import { drawScoreboard } from './layers/scoreboard';
import { drawRail } from './layers/rail';
import { drawLetterbox, drawGrain } from './layers/grain';
import { approach, clamp01, normOdds, easeInOutCubic, hexToRgb } from '../lib/stage-math';
import type { RGBTuple } from '../lib/stage-math';

/* ── the coordinator-fixed contract (do not change shapes) ───────────── */

export interface StageCrowdInput {
  counts: { home: number; away: number };
  roar: { home: number; away: number };
  pulse: { home: Record<ReactKind, number>; away: Record<ReactKind, number> };
}

export interface Stage {
  callbacks: MatchCallbacks;
  setCrowd(c: StageCrowdInput): void;
  setMySide(s: Side | null): void;
  /**
   * LIVE-MODE CHROME SWITCH (BRIEF-WATCHING §1/§4/§5). Live mode (posed=false)
   * sheds the outer loud FRAME + CAPTION strip + Press-Black LETTERBOX so the pitch
   * meets the Newsprint page like a broadcast window — a thin keyline is all that
   * remains. Posed mode (posed=true) restores the full §10 memento anatomy (frame,
   * caption, serial, letterbox) so a paused / GOOOL / HT / FT moment composes as an
   * ownable print. The watching shell flips this via the scoreband's PAUSE button;
   * a live GOOOL eruption also poses itself for the freeze. Default: live.
   */
  setPosed(posed: boolean): void;
  resize(): void;
  destroy(): void;
}

/* ── internal state ──────────────────────────────────────────────────── */

const PHASE_LABEL: Record<MatchPhase, string> = {
  PRE: 'KICK OFF SOON',
  FIRST_HALF: '1ST HALF',
  HALF_TIME: 'HALF TIME',
  SECOND_HALF: '2ND HALF',
  EXTRA_TIME: 'EXTRA TIME',
  PENALTIES: 'PENALTIES',
  FULL_TIME: 'FULL TIME',
};

interface Odds {
  home: number;
  draw: number;
  away: number;
}

export function createStage(opts: {
  canvas: HTMLCanvasElement;
  fixture: Fixture;
  mySide?: Side | null;
  /** start posed (full poster chrome) instead of live (broadcast window)? default false = live */
  posed?: boolean;
}): Stage {
  const canvas = opts.canvas;
  // live mode meets the Newsprint PAGE, so the canvas must be transparent where the
  // poster ground/letterbox no longer paint (posed mode still fills opaque). alpha:true
  // keeps the print quality identical while letting the page show through in live.
  const maybeCtx = canvas.getContext('2d', { alpha: true }) as CanvasRenderingContext2D | null;
  if (!maybeCtx) throw new Error('[stage] 2D context unavailable');
  const g2d: CanvasRenderingContext2D = maybeCtx;

  const fixture = opts.fixture;
  let mySide: Side | null = opts.mySide ?? null;
  // live-chrome switch: posed=false → broadcast window (keyline only); posed=true → full §10 print
  let posed = opts.posed ?? false;

  const homeTheme: PopTheme = resolvePop(fixture.home.colors);
  const awayTheme: PopTheme = resolvePop(fixture.away.colors);
  // the fixture's loud ground: a rotation loud NEITHER team owns (never fizzPink); the
  // coordinator may re-point this later, but the frame law picks a legal default here.
  const ground: RGBTuple = chooseGround(homeTheme.primary, awayTheme.primary);

  // caption strip strings (date from kickoff; frame label tracks phase)
  const dateLabel = formatDate(fixture.kickoffISO);
  const fixtureLabel = `${fixture.home.code} · ${fixture.away.code}`;

  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // kick font loading; type paints with a fallback until ready, then upgrades in place
  void ensureFonts();

  // baked texture
  const grainTile = bakeGrainTile(128, 7);

  // layer engines
  const territories = new Territories();
  const ends = new Ends();
  const goool = new Goool();

  // geometry
  let stage: StageRect = { x: 0, y: 0, w: 1, h: 1, dpr: 1 };
  let pitch: PitchRect = computePitchRect(stage);

  // ── market state: target (feed) + displayed (eased) ──
  let targetOdds: Odds = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  let shownOdds: Odds = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  let haveOdds = false;
  let easeFrom: Odds = { ...shownOdds };
  let easeTo: Odds = { ...targetOdds };
  let easeStart = 0;
  const EASE_MS = 1500;

  // scoreboard / status
  let homeScore = 0;
  let awayScore = 0;
  let minute: number | null = null;
  let phase: MatchPhase = 'PRE';
  let feedState: 'connected' | 'reconnecting' | 'replay' | 'lost' = 'connected';
  // score-flip animation clock (seconds since last score change)
  let flipT = 999;

  // scorer's-side territory SNAP: a brief boost added to the scoring field's edge so it
  // lunges forward on a goal (stepped by the goool sequence), then settles to truth.
  let homeSnap = 0;
  let awaySnap = 0;

  // crowd
  let crowd: StageCrowdInput = {
    counts: { home: 0, away: 0 },
    roar: { home: 0, away: 0 },
    pulse: {
      home: { belief: 0, nerves: 0, rage: 0 },
      away: { belief: 0, nerves: 0, rage: 0 },
    },
  };

  // timing
  let raf = 0;
  let lastT = 0;
  let clock = 0;
  let frame = 0;
  let running = true;

  /* ── sizing ─────────────────────────────────────────────────────── */
  function sizeToCanvas(): void {
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, rect.width || canvas.clientWidth || 360);
    const cssH = Math.max(1, rect.height || canvas.clientHeight || 640);
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(cssH * dpr);
    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    stage = computeStageRect(pxW, pxH, dpr);
    pitch = computePitchRect(stage);
    territories.invalidate();
    ends.layout(stage);
  }

  /* ── feed → state (honest ingestion) ────────────────────────────── */
  function ingestOdds(tick: OddsTick): void {
    const n = normOdds(tick.pHome, tick.pDraw, tick.pAway);
    if (!n.ok) return; // refuse to render fiction; hold last good
    targetOdds = { home: n.home, draw: n.draw, away: n.away };
    easeFrom = { ...shownOdds };
    easeTo = { ...targetOdds };
    easeStart = clock * 1000;
    haveOdds = true;
    if (typeof tick.minute === 'number') minute = tick.minute;
  }

  function ingestScore(ev: ScoreEvent): void {
    const prevH = homeScore;
    const prevA = awayScore;
    homeScore = Math.max(0, Math.floor(ev.home));
    awayScore = Math.max(0, Math.floor(ev.away));
    if (typeof ev.minute === 'number') minute = ev.minute;
    let scored: Side | null = ev.side ?? null;
    if (!scored) {
      if (homeScore > prevH) scored = 'home';
      else if (awayScore > prevA) scored = 'away';
    }
    if (scored && homeScore + awayScore > prevH + prevA) {
      goool.erupt(scored);
      flipT = 0;
      // the scorer's field lunges forward (snap), the beaten side recoils a touch
      if (scored === 'home') {
        homeSnap = 1;
        awaySnap = -0.5;
      } else {
        awaySnap = 1;
        homeSnap = -0.5;
      }
    }
  }

  function ingestStatus(ev: StatusEvent): void {
    phase = ev.phase;
    if (typeof ev.minute === 'number') minute = ev.minute;
  }

  const callbacks: MatchCallbacks = {
    onOdds: ingestOdds,
    onScore: ingestScore,
    onStatus: ingestStatus,
    onFeedState: (s) => {
      feedState = s;
    },
  };

  /* ── per-frame update ───────────────────────────────────────────── */
  function update(dt: number): void {
    clock += dt;
    flipT += dt;

    if (haveOdds) {
      const p = clamp01((clock * 1000 - easeStart) / EASE_MS);
      const e = easeInOutCubic(p);
      shownOdds = {
        home: easeFrom.home + (easeTo.home - easeFrom.home) * e,
        draw: easeFrom.draw + (easeTo.draw - easeFrom.draw) * e,
        away: easeFrom.away + (easeTo.away - easeFrom.away) * e,
      };
    }
    // re-normalize shown (drift guard) so the front mapping is exact
    const sn = normOdds(shownOdds.home, shownOdds.draw, shownOdds.away);
    shownOdds = { home: sn.home, draw: sn.draw, away: sn.away };

    // snaps decay back to zero (the field settles to truth after the goal lunge)
    homeSnap = approach(homeSnap, 0, 0.5, dt);
    awaySnap = approach(awaySnap, 0, 0.5, dt);

    ends.update(
      dt,
      {
        roarHome: crowd.roar.home,
        roarAway: crowd.roar.away,
        countHome: crowd.counts.home,
        countAway: crowd.counts.away,
        homeBehind: homeScore < awayScore,
        awayBehind: awayScore < homeScore,
      },
      reducedMotion,
    );
    goool.update(dt);
  }

  /* ── render ─────────────────────────────────────────────────────── */
  function render(): void {
    const ctx = g2d;

    // LIVE-CHROME SWITCH: a live GOOOL freeze poses itself (the eruption is a poster
    // moment); otherwise honour the shell's posed flag. Posed → full §10 poster;
    // live → broadcast window on the Newsprint page.
    const showPoster = posed || goool.active;

    // clear the whole canvas each frame — in live mode the letterbox margins stay
    // TRANSPARENT so the Newsprint page shows through (no dead black void); in posed
    // mode the ground + letterbox repaint over it opaquely, so this is a no-op cost.
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1) GROUND — posed: the fixture's loud ground (the poster's paper stock).
    // live: the Newsprint PAGE ground, so the stage merges with the shell as a
    // broadcast window (keyline only), the loud ground reserved for the collect moment.
    drawGround(ctx, stage, showPoster ? ground : INK.newsprint);

    // 2) PITCH paper + chalk geometry under the dots, then the territories, then chalk over
    drawPitchPaper(ctx, stage, pitch);

    // market front from EXACT eased odds; apply the goal SNAP as a temporary edge boost
    const front = computeFront(pitch, shownOdds.home, shownOdds.draw, shownOdds.away);
    if (homeSnap !== 0) front.homeEdgeY -= homeSnap * pitch.h * 0.05;
    if (awaySnap !== 0) front.awayEdgeY += awaySnap * pitch.h * 0.05;

    // 3) TERRITORIES — the two halftone dot fields + the dot-fray draw collapse
    territories.draw(ctx, {
      pitch,
      front,
      home: homeTheme,
      away: awayTheme,
      t: clock,
      reducedMotion,
      paper: INK.newsprint,
    });

    // chalk seam + center circle re-struck ON the dots (crisp), + goal nets
    drawChalkOver(ctx, pitch);
    drawGoalNets(ctx, pitch);

    // 4) ENDS — pictogram crowd bands behind each goal
    ends.draw(
      ctx,
      stage,
      pitch,
      homeTheme,
      awayTheme,
      {
        roarHome: crowd.roar.home,
        roarAway: crowd.roar.away,
        countHome: crowd.counts.home,
        countAway: crowd.counts.away,
        homeBehind: homeScore < awayScore,
        awayBehind: awayScore < homeScore,
      },
      clock,
      reducedMotion,
      fixture.home.flag,
      fixture.away.flag,
    );

    // 5) THE GOOOL ERUPTION (over the pitch)
    goool.draw(ctx, pitch, reducedMotion);

    // 6) CHROME — scoreboard band, rail (% chips + ROAR meter + pop-ball), counters
    const roar01 = clamp01(1 - Math.exp(-Math.max(crowd.roar.home, crowd.roar.away) / 8));
    drawScoreboard(ctx, stage, pitch, {
      homeCode: fixture.home.code,
      awayCode: fixture.away.code,
      homeFlag: fixture.home.flag,
      awayFlag: fixture.away.flag,
      homeScore,
      awayScore,
      minute,
      phaseLabel: PHASE_LABEL[phase],
      homeTheme,
      awayTheme,
      flip: flipTProgress(flipT),
    });
    drawRail(ctx, stage, pitch, {
      pHome: shownOdds.home,
      pDraw: shownOdds.draw,
      pAway: shownOdds.away,
      homeCode: fixture.home.code,
      awayCode: fixture.away.code,
      homeTheme,
      awayTheme,
      roar: roar01,
      t: clock,
      reducedMotion,
    });
    ends.drawCounters(ctx, stage, pitch, {
      roarHome: crowd.roar.home,
      roarAway: crowd.roar.away,
      countHome: crowd.counts.home,
      countAway: crowd.counts.away,
      homeBehind: homeScore < awayScore,
      awayBehind: awayScore < homeScore,
    });

    // 7) FRAME + CAPTION + LETTERBOX — the §10 memento anatomy. POSED ONLY: a paused/
    // GOOOL/HT/FT freeze composes as an ownable print (caption strip, serial, cream
    // frame, Press-Black letterbox mount). In LIVE mode these are SHED — the stage is a
    // broadcast window that meets the Newsprint page with a thin keyline only, no caption,
    // no black void (BRIEF-WATCHING §1/§4/§5). Grain rides over both (a printed tooth is
    // always present). The keyline stays in both modes.
    if (showPoster) {
      drawCaption(ctx, stage, {
        ground,
        fixtureLabel,
        dateLabel,
        frameLabel: gooolActive() ? 'GOOOL' : PHASE_LABEL[phase],
        serial: SERIAL_PLACEHOLDER,
        posed: phase === 'PRE' || phase === 'FULL_TIME',
      });
      drawFrame(ctx, stage);
      drawGrain(ctx, stage, grainTile, frame, reducedMotion);
      drawLetterbox(ctx, stage);
    } else {
      // live: a thin Press-Black keyline hugging the stage rect (the broadcast window's
      // edge — the .rt-stage-wrap in the shell carries the outer keyline too; this keeps
      // the pitch honestly bounded even standalone). Grain over the window only.
      drawGrain(ctx, stage, grainTile, frame, reducedMotion);
      drawLiveKeyline(ctx, stage);
    }

    drawMySideHint(ctx, stage, pitch, mySide);
    if (feedState !== 'connected') drawFeedNote(ctx, stage, feedState);
  }

  function gooolActive(): boolean {
    return goool.active;
  }

  function step(dt: number): void {
    let d = dt;
    if (!Number.isFinite(d) || d < 0) d = 0;
    if (d > 0.1) d = 0.1;
    frame++;
    update(d);
    render();
  }

  function loop(now: number): void {
    if (!running) return;
    if (!lastT) lastT = now;
    const dt = (now - lastT) / 1000;
    lastT = now;
    step(dt);
    raf = requestAnimationFrame(loop);
  }

  /* ── boot ───────────────────────────────────────────────────────── */
  sizeToCanvas();
  raf = requestAnimationFrame(loop);

  return {
    callbacks,
    setCrowd(c) {
      if (!c || !c.counts || !c.roar) return;
      crowd = c;
    },
    setMySide(s) {
      mySide = s;
    },
    setPosed(p) {
      posed = !!p;
    },
    resize() {
      sizeToCanvas();
    },
    destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    },
    /**
     * DEV/verification only: force one frame of the given dt (seconds). RAF is paused while
     * a tab is hidden (headless/automation), so the harness can pump frames. Not part of the
     * Stage contract; main.ts never calls this.
     */
    _devStep(dt: number) {
      step(dt);
    },
  } as Stage & { _devStep(dt: number): void };
}

/* ── small helpers ─────────────────────────────────────────────────────── */

const SERIAL_PLACEHOLDER = 'Nº 000000';

/**
 * The LIVE broadcast-window keyline: a thin Press-Black rule hugging the composed
 * stage rect (no cream border, no loud frame — that's the poster's dress). Weight
 * matches the shell's .rt-stage-wrap keyline so a standalone stage and the shell
 * read the same. This is the "keyline stays" of BRIEF-WATCHING §5(e).
 */
function drawLiveKeyline(ctx: CanvasRenderingContext2D, stage: StageRect): void {
  const w = Math.max(1, Math.round(stage.w * 0.005));
  ctx.save();
  ctx.strokeStyle = `rgb(${INK.pressBlack[0]},${INK.pressBlack[1]},${INK.pressBlack[2]})`;
  ctx.lineWidth = w;
  ctx.strokeRect(stage.x + w / 2, stage.y + w / 2, stage.w - w, stage.h - w);
  ctx.restore();
}

/** score-flip progress 0..1 over MOTION_MS.scoreFlip, else 1 (settled). */
function flipTProgress(flipT: number): number {
  const dur = 0.26; // MOTION_MS.scoreFlip / 1000
  if (flipT >= dur) return 1;
  return clamp01(flipT / dur);
}

function formatDate(iso: string): string {
  // UTC on purpose: a memento's caption is a fixed fact of the fixture — the
  // same edition must print the same date in Mexico City and in Berlin
  // (local accessors would flip an evening kickoff across the date line).
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const mon = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getUTCMonth()] ?? '';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${mon} ${d.getUTCFullYear()}`;
}

/** the "YOUR END" chalk hint — a small drawn chevron in the mySide band (poster-safe: tiny). */
function drawMySideHint(
  ctx: CanvasRenderingContext2D,
  stage: StageRect,
  pitch: PitchRect,
  side: Side | null,
): void {
  if (!side) return;
  const isHome = side === 'home';
  const dir = isHome ? 1 : -1;
  const cx = pitch.cx;
  const s = stage.w * 0.016;
  const labelY = isHome ? pitch.homeGoalY + stage.h * 0.02 : pitch.awayGoalY - stage.h * 0.016;
  ctx.save();
  ctx.fillStyle = `rgb(${INK.newsprint[0]},${INK.newsprint[1]},${INK.newsprint[2]})`;
  ctx.font = `700 ${Math.max(8, stage.w * 0.02)}px "Doto", ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // small chevron
  ctx.strokeStyle = `rgb(${INK.newsprint[0]},${INK.newsprint[1]},${INK.newsprint[2]})`;
  ctx.lineWidth = Math.max(1, stage.w * 0.004);
  ctx.lineCap = 'round';
  const chevY = labelY + dir * s * 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - s, chevY + dir * s * 0.5);
  ctx.lineTo(cx, chevY - dir * s * 0.5);
  ctx.lineTo(cx + s, chevY + dir * s * 0.5);
  ctx.stroke();
  void hexToRgb;
  ctx.restore();
}

function drawFeedNote(
  ctx: CanvasRenderingContext2D,
  stage: StageRect,
  state: 'reconnecting' | 'replay' | 'lost' | 'connected',
): void {
  const label = state === 'replay' ? 'REPLAY' : state === 'reconnecting' ? 'RECONNECTING' : 'FEED LOST';
  // a tiny keyline chip tucked into the top-left of the pitch band — honest, never floating
  // mid-pitch, never faking liveness. Doto on Newsprint.
  const border = Math.max(2, Math.round(stage.w * 0.05));
  const fs = Math.max(7, stage.w * 0.018);
  ctx.save();
  ctx.font = `600 ${fs}px "Doto", ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const tw = ctx.measureText(label).width;
  const padX = fs * 0.5;
  const chH = fs * 1.8;
  const cxp = stage.x + border + stage.w * 0.02;
  const cyp = stage.y + stage.h * 0.135;
  ctx.fillStyle = `rgb(${INK.newsprint[0]},${INK.newsprint[1]},${INK.newsprint[2]})`;
  ctx.fillRect(cxp, cyp, tw + padX * 2, chH);
  ctx.strokeStyle = `rgb(${INK.pressBlack[0]},${INK.pressBlack[1]},${INK.pressBlack[2]})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(cxp, cyp, tw + padX * 2, chH);
  ctx.fillStyle = `rgba(${INK.pressBlack[0]},${INK.pressBlack[1]},${INK.pressBlack[2]},0.75)`;
  ctx.fillText(label, cxp + padX, cyp + chH / 2);
  ctx.restore();
}
