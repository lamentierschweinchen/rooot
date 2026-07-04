/**
 * ROOOT app — THE SCOREBAND (sticky, slim; BRIEF-WATCHING §1.1). Always visible so
 * someone joining at 60' gets the state at a glance: tricodes + flag-blocks + score
 * (Doto) + clock + phase chip + feed state. Plus the PAUSE→poster button (§4): it
 * flips the stage's live chrome to the full §10 print frame (the collect moment);
 * the poster crystallisation itself is the relic printers' job — we only wire the
 * button + the chrome switch.
 *
 * Print anatomy: Press-Black band, cream type, flags as keyline-boxed blocks,
 * tricodes in Anybody (a name is shouted), score/clock in Doto (measured data).
 */

import type { Fixture, MatchPhase } from '@contracts/match';

export interface ScorebandState {
  homeScore: number;
  awayScore: number;
  minute: number | null;
  phase: MatchPhase;
  feed: 'connected' | 'reconnecting' | 'replay' | 'lost';
}

const PHASE_LABEL: Record<MatchPhase, string> = {
  PRE: 'Kick-off soon',
  FIRST_HALF: '1st half',
  HALF_TIME: 'Half-time',
  SECOND_HALF: '2nd half',
  EXTRA_TIME: 'Extra time',
  PENALTIES: 'Penalties',
  FULL_TIME: 'Full-time',
};

const FEED_LABEL: Record<ScorebandState['feed'], string> = {
  connected: 'Live',
  reconnecting: 'Reconnecting',
  replay: 'Replay',
  lost: 'Feed lost',
};

export interface Scoreband {
  el: HTMLElement;
  set(s: Partial<ScorebandState>): void;
  /** faith on (a rooted end is trailing + singing) → the phase chip SPEAKS the stakes
   * ("CHEERS COUNT DOUBLE") instead of the plain phase (BRIEF-PRINT-SOUL §5). */
  setFaith(on: boolean): void;
  onPause(cb: () => void): void;
  setPosed(posed: boolean): void;
}

export function createScoreband(fixture: Fixture): Scoreband {
  const el = document.createElement('header');
  el.className = 'rt-scoreband';
  el.innerHTML = `
    <div class="rt-sb-flag" data-el="homeflag">${escapeHtml(fixture.home.flag)}</div>
    <div class="rt-sb-tri home">${escapeHtml(fixture.home.code)}</div>
    <div class="rt-sb-score">
      <span class="rt-sb-scorebox" data-el="score">0–0</span>
      <span class="rt-sb-clock" data-el="clock">·</span>
    </div>
    <div class="rt-sb-tri away">${escapeHtml(fixture.away.code)}</div>
    <div class="rt-sb-flag" data-el="awayflag">${escapeHtml(fixture.away.flag)}</div>
    <div class="rt-sb-right">
      <span class="rt-sb-phase" data-el="phase">Kick-off soon</span>
      <span class="rt-sb-feed" data-el="feed" data-state="replay">Replay</span>
      <button class="rt-sb-pause" type="button" data-el="pause" data-posed="0" title="pose the stage as a poster">Pose</button>
    </div>`;

  const scoreEl = el.querySelector<HTMLElement>('[data-el="score"]')!;
  const clockEl = el.querySelector<HTMLElement>('[data-el="clock"]')!;
  const phaseEl = el.querySelector<HTMLElement>('[data-el="phase"]')!;
  const feedEl = el.querySelector<HTMLElement>('[data-el="feed"]')!;
  const pauseBtn = el.querySelector<HTMLButtonElement>('[data-el="pause"]')!;

  const state: ScorebandState = {
    homeScore: 0,
    awayScore: 0,
    minute: null,
    phase: 'PRE',
    feed: 'replay',
  };
  let faith = false;

  function paint(): void {
    scoreEl.textContent = `${state.homeScore}–${state.awayScore}`;
    clockEl.textContent = state.minute != null ? `${state.minute}'` : '·';
    // faith speaks over the phase — the stakes, not the clock label
    phaseEl.textContent = faith ? 'Cheers count double' : PHASE_LABEL[state.phase];
    phaseEl.classList.toggle('faith', faith);
    feedEl.textContent = FEED_LABEL[state.feed];
    feedEl.setAttribute('data-state', state.feed);
  }
  paint();

  return {
    el,
    set(s) {
      Object.assign(state, s);
      paint();
    },
    setFaith(on) {
      faith = on;
      paint();
    },
    onPause(cb) {
      pauseBtn.addEventListener('click', cb);
    },
    setPosed(posed) {
      pauseBtn.setAttribute('data-posed', posed ? '1' : '0');
      pauseBtn.textContent = posed ? 'Live' : 'Pose';
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
