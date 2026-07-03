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
 * One bank of shafts from a goal line toward an edge, into the additive light buffer.
 * `dir` +1 = bank at the bottom firing up (home); -1 = bank at top firing down (away).
 * Each lamp is a soft cone: a vertical gradient (bright at source → dies at edge) whose
 * horizontal extent is a smooth bell (no hard sides). Painted with 'lighter' so
 * neighbouring cones overlap into a continuous, breathing wall of light with soft gaps.
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

  const core = side.lightTint; // floodlight white + a whisper of side color
  const bankWidth = pitch.w * 1.06;
  const bx0 = pitch.cx - bankWidth / 2;
  const lampGap = bankWidth / LAMPS;
  const e = energy * alive;
  const yTop = Math.min(originY, edgeY);

  // ── DISTINCT VERTICAL SHAFTS, drawn directly & additively on the light buffer. Each
  //    shaft = a stack of concentric vertical rects (wide soft halo → narrow bright core),
  //    each a vertical gradient bright at the floodlight source → dying before the fog
  //    edge. The additive stack gives soft sides; the widest halo stays < the lamp spacing
  //    so real dark GAPS survive between shafts — the floodlight-and-fog look. ──
  lightCtx.save();
  lightCtx.globalCompositeOperation = 'lighter';

  // under-wash first (broad soft column filling the valleys just a little)
  const wash = lightCtx.createLinearGradient(0, originY, 0, edgeY);
  wash.addColorStop(0, rgba(core, 0.2 * e));
  wash.addColorStop(0.5, rgba(core, 0.1 * e));
  wash.addColorStop(0.85, rgba(core, 0.03 * e));
  wash.addColorStop(1, rgba(core, 0));
  lightCtx.save();
  lightCtx.beginPath();
  lightCtx.rect(pitch.x, yTop, pitch.w, reach);
  lightCtx.clip();
  lightCtx.fillStyle = wash;
  lightCtx.fillRect(pitch.x, yTop, pitch.w, reach);
  lightCtx.restore();

  // Each shaft = a stack of concentric-width vertical rects (soft sides from the additive
  // overlap of 3 widths), EACH filled with a CONTINUOUS vertical gradient (bright at the
  // floodlight source → collapsing toward the fog edge). Continuous gradient = no horizontal
  // seams; the widest layer stays < lampGap/2 so dark GAPS survive between shafts. The core
  // is offset a hair per lamp and brightness varies per lamp so the bank isn't a barcode.
  for (let i = 0; i < LAMPS; i++) {
    const lampX = bx0 + lampGap * (i + 0.5);
    const flick = reduced ? 1 : 0.9 + 0.1 * Math.sin(t * (1.2 + hash11(i) * 1.6) + i * 2.1);
    const spread = 1 + 0.14 * Math.sin(t * 0.4 + i);
    const lampVar = 0.72 + 0.28 * hash11(i * 4.7 + (dir === 1 ? 0 : 50));
    const peak = e * flick * lampVar;
    const layers: Array<{ hw: number; k: number }> = [
      { hw: lampGap * 0.5 * spread, k: 0.24 }, // wide soft halo
      { hw: lampGap * 0.32 * spread, k: 0.4 }, // mid
      { hw: lampGap * 0.16, k: 0.62 }, // bright core
    ];
    for (const L of layers) {
      const av = peak * L.k;
      if (av < 0.005) continue;
      const vg = lightCtx.createLinearGradient(0, originY, 0, edgeY);
      // continuous, hard-collapsing vertical falloff (pool at the source, die into fog)
      vg.addColorStop(0, rgba(core, Math.min(1, av)));
      vg.addColorStop(0.06, rgba(core, Math.min(1, av) * 0.92));
      vg.addColorStop(0.22, rgba(core, av * 0.5));
      vg.addColorStop(0.45, rgba(core, av * 0.22));
      vg.addColorStop(0.7, rgba(core, av * 0.06));
      vg.addColorStop(1, rgba(core, 0));
      lightCtx.fillStyle = vg;
      lightCtx.fillRect(lampX - L.hw, yTop, L.hw * 2, reach);
    }
  }

  // 5) the floodlight bank flaring at the source — a bright, defined bloom at the goal
  //    line (the lamps themselves), so the eye reads WHERE the light comes from.
  const flareH = pitch.h * 0.07;
  const fy = dir === 1 ? originY - flareH * 0.15 : originY - flareH * 0.85;
  const srcGlow = lightCtx.createLinearGradient(0, fy, 0, fy + flareH);
  const stopA = dir === 1 ? 1 : 0;
  srcGlow.addColorStop(stopA, rgba(RGB.lightCore, 0.8 * e));
  srcGlow.addColorStop(0.5, rgba(RGB.lightCore, 0.3 * e));
  srcGlow.addColorStop(1 - stopA, rgba(RGB.lightCore, 0));
  lightCtx.fillStyle = srcGlow;
  lightCtx.fillRect(bx0, fy, bankWidth, flareH);
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
  g.addColorStop(0, rgba(RGB.grassGlow, 0.34 * e * breath));
  g.addColorStop(0.3, rgba(RGB.grassLit, 0.2 * e));
  g.addColorStop(0.65, rgba(RGB.grassLit, 0.08 * e));
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
