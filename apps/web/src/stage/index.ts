/**
 * ROOOT — THE STAGE. Fog-of-war match renderer (2D canvas, no three.js).
 *
 * Mount surface is coordinator-fixed (integration is one wire). See createStage().
 *
 * The picture (design/REFERENCES.md): a vertical floodlit night pitch — your goal at
 * the bottom, theirs at the top. THE MARKET = two floodlight banks pressing illuminated
 * territory; the de-vigged probability is where each light dies into THE FOG BANK
 * (the fog IS the draw, extent == p(draw), halfway line == 50/50). THE CROWD = bengalo
 * smoke + phone-light starfields at the ends, in team colors, driven by roar. GOALS =
 * fire at the real goal mouth; the beaten side's light collapses. Chalk scoreboard.
 * Grain over everything. Monochrome + one accent per moment. Respects reduced-motion.
 *
 * Honesty: pHome/pDraw/pAway are the market's numbers, normalized + NaN-guarded, eased
 * ~1.5s toward truth, never overshooting into fiction. Crowd is counts/roar, never a
 * probability, never blended with the market. Between ticks the stage BREATHES (fog
 * drift, light shimmer, smoke rise) — ambient motion, honest as texture, never as data.
 */

import type { MatchCallbacks, Fixture, OddsTick, ScoreEvent, StatusEvent, MatchPhase } from '@contracts/match';
import type { ReactKind, Side } from '@contracts/crowd';

import { GEO, resolveSide } from './theme';
import type { SideTheme } from './theme';
import { computeStageRect, computePitchRect, computeFront } from './layout';
import type { StageRect, PitchRect } from './layout';
import { bakeFogTile, bakeGrainTile } from './noise';
import { drawPitchBase, drawChalk } from './layers/pitch';
import { drawMarket } from './layers/market';
import { drawFog } from './layers/fog';
import { Ends } from './layers/ends';
import { Fire } from './layers/fire';
import { drawScoreboard } from './layers/scoreboard';
import { drawVignette, drawGrain } from './layers/grain';
import { approach, clamp01, normOdds, easeInOutCubic } from '../lib/stage-math';

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

