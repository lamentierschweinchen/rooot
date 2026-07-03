/**
 * ROOOT stage — THE ENDS (the crowd), vertical at the top & bottom bands.
 *
 * Behind each goal: bengalo smoke VOLUMES rising in team colors + a dense phone-light
 * starfield. Density/glow driven by the roar numbers. Faith is visible: your end burning
 * while your light retreats. At high roar the end BURNS — this is the emotional heart,
 * it must read as ten thousand people, never as a UI strip.
 *
 * Honesty (rule 1): crowd == vertical smoke + starfield AT the ends; market ==
 * horizontal light-vs-fog ON the pitch. NEVER blended, and the crowd is COUNTS/roar,
 * never a probability.
 *
 * References:
 *  · halftime-rihanna.jpg — the stands are a dark mass DENSE with thousands of tiny
 *    lights, haze over everything; ONE saturated color owns the moment.
 *  · bengalo ends — tall colored smoke plumes cooling to grey as they rise.
 *
 * Craft: smoke puffs are pre-baked tinted radial sprites (4 cooling stages per side,
 * memoized by color) so we can afford many LARGE puffs per frame via drawImage instead
 * of per-puff gradient allocation.
 */

import { RGB } from '../theme';
import type { PitchRect, StageRect } from '../layout';
import type { SideTheme } from '../theme';
import { rgba, clamp01, mulberry32, hash11, mixRgb } from '../../lib/stage-math';
import type { RGBTuple } from '../../lib/stage-math';

interface Ember {
  x: number; // normalized offset from end center (fraction of pitch width)
  y: number; // 0 at goal line → 1 deep in the stand
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

interface Star {
  x: number;
  y: number;
  phase: number;
  base: number;
}

interface EndState {
  embers: Ember[];
  stars: Star[];
  glow: number; // smoothed roar glow 0..1
}

export interface EndInputs {
  roarHome: number;
  roarAway: number;
  countHome: number;
  countAway: number;
  /** faith flags: side is behind on the scoreboard (its counter + smoke get the ×2 warmth) */
  homeBehind: boolean;
  awayBehind: boolean;
}

const MAX_EMBERS = 150;
const MAX_STARS = 460; // the stands are FULL of lights (halftime-rihanna.jpg)
const SMOKE_STAGES = 4; // cooling steps: team color → fog grey

/** Bake one soft radial smoke sprite in the given color. */
function bakeSmoke(col: RGBTuple, size = 96): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const x = c.getContext('2d')!;
  const r = size / 2;
  const g = x.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, rgba(col, 1));
  g.addColorStop(0.45, rgba(col, 0.42));
  g.addColorStop(1, rgba(col, 0));
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

export class Ends {
  private home: EndState;
  private away: EndState;
  private rndHome = mulberry32(0xa11ce);
  private rndAway = mulberry32(0xb0b);
  /** memoized cooling-ramp sprites, keyed by "r,g,b" of the team primary */
  private smokeCache = new Map<string, HTMLCanvasElement[]>();

  constructor() {
    this.home = { embers: [], stars: [], glow: 0 };
    this.away = { embers: [], stars: [], glow: 0 };
  }

  private smokeRamp(color: RGBTuple): HTMLCanvasElement[] {
    const key = color.join(',');
    let ramp = this.smokeCache.get(key);
    if (!ramp) {
      ramp = [];
      for (let s = 0; s < SMOKE_STAGES; s++) {
        const k = s / (SMOKE_STAGES - 1); // 0 = pure team color → 1 = fog grey
        ramp.push(bakeSmoke(mixRgb(color, RGB.fog, 0.15 + k * 0.8)));
      }
      this.smokeCache.set(key, ramp);
    }
    return ramp;
  }

  /** Lay out (or re-lay) the phone-light starfields to fit the current stage bands. */
  layout(stage: StageRect): void {
    this.home.stars = this.makeStars(stage, 'home');
    this.away.stars = this.makeStars(stage, 'away');
  }

  private makeStars(_stage: StageRect, side: 'home' | 'away'): Star[] {
    const stars: Star[] = [];
    for (let i = 0; i < MAX_STARS; i++) {
      const seed = (side === 'home' ? 1000 : 5000) + i * 3;
      // depth: denser deep in the stand, thinning toward the goal line
      const depth = Math.pow(hash11(seed * 1.7), 0.65);
      stars.push({
        // normalized x in [-0.5, 0.5] and normalized depth y in [0,1] (0 = goal line);
        // both scaled to the actual crowd band at draw time so resize is exact.
        x: hash11(seed * 2.3) - 0.5,
        y: 0.05 + depth * 0.92,
        phase: hash11(seed * 3.9) * Math.PI * 2,
        base: 0.15 + hash11(seed * 5.1) * 0.85,
      });
    }
    return stars;
  }

