/**
 * ROOOT app — THE DOOR (first visit): a match ticket you're handed, with two
 * gates. Root an end; neutrals adopt one for 90 minutes.
 *
 * Ticket anatomy (the references, literally — España's strip, Mexico 70's
 * blocks): a bureaucratic header strip (competition · fixture · date, Doto),
 * the ROOOT masthead (the one place the brand shakes your hand), then the two
 * GATE panels — team-ink grounds (the legal belief-end slot), drawn flag-blocks
 * (never emoji), the tricode shouted in Anybody, and a press-black punch band
 * carrying the action: ROOT <END>. The fact line closes it. No slogans — the
 * choice explains itself (owner's copy law, Jul 4).
 *
 * The panels stack away-over-home on the phone — the same vertical geometry as
 * the stage's goal-ends (home rises from the bottom), so the door teaches the
 * pitch before the fan ever sees it.
 */

import type { Side } from '@contracts/crowd';
import type { Fixture } from '@contracts/match';
import { popBall, flagBlock } from './glyphs';
import { fixtureDateLine } from './voice';

export interface Interstitial {
  el: HTMLElement;
  onPick(cb: (side: Side) => void): void;
  /** re-opening while rooted: mark the held gate (gold punch) + allow dismissing */
  open(current?: Side | null): void;
  close(): void;
}

export function createInterstitial(fixture: Fixture): Interstitial {
  const el = document.createElement('div');
  el.className = 'rt-root-overlay';
  const dateLine = fixtureDateLine(fixture.kickoffISO);
  el.innerHTML = `
    <div class="rt-door-strip">
      <span>THE TOURNAMENT</span>
      <span class="fx">${escapeHtml(fixture.home.code)}–${escapeHtml(fixture.away.code)}</span>
      ${dateLine ? `<span class="dt">${escapeHtml(dateLine)}</span>` : ''}
      <button class="rt-door-close" type="button" data-el="close" aria-label="keep my end" style="display:none">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M4 4 L20 20 M20 4 L4 20" stroke="currentColor" stroke-width="4"/></svg>
      </button>
    </div>
    <div class="rt-door-head">
      <span class="rt-sb-word big">R<span class="o">O</span><span class="ball">${popBall(0.92, 'rt-popball')}</span><span class="o">O</span>T</span>
    </div>
    <div class="rt-root-ends">
      ${endPanel('away', fixture.away.code, fixture.away.name, fixture.away.colors)}
      ${endPanel('home', fixture.home.code, fixture.home.name, fixture.home.colors)}
    </div>
    <div class="rt-root-neutral">ONE END PER FAN · YOU CAN SWITCH</div>`;

  let pickCb: ((side: Side) => void) | null = null;
  const closeBtn = el.querySelector<HTMLButtonElement>('[data-el="close"]')!;

  el.addEventListener('click', (e) => {
    const panel = (e.target as HTMLElement).closest<HTMLElement>('.rt-root-end');
    if (!panel) return;
    const side = panel.getAttribute('data-side') as Side | null;
    if (side === 'home' || side === 'away') pickCb?.(side);
  });
  closeBtn.addEventListener('click', () => {
    el.style.display = 'none';
  });

  return {
    el,
    onPick(cb) {
      pickCb = cb;
    },
    open(current = null) {
      // the held gate wears its punch (a filled gold die-cut — the ticket is punched);
      // with an end already held the door may be dismissed (first visit may not)
      for (const p of el.querySelectorAll<HTMLElement>('.rt-root-end')) {
        const held = current != null && p.getAttribute('data-side') === current;
        p.toggleAttribute('data-held', held);
      }
      closeBtn.style.display = current != null ? '' : 'none';
      el.style.display = '';
    },
    close() {
      el.style.display = 'none';
    },
  };
}

function endPanel(side: Side, code: string, name: string, colors: readonly [string, string]): string {
  return `
    <button class="rt-root-end ${side}" type="button" data-side="${side}">
      <span class="gate">
        ${flagBlock(colors, 'rt-flagblock gate-flag')}
        <span class="code">${escapeHtml(code)}</span>
        <span class="name">${escapeHtml(name)}</span>
      </span>
      <span class="punchband"><b>ROOT ${escapeHtml(code)}</b><i class="punch"></i></span>
    </button>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
