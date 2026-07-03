/**
 * ROOOT stage — THE MARKET: two floodlight banks pressing illuminated territory.
 *
 * The crown. From the bottom, YOUR side's floodlight bank throws volumetric shafts UP
 * the grass; from the top, THEIR bank presses DOWN. Each bank dies exactly at its
 * probability edge (computeFront). Between the two dying fronts is the fog (the draw).
 * The grass reads green ONLY where a light pool reaches.
 *
 * References:
 *  · floodlight-and-fog.jpg — a BANK of discrete cones with visible body + soft gaps;
 *    the ground catches a whisper; light bleeds at the edges (no hard triangle edges).
 *  · halftime-show.jpg — turf greens only under the light; falls to black beyond it.
 *
 * v1 failure this rewrite fixes: shafts drawn as hard triangles clipped against a
 * hard-edged grass pool → the whole pitch read as a decorative diamond pattern. Now:
 *  · the grass greening is one SMOOTH full-width vertical gradient (no per-shaft edges);
 *  · each shaft is a soft vertical gradient with a RADIAL horizontal falloff (soft body,
 *    soft sides), summed additively so overlaps bloom like real haze-scatter.
 */

import { RGB } from '../theme';
import type { PitchRect, MarketFront } from '../layout';
import type { SideTheme } from '../theme';
import { rgba, hash11, clamp01 } from '../../lib/stage-math';

const LAMPS = 7; // discrete cones per bank (echoes the 8-floodlight reference)

export interface MarketDrawArgs {
  pitch: PitchRect;
  front: MarketFront;
  home: SideTheme;
  away: SideTheme;
  t: number; // ambient phase (s)
  energy: number; // 0..1 global light energy
  homeAlive: number; // per-side collapse 0..1
  awayAlive: number;
  reducedMotion: boolean;
}

/**
 * One bank: 7 DISCRETE lamps (floodlight-and-fog.jpg), not a picket fence. Every lamp
 * has its own seeded character (stable per fixture): intensity, width, a slight tilt.
 * Per lamp, three elements:
 *   1. the BURNING HEAD — a blown-white core + warm halation right at the goal line
 *      (the reference's burning rectangles; the brightest pixels on the stage);
 *   2. the SHAFT — a tilted soft column (concentric halo+core), bright at the head,
 *      collapsing toward the probability edge; neighbours overlap into each other;
 *   3. the TIP SCATTER — a soft bloom where the shaft dies into the fog (the fog
 *      eating the light at the contact line).
 * `dir` +1 = bank at the bottom firing up (home); -1 = at the top firing down (away).
 */
