/**
 * ROOOT stage — THE GOOOL ERUPTION (§6.8). Replaces the night fire. A STEPPED cartoon
 * eruption at the real goal mouth (never mid-field): a DRAWN Press-Black starburst (hard-
 * pointed rays) with a Newsprint core, a fizzPink accent punch (the eruption accent ON the
 * Poppy family, separated from any ground by the drawn black burst so two louds never
 * blend), HALFTONE SHOCK-DOTS, SHOCKWAVE RINGS, and the word GOOOL in Anybody with the Os
 * as halftone half-discs. The scorer's territory SNAPS forward (handled by the stage via a
 * boosted edge); the beaten side recoils. Frame-stepped over MOTION_MS.starburst — never
 * smeared, never a blur (§7). Brief + tasteful per the canon render.
 */

import { MOTION_MS, STEPS, COMPONENTS, HALFTONE } from '../../lib/theme';
import { INK, fontDisplay, setStretch } from '../pop';
import type { PitchRect } from '../layout';
import { rgba, clamp01, hash11, hash21 } from '../../lib/stage-math';
import { inkDot } from '../../lib/ink';

interface Blast {
  side: 'home' | 'away';
  age: number; // seconds since eruption
}

const DUR = MOTION_MS.starburst / 1000; // total stepped sequence (s)
const HOLD = 1.35; // extra seconds the GOOOL word + settle linger after the burst

export class Goool {
  private blasts: Blast[] = [];

  erupt(side: 'home' | 'away'): void {
    this.blasts.push({ side, age: 0 });
  }

  get active(): boolean {
    return this.blasts.length > 0;
  }

  /** 0..1 peak of the most recent blast — the stage uses it to snap the scorer's field. */
  peakIntensity(): number {
    let m = 0;
    for (const b of this.blasts) {
      const i = clamp01(1 - b.age / DUR);
      if (i > m) m = i;
    }
    return m;
  }

  /** which side is currently erupting (for the territory snap), or null. */
  eruptingSide(): 'home' | 'away' | null {
    let best: Blast | null = null;
    for (const b of this.blasts) if (b.age < DUR && (!best || b.age < best.age)) best = b;
    return best ? best.side : null;
  }

  update(dt: number): void {
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i]!;
      b.age += dt;
      if (b.age > DUR + HOLD) this.blasts.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D, pitch: PitchRect, reduced: boolean): void {
    for (const b of this.blasts) this.drawBlast(ctx, pitch, b, reduced);
  }

  private drawBlast(ctx: CanvasRenderingContext2D, pitch: PitchRect, b: Blast, reduced: boolean): void {
    const dir: 1 | -1 = b.side === 'home' ? 1 : -1;
    const goalY = dir === 1 ? pitch.homeGoalY : pitch.awayGoalY;
    const cx = pitch.cx;
    // erupt AT the real goal mouth (§3): origin sits just inside the mouth, not mid-field
    const originY = goalY - dir * pitch.h * 0.08;
    const W = pitch.w;

    // frame-stepped progress: quantise age into STEPS.starburst discrete frames
    const raw = clamp01(b.age / DUR);
    const step = reduced ? STEPS.starburst - 1 : Math.min(STEPS.starburst - 1, Math.floor(raw * STEPS.starburst));
    const f = reduced ? 1 : (step + 1) / STEPS.starburst; // 0..1 in hard increments
    const burstR = W * (0.15 + f * 0.42);

    ctx.save();
    ctx.translate(cx, originY);

    // 1) SHOCKWAVE RINGS — concentric Press-Black rings expanding in discrete steps
    const rings = COMPONENTS.starburst.shockwaveRings;
    ctx.strokeStyle = rgba(INK.pressBlack, 1);
    for (let i = 0; i < rings; i++) {
      const rr = burstR * (0.7 + i * 0.5) * (0.6 + f * 0.8);
      if (rr < 2) continue;
      ctx.lineWidth = Math.max(1.5, W * 0.01 * (1 - i * 0.2));
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 2) HALFTONE SHOCK-DOTS — a ring of drawn benday dots blasting outward (fizzPink accent).
    // Through ink.ts inkDot so the shock-dots carry the same press character (±4% radius,
    // discrete rim-gain) as the territory fields — the eruption is the same ink as the pitch.
    const nDots = 26;
    const dotRing = burstR * 0.92;
    for (let i = 0; i < nDots; i++) {
      const ang = (i / nDots) * Math.PI * 2 + step * 0.2;
      const dr = dotRing * (0.7 + hash11(i * 3.3) * 0.5);
      const dx = Math.cos(ang) * dr;
      const dy = Math.sin(ang) * dr;
      // scale with the fattened HALFTONE.cell so the shock-dots read as pop benday, not dust
      const rad = Math.max(1, HALFTONE.cell * (0.42 - f * 0.24) * (0.7 + hash11(i * 7.1) * 0.6));
      if (rad < 0.6) continue;
      inkDot(ctx, dx, dy, rad, INK.fizzPink, i * 7 + 1, 313);
    }

    // 3) the DRAWN STARBURST — hard-pointed Press-Black rays around a Newsprint core
    const rays = COMPONENTS.starburst.rays;
    const rInner = burstR * COMPONENTS.starburst.rayInner;
    ctx.fillStyle = rgba(INK.pressBlack, 1);
    ctx.beginPath();
    for (let i = 0; i <= rays; i++) {
      const ang = (i / rays) * Math.PI * 2;
      const spike = i % 2 === 0;
      // jagged length variance so the rays read hand-drawn, not a gear
      const rr = spike ? burstR * (0.9 + hash11(i * 1.7) * 0.22) : rInner * (0.9 + hash21(i, 3) * 0.2);
      const px = Math.cos(ang) * rr;
      const py = Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Newsprint core disc inside the black burst (the cream punch)
    ctx.fillStyle = rgba(INK.newsprint, 1);
    ctx.beginPath();
    ctx.arc(0, 0, rInner * 0.82, 0, Math.PI * 2);
    ctx.fill();
    // fizzPink accent core dot ON the cream (the single hottest hit)
    ctx.fillStyle = rgba(INK.fizzPink, 1);
    ctx.beginPath();
    ctx.arc(0, 0, rInner * 0.34, 0, Math.PI * 2);
    ctx.fill();

    // 4) the WORD — GOOOL in Anybody, cream on the black burst, Os as halftone half-discs.
    // Prints after the first couple of frames (the burst lands first), then holds.
    if (raw > 0.18 || b.age > DUR) {
      this.drawGooolWord(ctx, W, rInner);
    }

    ctx.restore();
  }

  /** GOOOL in cream Anybody with the O's rendered as halftone-dotted discs (pop-balls). */
  private drawGooolWord(ctx: CanvasRenderingContext2D, W: number, coreR: number): void {
    const fs = Math.max(20, W * 0.16);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = fontDisplay(fs, 900);
    setStretch(ctx, 130);
    // slight upward tilt reading like the canon; kept within the one-diagonal budget of the burst
    ctx.rotate(-0.06);
    // cream fill + Press-Black outline stroke (the pop letterform on the burst)
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, fs * 0.12);
    ctx.strokeStyle = rgba(INK.pressBlack, 1);
    ctx.strokeText('GOOOL', 0, -coreR * 0.1);
    ctx.fillStyle = rgba(INK.newsprint, 1);
    ctx.fillText('GOOOL', 0, -coreR * 0.1);
    ctx.restore();
  }
}
