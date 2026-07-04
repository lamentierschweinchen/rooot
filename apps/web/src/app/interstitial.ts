/**
 * ROOOT app — THE ROOT INTERSTITIAL (BRIEF-WATCHING §3). First-visit choice: two
 * big end-panels (team ink, crest-free flag-blocks) — "root an end for 90 minutes".
 * Neutrals adopt one. One tap → stored locally (the shell persists it + hello's the
 * service through the crowd client). Re-openable from the un-rooted cheer bar.
 *
 * Print anatomy: each panel is a keyline-boxed loud team ground (the ONLY legal use
 * of a team colour as a large field is the flag-block/relic-end slot — here it reads
 * as the belief END, the fan adopting a stand, not UI chrome). Codes in Anybody,
 * "adopt / rooted" copy in Doto.
 */

import type { Side } from '@contracts/crowd';
import type { Fixture } from '@contracts/match';

export interface Interstitial {
  el: HTMLElement;
  onPick(cb: (side: Side) => void): void;
  open(): void;
  close(): void;
}

export function createInterstitial(fixture: Fixture): Interstitial {
  const el = document.createElement('div');
  el.className = 'rt-root-overlay';
  // COPY LAW (owner, Jul 4): show, don't tell — no slogans, no hype. The door
  // states the facts (fixture, kickoff) and offers the two ends; the choice
  // explains itself. The experiential-design chapter owns the voice from here;
  // this is the quiet interim. (The old shouted headline is condemned.)
  el.innerHTML = `
    <div class="rt-root-head">
      <div class="rt-root-title">${escapeHtml(fixture.home.name)} — ${escapeHtml(fixture.away.name)}</div>
      <div class="rt-root-sub">${kickoffTimeLabel(fixture.kickoffISO)}</div>
    </div>
    <div class="rt-root-ends">
      ${endPanel('home', fixture.home.code, fixture.home.name, fixture.home.flag)}
      ${endPanel('away', fixture.away.code, fixture.away.name, fixture.away.flag)}
    </div>
    <div class="rt-root-neutral">One end per fan · you can switch</div>`;

  let pickCb: ((side: Side) => void) | null = null;

  el.addEventListener('click', (e) => {
    const panel = (e.target as HTMLElement).closest<HTMLElement>('.rt-root-end');
    if (!panel) return;
    const side = panel.getAttribute('data-side') as Side | null;
    if (side === 'home' || side === 'away') pickCb?.(side);
  });

  return {
    el,
    onPick(cb) {
      pickCb = cb;
    },
    open() {
      el.style.display = '';
    },
    close() {
      el.style.display = 'none';
    },
  };
}

function endPanel(side: Side, code: string, name: string, flag: string): string {
  return `
    <button class="rt-root-end ${side}" type="button" data-side="${side}">
      <span class="flagblock">${escapeHtml(flag)}</span>
      <span class="code">${escapeHtml(code)}</span>
      <span class="name">${escapeHtml(name)}</span>
      <span class="adopt">Root ${escapeHtml(code)}</span>
    </button>`;
}

/** viewer-local kickoff time — a HUD tells you when to be there in YOUR clock
 * (memento captions are the opposite: fixture-fact UTC; see stage formatDate). */
function kickoffTimeLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `Kick-off ${hh}:${mm}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