function drawBank(
  lightCtx: CanvasRenderingContext2D,
  pitch: PitchRect,
  originY: number,
  edgeY: number,
  side: SideTheme,
  t: number,
  energy: number,
  alive: number,
  dir: 1 | -1,
  reduced: boolean,
): void {
  const reach = Math.abs(edgeY - originY);
  if (reach < 1 || alive <= 0.001 || energy <= 0.001) return;

  const core = side.lightTint; // warm floodlight white + a whisper of side color
  const bankWidth = pitch.w * 1.02;
  const bx0 = pitch.cx - bankWidth / 2;
  const lampGap = bankWidth / LAMPS;
  const e = energy * alive;
  const yTop = Math.min(originY, edgeY);
  const seedBase = dir === 1 ? 3 : 71; // stable per fixture side

  lightCtx.save();
  lightCtx.globalCompositeOperation = 'lighter';

  // faint under-wash — just enough that the pool reads continuous; the shafts carry it
  const wash = lightCtx.createLinearGradient(0, originY, 0, edgeY);
  wash.addColorStop(0, rgba(core, 0.1 * e));
  wash.addColorStop(0.45, rgba(core, 0.05 * e));
  wash.addColorStop(0.8, rgba(core, 0.015 * e));
  wash.addColorStop(1, rgba(core, 0));
  lightCtx.save();
  lightCtx.beginPath();
  lightCtx.rect(pitch.x, yTop, pitch.w, reach);
  lightCtx.clip();
  lightCtx.fillStyle = wash;
  lightCtx.fillRect(pitch.x, yTop, pitch.w, reach);
  lightCtx.restore();

  for (let i = 0; i < LAMPS; i++) {
    // ── seeded per-lamp character (stable): intensity, width, tilt ──
    const s1 = hash11(seedBase + i * 4.7);
    const s2 = hash11(seedBase + i * 9.3 + 1.7);
    const s3 = hash11(seedBase + i * 13.1 + 4.2);
    const lampVar = 0.6 + 0.45 * s1; // some lamps burn hotter
    const widthK = 0.85 + 0.45 * s2; // some are fatter
    const tilt = (s3 - 0.5) * 0.14; // slight angular spread, ±4°
    const lampX = bx0 + lampGap * (i + 0.5) + (s2 - 0.5) * lampGap * 0.18;
    const flick = reduced ? 1 : 0.92 + 0.08 * Math.sin(t * (1.2 + s1 * 1.6) + i * 2.1);
    const peak = e * flick * lampVar;

    // ── 2. the shaft — tilted via a shear transform around the head origin ──
    lightCtx.save();
    lightCtx.translate(lampX, originY);
    lightCtx.transform(1, 0, tilt * -dir, 1, 0, 0); // shear: x drifts with distance from head
    const relEdge = edgeY - originY; // negative for home (up), positive for away (down)
    const layers: Array<{ hw: number; k: number }> = [
      { hw: lampGap * 0.62 * widthK, k: 0.26 }, // wide halo — overlaps the neighbours
      { hw: lampGap * 0.3 * widthK, k: 0.5 }, // mid
      { hw: lampGap * 0.13, k: 0.85 }, // bright core
    ];
    for (const L of layers) {
      const av = peak * L.k;
      if (av < 0.005) continue;
      const vg = lightCtx.createLinearGradient(0, 0, 0, relEdge);
      // bright at the head, collapsing toward the fog edge
      vg.addColorStop(0, rgba(core, Math.min(1, av)));
      vg.addColorStop(0.07, rgba(core, Math.min(1, av) * 0.9));
      vg.addColorStop(0.25, rgba(core, av * 0.48));
      vg.addColorStop(0.5, rgba(core, av * 0.2));
      vg.addColorStop(0.78, rgba(core, av * 0.05));
      vg.addColorStop(1, rgba(core, 0));
      lightCtx.fillStyle = vg;
      const y0 = Math.min(0, relEdge);
      lightCtx.fillRect(-L.hw, y0, L.hw * 2, Math.abs(relEdge));
    }
    lightCtx.restore();

    // ── 3. tip scatter — the fog eats the light where the shaft dies ──
    const tipX = lampX + tilt * -dir * relEdge; // where the sheared core lands at the edge
    const tipR = lampGap * (0.7 + 0.3 * s2);
    const tip = lightCtx.createRadialGradient(tipX, edgeY, 0, tipX, edgeY, tipR);
    tip.addColorStop(0, rgba(RGB.fog, 0.16 * peak));
    tip.addColorStop(0.6, rgba(RGB.fog, 0.06 * peak));
    tip.addColorStop(1, rgba(RGB.fog, 0));
    lightCtx.fillStyle = tip;
    lightCtx.fillRect(tipX - tipR, edgeY - tipR, tipR * 2, tipR * 2);

    // ── 1. the BURNING HEAD — blown-white core + warm halation (drawn last, on top) ──
    const headY = originY + dir * pitch.h * 0.008; // a hair off-pitch, on the goal line
    // broad soft bloom
    const bloomR = lampGap * 1.15;
    const bloom = lightCtx.createRadialGradient(lampX, headY, 0, lampX, headY, bloomR);
    bloom.addColorStop(0, rgba(RGB.lampHalo, 0.4 * peak));
    bloom.addColorStop(0.45, rgba(RGB.lampHalo, 0.12 * peak));
    bloom.addColorStop(1, rgba(RGB.lampHalo, 0));
    lightCtx.fillStyle = bloom;
    lightCtx.fillRect(lampX - bloomR, headY - bloomR, bloomR * 2, bloomR * 2);
    // warm halation ring
    const haloR = lampGap * 0.5;
    const halo = lightCtx.createRadialGradient(lampX, headY, 0, lampX, headY, haloR);
    halo.addColorStop(0, rgba(RGB.lampWhite, 0.95 * peak));
    halo.addColorStop(0.4, rgba(RGB.lampHalo, 0.45 * peak));
    halo.addColorStop(1, rgba(RGB.lampHalo, 0));
    lightCtx.fillStyle = halo;
    lightCtx.fillRect(lampX - haloR, headY - haloR, haloR * 2, haloR * 2);
    // the burning core — near-white, tiny, blown out
    const coreR = lampGap * 0.17;
    const head = lightCtx.createRadialGradient(lampX, headY, 0, lampX, headY, coreR);
    head.addColorStop(0, rgba(RGB.lampWhite, Math.min(1, 1.4 * peak)));
    head.addColorStop(0.65, rgba(RGB.lampWhite, 0.55 * peak));
    head.addColorStop(1, rgba(RGB.lampWhite, 0));
    lightCtx.fillStyle = head;
    lightCtx.fillRect(lampX - coreR, headY - coreR, coreR * 2, coreR * 2);
  }

  lightCtx.restore();
}

