/**
 * ROOOT app — THE SOCIAL STRIP + THE DRUM (the cheer bar).
 *
 * Both consume the CrowdView shape (contracts/ledger.ts) through the crowd seam —
 * COUNTS + roar only, NEVER percentages, never blended with the market (the honesty
 * separation is spatial: market on the pitch, crowd in the strip/ends). Lane C
 * delivers the real CrowdClient; we bind to the interface and render an honest
 * DISCONNECTED state when `connected` is false: counts ghost (grey italic — the one
 * legal ghost), and the strip states the fact.
 *
 *  · social strip — two end-plates: drawn flag-block + tricode + ROOTED counter
 *    (Doto, discrete ticks) + roar meter (segmented blocks, team ink) + FAITH ×2
 *    badge (gold, the rare mark) on the trailing end when the service says so.
 *  · the drum — the touch surface, fixed at thumb. Its face IS the pop-ball
 *    (§6.10): a five-segment pinwheel disc with a press-black band across the
 *    middle carrying the word. Pre-root the band reads ROOT (tap = open the
 *    door); rooted it reads ROOOAR. A hit squashes the disc, step-spins the
 *    pinwheel one hard increment, and fires a crisp ring outward — cartoon
 *    timing, no glow, no fade (SYSTEM §7).
 */

import type { CrowdView } from '@contracts/ledger';
import type { Side } from '@contracts/crowd';
import type { Fixture } from '@contracts/match';
import { STEPS } from '../lib/theme';
import { popBall, flagBlock } from './glyphs';

/** roar count → 0..1 fill for the meter/segments (a printed swell, not a % of belief). */
function roar01(v: number): number {
  return 1 - Math.exp(-Math.max(0, v) / 8);
}

/** count → grouped digits, e.g. 12431 → "12,431" (Doto tabular). */
function grp(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString('en-US');
}

const ROAR_SEGMENTS = 10;

/* ── the social strip ─────────────────────────────────────────────────── */

export interface SocialStrip {
  el: HTMLElement;
  set(v: CrowdView): void;
  /** a plate tap re-opens the door — the promised switch path ("YOU CAN SWITCH") */
  onPlateTap(cb: () => void): void;
}

export function createSocialStrip(fixture: Fixture): SocialStrip {
  const el = document.createElement('section');
  el.className = 'rt-strip';
  el.innerHTML =
    endPlate('home', fixture.home.code, fixture.home.colors) +
    endPlate('away', fixture.away.code, fixture.away.colors) +
    `<div class="rt-strip-offline" data-el="offline" style="display:none">
       STANDS OPENING SOON · COUNTS ARE LOCAL
     </div>`;

  let plateCb: (() => void) | null = null;
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('.rt-strip-end')) plateCb?.();
  });

  const homeCount = el.querySelector<HTMLElement>('[data-el="rooted-home"]')!;
  const awayCount = el.querySelector<HTMLElement>('[data-el="rooted-away"]')!;
  const homeRoar = el.querySelector<HTMLElement>('[data-el="roar-home"]')!;
  const awayRoar = el.querySelector<HTMLElement>('[data-el="roar-away"]')!;
  const homeFaith = el.querySelector<HTMLElement>('[data-el="faith-home"]')!;
  const awayFaith = el.querySelector<HTMLElement>('[data-el="faith-away"]')!;
  const offline = el.querySelector<HTMLElement>('[data-el="offline"]')!;
  const homePlate = el.querySelector<HTMLElement>('.rt-strip-end.home')!;
  const awayPlate = el.querySelector<HTMLElement>('.rt-strip-end.away')!;

  function paintRoar(host: HTMLElement, v: number): void {
    const lit = Math.round(roar01(v) * ROAR_SEGMENTS);
    const segs = host.querySelectorAll<HTMLElement>('.seg');
    segs.forEach((s, i) => s.classList.toggle('lit', i < lit));
  }

  return {
    el,
    set(v) {
      homeCount.textContent = grp(v.rooted.home);
      awayCount.textContent = grp(v.rooted.away);
      paintRoar(homeRoar, v.roar.home);
      paintRoar(awayRoar, v.roar.away);
      homeFaith.style.display = v.faithSide === 'home' ? '' : 'none';
      awayFaith.style.display = v.faithSide === 'away' ? '' : 'none';
      offline.style.display = v.connected ? 'none' : '';
      // ghost the counters when offline (they're local-only, honest)
      homePlate.classList.toggle('rt-offline', !v.connected);
      awayPlate.classList.toggle('rt-offline', !v.connected);
    },
    onPlateTap(cb) {
      plateCb = cb;
    },
  };
}

