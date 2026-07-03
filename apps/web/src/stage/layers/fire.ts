/**
 * ROOOT stage — THE GOAL FIRE. The one moment everything is allowed.
 *
 * A fire plume erupts at the REAL goal mouth (bottom if home scored, top if away) —
 * brief and enormous, white-hot core → orange → smoke, then it collapses to a rising
 * smoke ghost. Reference: halftime-show.jpg fire plumes (billowing, upward, incandescent).
 *
 * The beaten side's light collapse is handled by the stage (energy on that side dips);
 * here we own only the eruption. NaN-safe, self-terminating.
 */

import { RGB } from '../theme';
import type { PitchRect } from '../layout';
import { rgba, clamp01, mulberry32, hash11 } from '../../lib/stage-math';

interface Flame {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  heat: number; // 1 = white core, →0 = smoke
}

interface Blast {
  side: 'home' | 'away';
  age: number;
  flames: Flame[];
  rnd: () => number;
  seeded: boolean;
}

const DURATION = 2.6; // seconds of active fire before it's all smoke

export class Fire {
  private blasts: Blast[] = [];
  private seed = 0;

  /** Trigger an eruption at the goal mouth of `side`. */
  erupt(side: 'home' | 'away'): void {
    this.blasts.push({ side, age: 0, flames: [], rnd: mulberry32(0xf1a3 + this.seed++), seeded: false });
  }

  get active(): boolean {
    return this.blasts.length > 0;
  }

  /** 0..1 intensity of the most recent blast — the stage uses this to whiten/flash. */
  peakIntensity(): number {
    let m = 0;
    for (const b of this.blasts) {
      const i = clamp01(1 - b.age / DURATION);
      if (i > m) m = i;
    }
    return m;
  }

  update(dt: number): void {
    for (let bi = this.blasts.length - 1; bi >= 0; bi--) {
      const b = this.blasts[bi]!;
      b.age += dt;
      // emit MANY flames hard at the start, tapering across DURATION → a dense plume
      const emit = clamp01(1 - b.age / DURATION);
      let n = emit * emit * 130 * dt;
      while (n > 0 && b.flames.length < 520) {
        if (n < 1 && b.rnd() > n) break;
        n -= 1;
        const spread = 0.1 + b.rnd() * 0.05;
        b.flames.push({
          x: (b.rnd() - 0.5) * spread,
          y: 0,
          vx: (b.rnd() - 0.5) * 0.3,
          vy: 0.5 + b.rnd() * 0.7, // slower rise → the plume stays near the goal mouth
          life: 0,
          maxLife: 0.55 + b.rnd() * 0.7,
          size: 0.35 + b.rnd() * 0.6,
          heat: 1,
        });
      }
      for (let i = b.flames.length - 1; i >= 0; i--) {
        const f = b.flames[i]!;
        f.life += dt;
        if (f.life >= f.maxLife) {
          b.flames.splice(i, 1);
          continue;
        }
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.vy *= 1 - 1.6 * dt; // strong drag → the plume slows fast, capping near the mouth
        f.vx *= 1 - 0.9 * dt;
        f.size += dt * 0.9;
        f.heat = clamp01(1 - f.life / f.maxLife);
      }
      // retire a blast once fully aged and burnt out
      if (b.age > DURATION + 1.0 && b.flames.length === 0) {
        this.blasts.splice(bi, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, pitch: PitchRect): void {
    for (const b of this.blasts) {
      const dir: 1 | -1 = b.side === 'home' ? 1 : -1;
      const goalY = dir === 1 ? pitch.homeGoalY : pitch.awayGoalY;
      const cx = pitch.cx;
      const w = pitch.w;
      const H = pitch.h;
      const startI = clamp01(1 - b.age / 0.5); // the initial ignition flash

      ctx.save();
      ctx.translate(cx, goalY);
      ctx.scale(1, dir === 1 ? -1 : 1); // +y = up the pitch, away from the mouth
      ctx.globalCompositeOperation = 'lighter';

      // ignition flash — a bright dome right at the mouth for the first instant
      if (startI > 0.01) {
        const fl = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.5);
        fl.addColorStop(0, rgba(RGB.fireCore, 0.8 * startI));
        fl.addColorStop(0.4, rgba(RGB.fireMid, 0.4 * startI));
        fl.addColorStop(1, rgba(RGB.fireDeep, 0));
        ctx.fillStyle = fl;
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // the flames — colored radial gradients (drawImage can't tint a sprite), so the
      // fire actually reads white-hot → orange → deep → smoke as it cools.
      for (const f of b.flames) {
        const px = f.x * w;
        const py = f.y * H * 0.34; // plume height capped to ~a third of the pitch (the mouth)
        const sz = H * 0.06 * f.size;
        let col: readonly [number, number, number];
        let a: number;
        if (f.heat > 0.66) {
          col = RGB.fireCore;
          a = 0.9;
        } else if (f.heat > 0.33) {
          col = RGB.fireMid;
          a = 0.72;
        } else if (f.heat > 0.12) {
          col = RGB.fireDeep;
          a = 0.5;
        } else {
          col = RGB.fogDeep; // burnt out → smoke
          a = 0.16;
        }
        a *= 0.55 + hash11(f.x * 97 + f.y * 13) * 0.45;
        ctx.globalCompositeOperation = f.heat <= 0.12 ? 'source-over' : 'lighter';
        const g = ctx.createRadialGradient(px, py, 0, px, py, sz / 2);
        g.addColorStop(0, rgba(col, a));
        g.addColorStop(0.5, rgba(col, a * 0.45));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(px - sz / 2, py - sz / 2, sz, sz);
      }
      ctx.restore();
    }
  }
}
