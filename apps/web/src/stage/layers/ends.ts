/**
 * ROOOT stage — THE ENDS (the crowd), vertical at the top & bottom bands.
 *
 * Behind each goal: bengalo smoke rising VERTICALLY in team colors + a phone-light
 * starfield. Density/glow driven by the roar numbers. Rooted counts shown as a small
 * chalk counter. Faith is visible: your end burning while your light retreats.
 *
 * Honesty (rule 1): crowd == vertical smoke + starfield AT the ends; market ==
 * horizontal light-vs-fog ON the pitch. NEVER blended, and the crowd is COUNTS/roar,
 * never a probability.
 *
 * References:
 *  · halftime-rihanna.jpg — the starfield of phone lights; ONE saturated color owns it.
 *  · flares/bengalos — colored smoke columns rising, glow at the base.
 */

import { RGB } from '../theme';
import type { PitchRect, StageRect } from '../layout';
import type { SideTheme } from '../theme';
import { rgba, clamp01, mulberry32, hash11, mixRgb } from '../../lib/stage-math';

interface Ember {
  x: number; // relative to end center, in px
  y: number; // 0 at goal line, grows away into the stand
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

const MAX_EMBERS = 90;
const MAX_STARS = 240; // a FINE dense sprinkle of phone lights, not a few blobs

export class Ends {
  private home: EndState;
  private away: EndState;
  private rndHome = mulberry32(0xa11ce);
  private rndAway = mulberry32(0xb0b);