  update(dt: number, inp: EndInputs, reduced: boolean): void {
    // roar → target glow. roar is decayed cheers/sec; map softly, saturating.
    const gh = clamp01(1 - Math.exp(-inp.roarHome / 6));
    const ga = clamp01(1 - Math.exp(-inp.roarAway / 6));
    const k = 1 - Math.exp(-dt / 0.4);
    this.home.glow += (gh - this.home.glow) * k;
    this.away.glow += (ga - this.away.glow) * k;
    if (!reduced) {
      this.spawn(this.home, inp.roarHome, this.rndHome, dt, inp.homeBehind);
      this.spawn(this.away, inp.roarAway, this.rndAway, dt, inp.awayBehind);
      this.step(this.home.embers, dt);
      this.step(this.away.embers, dt);
    }
  }

  private spawn(st: EndState, roar: number, rnd: () => number, dt: number, behind: boolean): void {
    // even a quiet end smoulders (base 8/s); roar drives it toward a wall of smoke;
    // faith (behind) burns hotter.
    const rate = 8 + clamp01(1 - Math.exp(-roar / 8)) * (behind ? 40 : 30);
    let toSpawn = rate * dt;
    while (toSpawn > 0 && st.embers.length < MAX_EMBERS) {
      if (toSpawn < 1 && rnd() > toSpawn) break;
      toSpawn -= 1;
      const spread = 0.62; // plumes across most of the end, not one chimney
      st.embers.push({
        x: (rnd() - 0.5) * spread,
        y: 0.02 + rnd() * 0.08,
        vx: (rnd() - 0.5) * 0.1,
        vy: 0.22 + rnd() * 0.3, // slow rise → the smoke HANGS (volume, not sparks)
        life: 0,
        maxLife: 2.4 + rnd() * 2.2,
        size: 0.6 + rnd() * 0.9,
      });
    }
  }

