/**
 * ROOOT app — THE SCOREBAND: the masthead that becomes a HUD.
 *
 * The band has two printed states, because the stage directly below it already
 * carries a full scoreboard (score, flags, clock, on the canvas). Duplicating
 * that 100px lower was the "incoherent card" disease. So:
 *
 *   · MASTHEAD (stage on screen)  — the page names itself: the ROOOT wordmark
 *     (pop-ball as the middle O, §6.10) + the feed state + the PRINT action.
 *     No score, no clock — they're right there on the stage.
 *   · HUD (stage scrolled away)   — the wordmark folds to the ball glyph and
 *     the state prints in: team ticks + tricodes + score (Doto) + clock cell.
 *     The fan reading the ledger never loses the match.
 *
 * createApp drives the flip from an IntersectionObserver via setHud(). The
 * swap is a stepped print action (no slide, no fade — SYSTEM §7), instant
 * under reduced motion. Anatomy: press-black band of keylined CELLS with hard
 * seams (the España strip, not a flexbox with margins). Faith lives on the
 * drum, not here — one signal, one home.
 */

import type { Fixture, MatchPhase } from '@contracts/match';
import { popBall, flagBlock } from './glyphs';

export interface ScorebandState {
  homeScore: number;
  awayScore: number;
  minute: number | null;
  phase: MatchPhase;
  feed: 'connected' | 'reconnecting' | 'replay' | 'lost';
}

/** the clock cell speaks minute when there is one, else the phase, short. */
function clockText(s: ScorebandState): string {
  if (s.phase === 'HALF_TIME') return 'HT';
  if (s.phase === 'FULL_TIME') return 'FT';
  if (s.phase === 'PENALTIES') return 'PENS';
  if (s.minute != null) return `${s.minute}'`;
  if (s.phase === 'PRE') return 'PRE';
  return '·';
}

const FEED_LABEL: Record<ScorebandState['feed'], string> = {
  connected: 'LIVE',
  reconnecting: 'RECONNECTING',
  replay: 'REPLAY',
  lost: 'FEED LOST',
};

export interface Scoreband {
  el: HTMLElement;
  set(s: Partial<ScorebandState>): void;
  /** stage scrolled away → the HUD prints in (score/clock cells). */
  setHud(on: boolean): void;
  onPause(cb: () => void): void;
  setPosed(posed: boolean): void;
}

export function createScoreband(fixture: Fixture): Scoreband {
  const el = document.createElement('header');
  el.className = 'rt-scoreband';
  el.setAttribute('data-hud', '0');
  el.innerHTML = `
    <div class="rt-sb-mast" data-el="mast">
      <span class="rt-sb-word">R<span class="o">O</span><span class="ball">${popBall(0.92, 'rt-popball')}</span><span class="o">O</span>T</span>
    </div>
    <div class="rt-sb-hud" data-el="hud">
      <span class="rt-sb-ball">${popBall(1.05, 'rt-popball')}</span>
      <span class="rt-sb-team">${flagBlock(fixture.home.colors)}<b>${escapeHtml(fixture.home.code)}</b></span>
      <span class="rt-sb-scorebox" data-el="score">0–0</span>
      <span class="rt-sb-team away"><b>${escapeHtml(fixture.away.code)}</b>${flagBlock(fixture.away.colors)}</span>
      <span class="rt-sb-clock" data-el="clock">·</span>
    </div>
    <div class="rt-sb-gap"></div>
    <div class="rt-sb-feed" data-el="feed" data-state="replay"><i></i><span data-el="feedlbl">REPLAY</span></div>
    <button class="rt-sb-print" type="button" data-el="print" data-posed="0">PRINT</button>`;

  const hudEl = el.querySelector<HTMLElement>('[data-el="hud"]')!;
  const mastEl = el.querySelector<HTMLElement>('[data-el="mast"]')!;
  const scoreEl = el.querySelector<HTMLElement>('[data-el="score"]')!;
  const clockEl = el.querySelector<HTMLElement>('[data-el="clock"]')!;
  const feedEl = el.querySelector<HTMLElement>('[data-el="feed"]')!;
  const feedLbl = el.querySelector<HTMLElement>('[data-el="feedlbl"]')!;
  const printBtn = el.querySelector<HTMLButtonElement>('[data-el="print"]')!;

  const state: ScorebandState = {
    homeScore: 0,
    awayScore: 0,
    minute: null,
    phase: 'PRE',
    feed: 'replay',
  };

  function paint(): void {
    scoreEl.textContent = `${state.homeScore}–${state.awayScore}`;
    clockEl.textContent = clockText(state);
    feedLbl.textContent = FEED_LABEL[state.feed];
    feedEl.setAttribute('data-state', state.feed);
  }
  paint();

  // the house ball turns when the score turns — one stepped revolution, no smear
  let spinTimer = 0;
  function goalSpin(): void {
    el.classList.remove('goal-spin');
    void el.offsetWidth; // restart the stepped animation on consecutive goals
    el.classList.add('goal-spin');
    window.clearTimeout(spinTimer);
    spinTimer = window.setTimeout(() => el.classList.remove('goal-spin'), 1300);
  }

  return {
    el,
    set(s) {
      const scored =
        (s.homeScore != null && s.homeScore > state.homeScore) ||
        (s.awayScore != null && s.awayScore > state.awayScore);
      Object.assign(state, s);
      paint();
      if (scored) goalSpin();
    },
    setHud(on) {
      el.setAttribute('data-hud', on ? '1' : '0');
      // a11y: the hidden group is display:none via CSS; nothing else to manage
      hudEl.setAttribute('aria-hidden', on ? 'false' : 'true');
      mastEl.setAttribute('aria-hidden', on ? 'true' : 'false');
    },
    onPause(cb) {
      printBtn.addEventListener('click', cb);
    },
    setPosed(posed) {
      printBtn.setAttribute('data-posed', posed ? '1' : '0');
      printBtn.textContent = posed ? 'LIVE' : 'PRINT';
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