  constructor() {
    // team-colored smoke + phone-lights are drawn as gradients (drawImage can't tint),
    // so no baked sprites are needed here.
    this.home = { embers: [], stars: [], glow: 0 };
    this.away = { embers: [], stars: [], glow: 0 };
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
      const depth = Math.pow(hash11(seed * 1.7), 0.7);
      stars.push({
        // normalized x in [-0.5, 0.5] and normalized depth y in [0,1] (0 = goal line);
        // both scaled to the actual crowd band at draw time so resize is exact.
        x: hash11(seed * 2.3) - 0.5,
        y: 0.06 + depth * 0.9,
        phase: hash11(seed * 3.9) * Math.PI * 2,
        base: 0.2 + hash11(seed * 5.1) * 0.8,
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
    // spawn rate scales with roar; faith (behind) burns a little hotter (×~1.4 visual)
    const rate = clamp01(1 - Math.exp(-roar / 8)) * (behind ? 34 : 24);
    let toSpawn = rate * dt;
    while (toSpawn > 0 && st.embers.length < MAX_EMBERS) {
      if (toSpawn < 1 && rnd() > toSpawn) break;
      toSpawn -= 1;
      const spread = 0.42;
      st.embers.push({
        x: (rnd() - 0.5) * spread,
        y: 0,
        vx: (rnd() - 0.5) * 0.18,
        vy: 0.5 + rnd() * 0.6,
        life: 0,
        maxLife: 1.6 + rnd() * 1.8,
        size: 0.5 + rnd() * 0.9,
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
      e.vx *= 1 - 0.5 * dt; // wander damps
      e.size += dt * 0.4; // puff expands as it rises
    }
  }

  /**
   * Draw one end. `dir` +1 = home end at bottom (rises upward, toward smaller y),
   * -1 = away end at top (rises downward). We render in a translated/flipped frame so
   * "up into the stand" is always +local-y, then place it in the correct band.
   */
  private drawEnd(
    ctx: CanvasRenderingContext2D,
    stage: StageRect,
    pitch: PitchRect,
    st: EndState,
    theme: SideTheme,
    dir: 1 | -1,
    t: number,
    behind: boolean,
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

    // 1) base bengalo glow at the goal line — a warm bloom in team color, scaled by roar.
    //    Kept modest so the crowd never out-shouts the market's light on the pitch.
    ctx.globalCompositeOperation = 'lighter';
    const baseGlowH = bandH * (0.45 + glow * 0.45);
    const bg = ctx.createLinearGradient(0, 0, 0, baseGlowH);
    const gA = 0.05 + glow * 0.38;
    bg.addColorStop(0, rgba(color, gA));
    bg.addColorStop(0.4, rgba(color, gA * 0.4));
    bg.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = bg;
    ctx.fillRect(-w * 0.55, 0, w * 1.1, baseGlowH);

    // 2) smoke columns — team-colored bengalo puffs rising vertically. Drawn as radial
    //    gradients (NOT the white sprite — drawImage can't tint), team color at the base
    //    cooling to fog-grey as they rise. This is the crowd's color; honesty rule 1.
    ctx.globalCompositeOperation = 'lighter';
    for (const e of st.embers) {
      const px = e.x * w;
      const py = e.y * bandH;
      const k = 1 - e.life / e.maxLife; // 1 fresh → 0 gone
      const rise = e.y; // 0 at goal line → ~1 deep in stand
      const sz = bandH * 0.14 * e.size * (0.6 + (1 - k) * 0.9);
      if (sz < 0.5) continue;
      const a = 0.42 * k * (0.35 + glow * 0.65);
      // cool from team color → fog grey with height (smoke turning to haze)
      const col = mixRgb(color, RGB.fog, clamp01(rise * 0.9));
      const g = ctx.createRadialGradient(px, py, 0, px, py, sz / 2);
      g.addColorStop(0, rgba(col, a));
      g.addColorStop(0.5, rgba(col, a * 0.4));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
    }

    // 3) phone-light starfield — a FINE dense sprinkle of tiny twinkling points
    //    (halftime-rihanna.jpg). Points are ~1px cool-white; the brightest few get a faint
    //    team-colored halo only when the end is roaring. Nothing large enough to read as a blob.
    const starW = w * 0.98;
    for (const s of st.stars) {
      const px = s.x * starW;
      const py = s.y * bandH;
      if (py > bandH) continue;
      const tw = reduced ? s.base : s.base * (0.5 + 0.5 * Math.sin(t * 2.2 + s.phase));
      const a = tw * (0.28 + glow * 0.45);
      const sz = 0.8 + s.base * 1.0; // tiny
      // a whisper of team-colored halo on the brightest lights when the end is loud
      if (glow > 0.4 && s.base > 0.82) {
        const hsz = sz * 3;
        const hg = ctx.createRadialGradient(px, py, 0, px, py, hsz / 2);
        hg.addColorStop(0, rgba(color, a * 0.4 * glow));
        hg.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = hg;
        ctx.fillRect(px - hsz / 2, py - hsz / 2, hsz, hsz);
      }
      ctx.fillStyle = rgba(RGB.chalk, a);
      ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
    }

    ctx.restore();

    // 4) the chalk counter — small, matchday-programme voice, in the band, upright
    this.drawCounter(ctx, stage, pitch, dir, dir === 1 ? this.counts.home : this.counts.away, behind);
  }

  // counts kept for the counter render (set each frame in draw())
  private counts = { home: 0, away: 0 };

  private drawCounter(
    ctx: CanvasRenderingContext2D,
    stage: StageRect,
    pitch: PitchRect,
    dir: 1 | -1,
    count: number,
    behind: boolean,
  ): void {
    const cx = pitch.cx;
    // home counter sits low in the bottom band. away counter reads as a small chalk mark
    // just below the scoreboard's divider (~0.134h) — clear of the score, over the far grass.
    const y = dir === 1 ? stage.y + stage.h - stage.h * 0.05 : stage.y + stage.h * 0.168;
    const fs = Math.max(10, stage.w * 0.025);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // count + a small caps 'ROOTED' label, chalk — the crowd's size as a programme note
    const label = count >= 1000 ? `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K` : `${count}`;
    ctx.font = `600 ${fs}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = rgba(RGB.chalk, behind ? 0.8 : 0.52);
    const gap = fs * 0.35;
    const numW = ctx.measureText(label).width;
    ctx.font = `500 ${fs * 0.66}px ui-monospace, Menlo, monospace`;
    const tag = ' ROOTED';
    const tagW = ctx.measureText(tag).width;
    const total = numW + gap + tagW;
    ctx.textAlign = 'left';
    ctx.font = `600 ${fs}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = rgba(RGB.chalk, behind ? 0.82 : 0.55);
    ctx.fillText(label, cx - total / 2, y);
    ctx.font = `500 ${fs * 0.66}px ui-monospace, Menlo, monospace`;
    ctx.fillStyle = rgba(RGB.chalkDim, 0.6);
    ctx.fillText(tag, cx - total / 2 + numW + gap, y);
    ctx.textAlign = 'center';
    if (behind) {
      ctx.font = `italic 500 ${fs * 0.72}px Georgia, serif`;
      ctx.fillStyle = rgba(RGB.fireMid, 0.7);
      ctx.fillText('cheers count double', cx, y + fs * 1.05 * dir);
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
    this.counts.home = inp.countHome;
    this.counts.away = inp.countAway;
    this.drawEnd(ctx, stage, pitch, this.home, homeTheme, 1, t, inp.homeBehind, reduced);
    this.drawEnd(ctx, stage, pitch, this.away, awayTheme, -1, t, inp.awayBehind, reduced);
  }
}
