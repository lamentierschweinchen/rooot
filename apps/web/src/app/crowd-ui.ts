/**
 * ROOOT app — THE SOCIAL STRIP + THE CHEER BAR (BRIEF-WATCHING §1.3, §3).
 *
 * Both consume the CrowdView shape (contracts/ledger.ts) through the crowd seam —
 * COUNTS + roar only, NEVER percentages, never blended with the market (the honesty
 * separation is spatial: market on the pitch, crowd in the strip/ends). Lane C
 * delivers the real CrowdClient; we bind to the interface and render an honest
 * DISCONNECTED state when `connected` is false: "STANDS OPENING SOON — counts are
 * local", with cheer still tappable and the local count clearly ghosted.
 *
 *  · social strip  — two end-plates: flag-block + tricode + ROOTED counter (Doto,
 *    live-ticking, discrete steps) + roar meter (segmented blocks, team ink) +
 *    faith badge on the trailing end when the service says so.
 *  · cheer bar     — the touch surface (fixed at thumb): before a side is picked
 *    it invites the tap; after root it is the CHEER drum (big, round, pop-ball
 *    energy) flanked by both ROOTED counts + a roar fill + CHEERS COUNT DOUBLE when
 *    faith is on. Hitting it must feel like a drum, not a form: squash on press,
 *    roar swells, count ticks.
 */

import type { CrowdView } from '@contracts/ledger';
import type { Side } from '@contracts/crowd';
import type { Fixture } from '@contracts/match';

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
}

export function createSocialStrip(fixture: Fixture): SocialStrip {
  const el = document.createElement('section');
  el.className = 'rt-strip';
  el.innerHTML =
    endPlate('home', fixture.home.code, fixture.home.flag) +
    endPlate('away', fixture.away.code, fixture.away.flag) +
    `<div class="rt-strip-offline" data-el="offline" style="display:none">
       <b>Stands opening soon</b> — <span class="ghost">counts are local for now</span>
     </div>`;

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
  };
}

function endPlate(side: Side, code: string, flag: string): string {
  const segs = Array.from({ length: ROAR_SEGMENTS }, () => '<span class="seg"></span>').join('');
  return `
    <div class="rt-strip-end ${side}">
      <div class="rt-end-head">
        <span class="rt-end-flag">${escapeHtml(flag)}</span>
        <span class="rt-end-code">${escapeHtml(code)}</span>
        <span class="rt-end-faith" data-el="faith-${side}" style="display:none">Faith ×2</span>
      </div>
      <div class="rt-rooted"><span data-el="rooted-${side}">0</span><span class="rt-rooted-lbl">Rooted</span></div>
      <div class="rt-roar" data-el="roar-${side}">${segs}</div>
    </div>`;
}

/* ── the cheer bar ────────────────────────────────────────────────────── */

export interface CheerBar {
  el: HTMLElement;
  /** update the counts / roar / faith from the latest CrowdView */
  set(v: CrowdView): void;
  /** the side the fan rooted (null before they pick) — drives button colour + which count ghosts */
  setSide(side: Side | null): void;
  /** fired on each drum hit; the app forwards to the crowd client's cheer() */
  onCheer(cb: () => void): void;
  /** fired when the fan taps the un-rooted bar (open the root interstitial) */
  onPickRequest(cb: () => void): void;
}

export function createCheerBar(fixture: Fixture, reducedMotion: boolean): CheerBar {
  const el = document.createElement('div');
  el.className = 'rt-cheerbar';
  el.innerHTML = `
    <div class="rt-cheer-count home ghost">
      <span class="n" data-el="c-home">0</span><span class="l">${escapeHtml(fixture.home.code)} rooted</span>
    </div>
    <button class="rt-cheer-btn unpicked" type="button" data-el="btn">
      <span class="roar-fill" data-el="roar"></span>
      <span class="rt-cheer-double" data-el="double" style="display:none">Cheers count double</span>
      <span class="lbl" data-el="lbl">Pick an end</span>
    </button>
    <div class="rt-cheer-count away ghost">
      <span class="n" data-el="c-away">0</span><span class="l">${escapeHtml(fixture.away.code)} rooted</span>
    </div>`;

  const btn = el.querySelector<HTMLButtonElement>('[data-el="btn"]')!;
  const lbl = el.querySelector<HTMLElement>('[data-el="lbl"]')!;
  const roarFill = el.querySelector<HTMLElement>('[data-el="roar"]')!;
  const dbl = el.querySelector<HTMLElement>('[data-el="double"]')!;
  const cHome = el.querySelector<HTMLElement>('[data-el="c-home"]')!;
  const cAway = el.querySelector<HTMLElement>('[data-el="c-away"]')!;
  const homeCount = el.querySelector<HTMLElement>('.rt-cheer-count.home')!;
  const awayCount = el.querySelector<HTMLElement>('.rt-cheer-count.away')!;

  let mySide: Side | null = null;
  let cheerCb: (() => void) | null = null;
  let pickCb: (() => void) | null = null;

  btn.addEventListener('click', () => {
    if (mySide == null) {
      pickCb?.();
      return;
    }
    // the drum hit — squash handled by :active; a tiny stepped roar kick for feel
    if (!reducedMotion) {
      btn.style.setProperty('--roar', String(Math.min(1, currentRoar + 0.25)));
      window.setTimeout(() => btn.style.setProperty('--roar', String(currentRoar)), 120);
    }
    cheerCb?.();
  });

  let currentRoar = 0;

  return {
    el,
    set(v) {
      cHome.textContent = grp(v.rooted.home);
      cAway.textContent = grp(v.rooted.away);
      // ghost the counts when offline (local-only, honest)
      homeCount.classList.toggle('ghost', !v.connected);
      awayCount.classList.toggle('ghost', !v.connected);
      // roar fill = the fan's own end swell
      const mine = mySide === 'away' ? v.roar.away : mySide === 'home' ? v.roar.home : 0;
      currentRoar = roar01(mine);
      btn.style.setProperty('--roar', String(currentRoar));
      // CHEERS COUNT DOUBLE when the fan's rooted end is the faith (trailing) side
      const faithOn = mySide != null && v.faithSide === mySide;
      dbl.style.display = faithOn ? '' : 'none';
    },
    setSide(side) {
      mySide = side;
      if (side == null) {
        btn.classList.add('unpicked');
        btn.classList.remove('side-home', 'side-away');
        lbl.textContent = 'Pick an end';
      } else {
        btn.classList.remove('unpicked');
        btn.classList.toggle('side-away', side === 'away');
        btn.classList.toggle('side-home', side === 'home');
        // the button LABELS itself — a word, not an icon (BRIEF-PRINT-SOUL §5)
        lbl.textContent = 'ROOOAR';
      }
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