export function createStage(opts: { canvas: HTMLCanvasElement; fixture: Fixture; mySide?: Side | null }): Stage {
  const canvas = opts.canvas;
  const maybeCtx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D | null;
  if (!maybeCtx) throw new Error('[stage] 2D context unavailable');
  const g2d: CanvasRenderingContext2D = maybeCtx;

  const fixture = opts.fixture;
  let mySide: Side | null = opts.mySide ?? null;

  const homeTheme: SideTheme = resolveSide(fixture.home.colors);
  const awayTheme: SideTheme = resolveSide(fixture.away.colors);

  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // baked texture sources
  const fogTile = bakeFogTile(256, 1337, 4);
  // floored noise: multiplies the fog band (destination-in) so its edges break into tendrils
  const fogMaskTile = bakeFogTile(256, 4242, 3, 0.5);
  const grainTile = bakeGrainTile(128, 7);

  // offscreen additive light buffer (sized to canvas, reused)
  const lightBuf = document.createElement('canvas');
  const lightCtx = lightBuf.getContext('2d')!;
  // offscreen transparent fog buffer — feathering (destination-in) only works off-screen
  const fogBuf = document.createElement('canvas');
  const fogCtx = fogBuf.getContext('2d')!;

  const ends = new Ends();
  const fire = new Fire();

  // geometry
  let stage: StageRect = { x: 0, y: 0, w: 1, h: 1, dpr: 1 };
  let pitch: PitchRect = computePitchRect(stage);

  // ── market state: target (from feed) + displayed (eased) ──
  // start at a neutral even split so the very first frame is honest, not blank
  let targetOdds: Odds = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  let shownOdds: Odds = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  let haveOdds = false;
  // eased-transition bookkeeping (short easing ~1.5s per tick)
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

  // crowd
  let crowd: StageCrowdInput = {
    counts: { home: 0, away: 0 },
    roar: { home: 0, away: 0 },
    pulse: {
      home: { belief: 0, nerves: 0, rage: 0 },
      away: { belief: 0, nerves: 0, rage: 0 },
    },
  };

  // per-side light "aliveness" (beaten side collapses on a goal against, then recovers)
  let homeAlive = 1;
  let awayAlive = 1;
  let homeAliveTarget = 1;
  let awayAliveTarget = 1;

  // entry: walk out of the tunnel — chalk + energy rise in over the first seconds
  let entry = 0; // 0..1

  // timing
  let raf = 0;
  let lastT = 0;
  let clock = 0; // seconds since mount (ambient phase)
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
    if (lightBuf.width !== pxW || lightBuf.height !== pxH) {
      lightBuf.width = pxW;
      lightBuf.height = pxH;
    }
    if (fogBuf.width !== pxW || fogBuf.height !== pxH) {
      fogBuf.width = pxW;
      fogBuf.height = pxH;
    }
    stage = computeStageRect(pxW, pxH, dpr);
    pitch = computePitchRect(stage);
    ends.layout(stage);
  }

  /* ── feed → state (honest ingestion) ────────────────────────────── */
  function ingestOdds(tick: OddsTick): void {
    const n = normOdds(tick.pHome, tick.pDraw, tick.pAway);
    if (!n.ok) return; // refuse to render fiction; hold last good
    targetOdds = { home: n.home, draw: n.draw, away: n.away };
    // begin a fresh short ease from wherever we're currently shown
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
    // who scored? erupt at that mouth; the OTHER side's light collapses briefly.
    let scored: Side | null = ev.side ?? null;
    if (!scored) {
      if (homeScore > prevH) scored = 'home';
      else if (awayScore > prevA) scored = 'away';
    }
    if (scored && (homeScore + awayScore > prevH + prevA)) {
      fire.erupt(scored);
      if (scored === 'home') {
        awayAliveTarget = 0.28; // their light gutters
        awayAlive = Math.min(awayAlive, 0.5);
      } else {
        homeAliveTarget = 0.28;
        homeAlive = Math.min(homeAlive, 0.5);
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
    entry = clamp01(entry + dt / 2.2); // ~2.2s walk-out

    // ease shown odds toward target over EASE_MS (cubic in-out, no overshoot)
    if (haveOdds) {
      const p = clamp01((clock * 1000 - easeStart) / EASE_MS);
      const e = easeInOutCubic(p);
      shownOdds = {
        home: easeFrom.home + (easeTo.home - easeFrom.home) * e,
        draw: easeFrom.draw + (easeTo.draw - easeFrom.draw) * e,
        away: easeFrom.away + (easeTo.away - easeFrom.away) * e,
      };
    }

    // re-normalize shown (numerical drift guard) so the front mapping is exact
    const sn = normOdds(shownOdds.home, shownOdds.draw, shownOdds.away);
    shownOdds = { home: sn.home, draw: sn.draw, away: sn.away };

    // light aliveness recovers toward 1 after a collapse
    homeAliveTarget = approach(homeAliveTarget, 1, 3.5, dt);
    awayAliveTarget = approach(awayAliveTarget, 1, 3.5, dt);
    homeAlive = approach(homeAlive, homeAliveTarget, 0.8, dt);
    awayAlive = approach(awayAlive, awayAliveTarget, 0.8, dt);

    // crowd particles + glow
    const homeBehind = homeScore < awayScore;
    const awayBehind = awayScore < homeScore;
    ends.update(
      dt,
      {
        roarHome: crowd.roar.home,
        roarAway: crowd.roar.away,
        countHome: crowd.counts.home,
        countAway: crowd.counts.away,
        homeBehind,
        awayBehind,
      },
      reducedMotion,
    );
    fire.update(dt);
  }

  /* ── tension: late + level → fog thickens (penalties as weather) ── */
  function fogTension(): number {
    // level on the scoreboard AND market can't decide → thick fog
    const level = homeScore === awayScore ? 1 : 0.15;
    const drawWeight = clamp01(shownOdds.draw * 1.6); // high p(draw) itself is uncertainty
    const late = minute === null ? 0 : clamp01((minute - 60) / 35); // ramps 60'→95'
    return clamp01(0.15 + drawWeight * 0.5 + level * late * 0.7);
  }

  /* ── render ─────────────────────────────────────────────────────── */
  function render(): void {
    const ctx = g2d;
    const w = canvas.width;
    const h = canvas.height;

    // global energy: full when connected; dips honestly on a struggling feed.
    // Floodlights are ON — even pre-match is bright; we only ramp a little on entry
    // (walking out of the tunnel into the light) and dim for a struggling feed.
    let energy = 1;
    if (feedState === 'reconnecting') energy = 0.78;
    else if (feedState === 'lost') energy = 0.5;
    const entryE = easeInOutCubic(entry);
    if (phase === 'PRE') energy *= 0.92;
    energy *= 0.6 + 0.4 * entryE;

    // base clear (letterbox void — genuinely dark, the picture is contrast)
    ctx.fillStyle = '#030509';
    ctx.fillRect(0, 0, w, h);

    // pitch base + faint chalk (chalk fades in on entry)
    drawPitchBase(ctx, stage, pitch);

    // compute the market front from EXACT eased odds
    const front = computeFront(pitch, shownOdds.home, shownOdds.draw, shownOdds.away);

    // clear the additive light buffer, draw market into it + grass pools onto main
    lightCtx.clearRect(0, 0, w, h);
    drawMarket(ctx, lightCtx, {
      pitch,
      front,
      home: homeTheme,
      away: awayTheme,
      t: clock,
      energy,
      homeAlive,
      awayAlive,
      reducedMotion,
    });
    // composite the volumetric light over the pitch, softened by a light blur so the
    // shaft edges read as haze-scatter (organic beams) rather than hard-edged rects.
    const blurPx = Math.max(1, Math.round(stage.w * 0.006));
    ctx.save();
    ctx.filter = `blur(${blurPx}px)`;
    ctx.drawImage(lightBuf, 0, 0);
    ctx.filter = 'none';
    ctx.restore();

    // the fog bank (the draw) sits between the fronts
    drawFog({
      ctx,
      buf: fogCtx,
      pitch,
      front,
      tile: fogTile,
      mask: fogMaskTile,
      t: clock,
      tension: fogTension(),
      reducedMotion,
    });

    // chalk over the lit grass (so lines read where the pitch is bright)
    drawChalk(ctx, pitch, GEO.goalWidth, entryE);

    // the ends (crowd atmosphere) — vertical, in the margins
    const homeBehind = homeScore < awayScore;
    const awayBehind = awayScore < homeScore;
    const endInputs = {
      roarHome: crowd.roar.home,
      roarAway: crowd.roar.away,
      countHome: crowd.counts.home,
      countAway: crowd.counts.away,
      homeBehind,
      awayBehind,
    };
    ends.draw(ctx, stage, pitch, homeTheme, awayTheme, endInputs, clock, reducedMotion);

    // the goal fire (over everything on the pitch)
    fire.draw(ctx, pitch);
    // full-frame ignition flash whitens the whole stage for the first instant only, then
    // fades fast (the eruption's punch). Kept subtle so it reads as a flash, not a fog-out.
    const flash = fire.peakIntensity();
    if (flash > 0.7) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,244,214,${(flash - 0.7) * 0.5})`;
      ctx.fillRect(stage.x, stage.y, stage.w, stage.h);
      ctx.restore();
    }

    // vignette crushes the corners to void, grain over all the ATMOSPHERE
    drawVignette(ctx, stage);
    drawGrain(ctx, stage, grainTile, frame, reducedMotion);

    // ── chalk marks LAST — above every stage layer, always legible (r2 item 5) ──
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
    });
    ends.drawCounters(ctx, stage, pitch, endInputs);
    drawMySideHint(ctx, stage, pitch, mySide);

    // feed-honesty line if not connected (dim, tiny, chalk) — never fakes liveness
    if (feedState !== 'connected') {
      drawFeedNote(ctx, stage, feedState);
    }
  }

  function step(dt: number): void {
    let d = dt;
    if (!Number.isFinite(d) || d < 0) d = 0;
    if (d > 0.1) d = 0.1; // clamp big gaps (tab was hidden) so nothing lurches
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
      // defensive copy of the shape we rely on; ignore malformed input
      if (!c || !c.counts || !c.roar) return;
      crowd = c;
    },
    setMySide(s) {
      mySide = s;
    },
    resize() {
      sizeToCanvas();
    },
    destroy() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
    },
    /**
     * DEV/verification only: force one frame of the given dt (seconds). RAF is paused
     * while a tab is hidden (e.g. headless/automation), so the harness can pump frames
     * to observe animation. Not part of the Stage contract; main.ts never calls this.
     */
    _devStep(dt: number) {
      step(dt);
    },
  } as Stage & { _devStep(dt: number): void };
}

/* ── small chalk marks (kept here; not worth their own module) ───────── */

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
  const s = stage.w * 0.018;
  // deep at the band's outer edge — with the fans, clear of the rooted counter (which
  // sits by the goal line)
  const labelY = isHome ? stage.y + stage.h - stage.h * 0.022 : stage.y + stage.h * 0.024;
  const chevY = labelY - dir * s * 2.2;
  ctx.save();
  ctx.strokeStyle = 'rgba(233,228,214,0.5)';
  ctx.lineWidth = Math.max(1, stage.w * 0.004);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s, chevY + dir * s * 0.6);
  ctx.lineTo(cx, chevY - dir * s * 0.6);
  ctx.lineTo(cx + s, chevY + dir * s * 0.6);
  ctx.stroke();
  ctx.font = `500 ${Math.max(9, stage.w * 0.022)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(233,228,214,0.48)';
  ctx.fillText('YOUR END', cx, labelY);
  ctx.restore();
}

function drawFeedNote(
  ctx: CanvasRenderingContext2D,
  stage: StageRect,
  state: 'reconnecting' | 'replay' | 'lost' | 'connected',
): void {
  const label = state === 'replay' ? 'REPLAY' : state === 'reconnecting' ? 'RECONNECTING' : 'FEED LOST';
  ctx.save();
  ctx.font = `500 ${Math.max(9, stage.w * 0.022)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = 'center';
  ctx.fillStyle = state === 'replay' ? 'rgba(57,198,216,0.6)' : 'rgba(233,228,214,0.4)';
  ctx.fillText(label, stage.x + stage.w / 2, stage.y + stage.h - stage.h * 0.5);
  ctx.restore();
}