  private step(embers: Ember[], dt: number): void {
    for (let i = embers.length - 1; i >= 0; i--) {
      const e = embers[i]!;
      e.life += dt;
      if (e.life >= e.maxLife) {
        embers.splice(i, 1);
        continue;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt; // rises away from goal line into the stand
      e.vx *= 1 - 0.4 * dt;
      e.size += dt * 0.32; // puff expands as it rises
    }
  }

  /**
   * Draw one end's ATMOSPHERE (glow, smoke, phone-lights). `dir` +1 = home end at the
   * bottom, -1 = away end at the top. Rendered in a flipped local frame ("into the
   * stand" is +y), clipped to the band. Chalk counters are drawn separately (late, on
   * top of every stage layer) via drawCounters().
   */
  private drawEnd(
    ctx: CanvasRenderingContext2D,
    stage: StageRect,
    pitch: PitchRect,
    st: EndState,
    theme: SideTheme,
    dir: 1 | -1,
    t: number,
    reduced: boolean,
  ): void {
    const bandH = dir === 1 ? stage.y + stage.h - pitch.homeGoalY : pitch.awayGoalY - stage.y;
    const goalY = dir === 1 ? pitch.homeGoalY : pitch.awayGoalY;
    const cx = pitch.cx;
    const w = pitch.w;
    const color = theme.primary;
    const glow = st.glow;

    ctx.save();
    // confine ALL crowd drawing to this end's band so nothing (glow, smoke, phone-lights)
    // can bleed past the goal line onto the pitch or out into the letterbox void.
    const clipY = dir === 1 ? goalY : goalY - bandH;
    ctx.beginPath();
    ctx.rect(stage.x, clipY, stage.w, bandH);
    ctx.clip();
    // local frame: origin at goal-line center; +y goes INTO the stand (away from pitch)
    ctx.translate(cx, goalY);
    ctx.scale(1, dir === 1 ? 1 : -1);

    // 1) base bengalo glow — a tall team-color bloom over the whole end, scaled by roar
    ctx.globalCompositeOperation = 'lighter';
    const baseGlowH = bandH * (0.55 + glow * 0.45);
    const bg = ctx.createLinearGradient(0, 0, 0, baseGlowH);
    const gA = 0.07 + glow * 0.5;
    bg.addColorStop(0, rgba(color, gA));
    bg.addColorStop(0.45, rgba(color, gA * 0.42));
    bg.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = bg;
    ctx.fillRect(-w * 0.55, 0, w * 1.1, baseGlowH);

    // at HIGH roar the end BURNS — a hot line right at the goal line + a fierce inner bloom
    if (glow > 0.55) {
      const burn = (glow - 0.55) / 0.45;
      const hotH = bandH * 0.2;
      const hot = ctx.createLinearGradient(0, 0, 0, hotH);
      hot.addColorStop(0, rgba(mixRgb(color, RGB.lampWhite, 0.45), 0.5 * burn));
      hot.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = hot;
      ctx.fillRect(-w * 0.52, 0, w * 1.04, hotH);
    }

    // 2) smoke VOLUMES — big tinted puffs (pre-baked sprites, cooling ramp), rising slow.
    //    Scale is the point: plumes span the band, cooling to fog-grey as they climb.
    const ramp = this.smokeRamp(color);
    for (const e of st.embers) {
      const px = e.x * w;
      const py = e.y * bandH;
      const k = 1 - e.life / e.maxLife; // 1 fresh → 0 gone
      const fadeIn = clamp01(e.life / 0.5); // soft birth, no popping
      const sz = bandH * 0.52 * e.size * (0.55 + (1 - k) * 0.8);
      if (sz < 1) continue;
      const stageIdx = Math.min(SMOKE_STAGES - 1, Math.floor(clamp01(e.y) * SMOKE_STAGES));
      const sprite = ramp[stageIdx]!;
      ctx.globalAlpha = 0.4 * k * fadeIn * (0.4 + glow * 0.6);
      ctx.drawImage(sprite, px - sz / 2, py - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;

    // 3) phone-light starfield — a DENSE sprinkle of tiny twinkling points over the dark
    //    mass (halftime-rihanna.jpg). The brightest get a faint team halo when the end roars.
    const starW = w * 0.98;
    for (const s of st.stars) {
      const px = s.x * starW;
      const py = s.y * bandH;
      if (py > bandH) continue;
      const tw = reduced ? s.base : s.base * (0.35 + 0.65 * Math.sin(t * 2.4 + s.phase));
      // at high roar the lights must read THROUGH the smoke — alpha and size climb with glow
      const a = tw * (0.32 + glow * 0.62);
      const sz = (0.6 + s.base * 1.0) * (1 + glow * 0.5);
      if (glow > 0.45 && s.base > 0.86) {
        const hsz = sz * 3.4;
        const hg = ctx.createRadialGradient(px, py, 0, px, py, hsz / 2);
        hg.addColorStop(0, rgba(color, a * 0.45 * glow));
        hg.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = hg;
        ctx.fillRect(px - hsz / 2, py - hsz / 2, hsz, hsz);
      }
      ctx.fillStyle = rgba(RGB.chalk, a);
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
    }

    ctx.restore();
  }

  /**
   * The chalk counters — drawn LATE by the stage (after vignette/grain) so they sit above
   * every atmosphere layer, inside their end bands, legible, never mid-pitch.
   */
  drawCounters(
    ctx: CanvasRenderingContext2D,
    stage: StageRect,
    pitch: PitchRect,
    inp: EndInputs,
  ): void {
    this.drawCounter(ctx, stage, pitch, 1, inp.countHome, inp.homeBehind);
    this.drawCounter(ctx, stage, pitch, -1, inp.countAway, inp.awayBehind);
  }

  private drawCounter(
    ctx: CanvasRenderingContext2D,
    stage: StageRect,
    pitch: PitchRect,
    dir: 1 | -1,
    count: number,
    behind: boolean,
  ): void {
    const cx = pitch.cx;
    // both counters live INSIDE their end band, tucked against the goal line —
    // home just below the bottom goal line, away just above the top goal line.
    const y = dir === 1 ? pitch.homeGoalY + stage.h * 0.028 : pitch.awayGoalY - stage.h * 0.022;
    const fs = Math.max(10, stage.w * 0.025);
    ctx.save();
    ctx.textBaseline = 'middle';
    const label = count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K` : `${count}`;
    ctx.font = `600 ${fs}px ui-monospace, Menlo, monospace`;
    const gap = fs * 0.35;
    const numW = ctx.measureText(label).width;
    ctx.font = `500 ${fs * 0.66}px ui-monospace, Menlo, monospace`;
    const tag = ' ROOTED';
    const tagW = ctx.measureText(tag).width;
    const total = numW + gap + tagW;
    // a soft dark backing so chalk stays legible over bright smoke/lamp glow
    ctx.textAlign = 'left';
    ctx.lineWidth = Math.max(2, fs * 0.22);
    ctx.strokeStyle = 'rgba(4,6,10,0.55)';
    ctx.lineJoin = 'round';
    ctx.font = `600 ${fs}px ui-monospace, Menlo, monospace`;
    ctx.strokeText(label, cx - total / 2, y);
    ctx.fillStyle = rgba(RGB.chalk, behind ? 0.88 : 0.62);
    ctx.fillText(label, cx - total / 2, y);
    ctx.font = `500 ${fs * 0.66}px ui-monospace, Menlo, monospace`;
    ctx.strokeText(tag, cx - total / 2 + numW + gap, y);
    ctx.fillStyle = rgba(RGB.chalkDim, 0.68);
    ctx.fillText(tag, cx - total / 2 + numW + gap, y);
    ctx.textAlign = 'center';
    if (behind) {
      ctx.font = `italic 500 ${fs * 0.72}px Georgia, serif`;
      const fy = y + fs * 1.1 * dir;
      ctx.strokeText('cheers count double', cx, fy);
      ctx.fillStyle = rgba(RGB.fireMid, 0.78);
      ctx.fillText('cheers count double', cx, fy);
    }
    ctx.restore();
  }

  draw(
    ctx: CanvasRenderingContext2D,
    stage: StageRect,
    pitch: PitchRect,
    homeTheme: SideTheme,
    awayTheme: SideTheme,
    inp: EndInputs,
    t: number,
    reduced: boolean,
  ): void {
    this.drawEnd(ctx, stage, pitch, this.home, homeTheme, 1, t, reduced);
    this.drawEnd(ctx, stage, pitch, this.away, awayTheme, -1, t, reduced);
  }
}