/** Grass greens ONLY where light reaches — ONE smooth full-width gradient (no hard edges). */
function drawGrassPool(
  main: CanvasRenderingContext2D,
  pitch: PitchRect,
  originY: number,
  edgeY: number,
  t: number,
  energy: number,
  alive: number,
  reduced: boolean,
): void {
  const reach = Math.abs(edgeY - originY);
  if (reach < 1 || alive <= 0.001) return;
  const e = energy * alive;
  const breath = reduced ? 1 : 0.95 + 0.05 * Math.sin(t * 0.6);

  main.save();
  // clip to pitch, then paint a smooth vertical green gradient + horizontal falloff.
  main.beginPath();
  main.rect(pitch.x, Math.min(originY, edgeY), pitch.w, reach);
  main.clip();
  main.globalCompositeOperation = 'lighter';

  const g = main.createLinearGradient(0, originY, 0, edgeY);
  g.addColorStop(0, rgba(RGB.grassGlow, 0.26 * e * breath));
  g.addColorStop(0.3, rgba(RGB.grassLit, 0.15 * e));
  g.addColorStop(0.65, rgba(RGB.grassLit, 0.05 * e));
  g.addColorStop(1, rgba(RGB.grassGlow, 0));
  main.fillStyle = g;
  main.fillRect(pitch.x, Math.min(originY, edgeY), pitch.w, reach);

  // horizontal falloff — grass is brightest mid-pitch under the bank, dimmer at touchlines
  main.globalCompositeOperation = 'destination-in';
  const hFall = main.createLinearGradient(pitch.x, 0, pitch.x + pitch.w, 0);
  hFall.addColorStop(0, 'rgba(0,0,0,0.35)');
  hFall.addColorStop(0.5, 'rgba(0,0,0,1)');
  hFall.addColorStop(1, 'rgba(0,0,0,0.35)');
  main.fillStyle = hFall;
  main.fillRect(pitch.x, Math.min(originY, edgeY), pitch.w, reach);
  main.restore();
}

/** Faint horizontal glitter where the light meets the grass at the origin (the whisper). */
function drawGroundGlitter(
  main: CanvasRenderingContext2D,
  pitch: PitchRect,
  originY: number,
  energy: number,
  alive: number,
): void {
  if (alive <= 0.02) return;
  const e = energy * alive;
  main.save();
  main.globalCompositeOperation = 'lighter';
  const band = pitch.h * 0.045;
  const n = Math.floor(pitch.w / 4);
  for (let i = 0; i < n; i++) {
    const fx = i / n; // 0..1 across pitch
    // fade glitter toward the touchlines to match the grass falloff
    const edgeFade = clamp01(1 - Math.abs(fx - 0.5) * 1.4);
    const gx = pitch.x + pitch.w * fx + hash11(i * 3.1) * 3;
    const gy = originY - hash11(i * 7.7) * band;
    const s = 0.5 + hash11(i * 11.3) * 1.4;
    main.fillStyle = rgba(RGB.lightCore, 0.05 * e * edgeFade * (0.4 + hash11(i * 5.5) * 0.6));
    main.fillRect(gx, gy, s, s);
  }
  main.restore();
}

export function drawMarket(
  main: CanvasRenderingContext2D,
  lightCtx: CanvasRenderingContext2D,
  a: MarketDrawArgs,
): void {
  const { pitch, front, t, energy, homeAlive, awayAlive, reducedMotion } = a;

  // grass greening + glitter (on main, under the light bloom)
  drawGrassPool(main, pitch, pitch.homeGoalY, front.homeEdgeY, t, energy, homeAlive, reducedMotion);
  drawGrassPool(main, pitch, pitch.awayGoalY, front.awayEdgeY, t, energy, awayAlive, reducedMotion);
  drawGroundGlitter(main, pitch, pitch.homeGoalY, energy, homeAlive);
  drawGroundGlitter(main, pitch, pitch.awayGoalY, energy, awayAlive);

  // volumetric shafts — drawn directly & additively into the light buffer
  drawBank(lightCtx, pitch, pitch.homeGoalY, front.homeEdgeY, a.home, t, energy, homeAlive, 1, reducedMotion);
  drawBank(lightCtx, pitch, pitch.awayGoalY, front.awayEdgeY, a.away, t, energy, awayAlive, -1, reducedMotion);
}