function endPlate(side: Side, code: string, colors: readonly [string, string]): string {
  const segs = Array.from({ length: ROAR_SEGMENTS }, () => '<span class="seg"></span>').join('');
  return `
    <div class="rt-strip-end ${side}">
      <div class="rt-end-head">
        ${flagBlock(colors, 'rt-flagblock rt-end-flag')}
        <span class="rt-end-code">${escapeHtml(code)}</span>
        <span class="rt-end-faith" data-el="faith-${side}" style="display:none">FAITH ×2</span>
      </div>
      <div class="rt-rooted"><span data-el="rooted-${side}">0</span><span class="rt-rooted-lbl">ROOTED</span></div>
      <div class="rt-roar" data-el="roar-${side}">${segs}</div>
    </div>`;
}

/* ── the drum ─────────────────────────────────────────────────────────── */

export interface CheerBar {
  el: HTMLElement;
  /** update the counts / faith from the latest CrowdView */
  set(v: CrowdView): void;
  /** the side the fan rooted (null before they pick) — drives the drum band + plate inks */
  setSide(side: Side | null): void;
  /** fired on each drum hit; the app forwards to the crowd client's cheer() */
  onCheer(cb: () => void): void;
  /** fired when the fan taps the un-rooted drum (open the root door) */
  onPickRequest(cb: () => void): void;
}

export function createCheerBar(fixture: Fixture, reducedMotion: boolean): CheerBar {
  const el = document.createElement('div');
  el.className = 'rt-cheerbar';
  el.innerHTML = `
    <div class="rt-cheer-count home ghost">
      <span class="n" data-el="c-home">0</span>
      <span class="l">${flagBlock(fixture.home.colors, 'rt-flagblock mini')}${escapeHtml(fixture.home.code)} ROOTED</span>
    </div>
    <div class="rt-drum-seat">
      <span class="rt-cheer-double" data-el="double" style="display:none">CHEERS COUNT DOUBLE</span>
      <button class="rt-drum unpicked" type="button" data-el="btn" aria-label="cheer">
        <span class="rt-drum-ring" data-el="ring"></span>
        <span class="rt-drum-disc" data-el="disc">${popBall(1, 'rt-popball drum-face')}</span>
        <span class="rt-drum-band" data-el="lbl">ROOT</span>
      </button>
    </div>
    <div class="rt-cheer-count away ghost">
      <span class="n" data-el="c-away">0</span>
      <span class="l">${flagBlock(fixture.away.colors, 'rt-flagblock mini')}${escapeHtml(fixture.away.code)} ROOTED</span>
    </div>`;

  const btn = el.querySelector<HTMLButtonElement>('[data-el="btn"]')!;
  const disc = el.querySelector<HTMLElement>('[data-el="disc"]')!;
  const ring = el.querySelector<HTMLElement>('[data-el="ring"]')!;
  const lbl = el.querySelector<HTMLElement>('[data-el="lbl"]')!;
  const dbl = el.querySelector<HTMLElement>('[data-el="double"]')!;
  const cHome = el.querySelector<HTMLElement>('[data-el="c-home"]')!;
  const cAway = el.querySelector<HTMLElement>('[data-el="c-away"]')!;
  const homeCount = el.querySelector<HTMLElement>('.rt-cheer-count.home')!;
  const awayCount = el.querySelector<HTMLElement>('.rt-cheer-count.away')!;

  let mySide: Side | null = null;
  let cheerCb: (() => void) | null = null;
  let pickCb: (() => void) | null = null;
  let spinDeg = 0;
  let ringTimer = 0;

  btn.addEventListener('click', () => {
    if (mySide == null) {
      pickCb?.();
      return;
    }
    // the drum hit: one hard pinwheel step + the crisp ring, then the count travels
    if (!reducedMotion) {
      spinDeg += 360 / STEPS.popBall;
      disc.style.setProperty('--spin', `${spinDeg}deg`);
      ring.classList.remove('fire');
      // restart the ring animation (force reflow so consecutive hits re-fire)
      void ring.offsetWidth;
      ring.classList.add('fire');
      window.clearTimeout(ringTimer);
      ringTimer = window.setTimeout(() => ring.classList.remove('fire'), 400);
    }
    cheerCb?.();
  });

  return {
    el,
    set(v) {
      cHome.textContent = grp(v.rooted.home);
      cAway.textContent = grp(v.rooted.away);
      // ghost the counts when offline (local-only, honest)
      homeCount.classList.toggle('ghost', !v.connected);
      awayCount.classList.toggle('ghost', !v.connected);
      // CHEERS COUNT DOUBLE when the fan's rooted end is the faith (trailing) side
      const faithOn = mySide != null && v.faithSide === mySide;
      dbl.style.display = faithOn ? '' : 'none';
    },
    setSide(side) {
      mySide = side;
      el.classList.toggle('side-home', side === 'home');
      el.classList.toggle('side-away', side === 'away');
      btn.classList.toggle('unpicked', side == null);
      lbl.textContent = side == null ? 'ROOT' : 'ROOOAR';
    },
    onCheer(cb) {
      cheerCb = cb;
    },
    onPickRequest(cb) {
      pickCb = cb;
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
