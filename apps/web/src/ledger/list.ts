/**
 * ROOOT — THE LEDGER LIST UI (print-anatomy rows, DOM).
 *
 * Subscribes to a LedgerBuilder and renders the ordered rows as a readable,
 * reverse-chronological list (BRIEF-WATCHING §2). Keyed reconcile — a new odds
 * tick that only stamps a swing chip must NOT reflow the whole list or restart
 * print-in animations, so we diff by row id and patch in place; genuinely new
 * rows animate their slide-stamp (minute inks first), reduced-motion instant.
 *
 * Behaviours: majors always; minors folded per stretch (tap to expand, lighter);
 * swing chips coloured by the side that gained, absent when the market was silent;
 * `possible` rows render as held breath until the same wire id upgrades/strikes;
 * amends re-describe in place; discards strike through (never vanish); goal rows
 * are mini-mementos with the score stamped. Auto-follow pins to the newest row
 * (top) with an unread-count chip when the reader has scrolled away.
 */

import type { LedgerBuilder, LedgerRow, EventRow, FoldRow, LedgerSnapshot } from './types';
import type { OddsSwing, LedgerEvent } from '@contracts/ledger';
import type { Side } from '@contracts/crowd';

export interface LedgerListOptions {
  builder: LedgerBuilder;
  reducedMotion?: boolean;
  /** kickoff time label (e.g. "17:00") for the empty state — "THE STORY PRINTS HERE — KICK-OFF 17:00" */
  kickoffLabel?: string;
}

const PCT = (v: number): string => `${Math.round(v * 100)}%`;

/**
 * The swing chip reads the market move around a moment. The chip shows the
 * probability of the side the market moved TOWARD (the gaining side) — before→after
 * — because that is the number that changed; showing a flat "19%→19%" for the row's
 * side when the market actually shifted the draw/other side reads as broken. The
 * chip is tinted by that same gaining side. Both numbers are REAL observed ticks
 * (contracts/ledger.ts — never interpolated). When the market moved most toward the
 * row's own side, that's naturally the reading shown.
 */
function swingDisplay(swing: OddsSwing): {
  before: string;
  after: string;
  gain: 'home' | 'away' | 'draw';
} {
  const b = swing.before;
  const a = swing.after;
  const dH = a.pHome - b.pHome;
  const dA = a.pAway - b.pAway;
  const dD = a.pDraw - b.pDraw;
  // the gaining side = whichever probability rose most (the market's direction)
  let gain: 'home' | 'away' | 'draw' = 'draw';
  if (dH >= dA && dH >= dD) gain = 'home';
  else if (dA >= dH && dA >= dD) gain = 'away';
  const readB = gain === 'home' ? b.pHome : gain === 'away' ? b.pAway : b.pDraw;
  const readA = gain === 'home' ? a.pHome : gain === 'away' ? a.pAway : a.pDraw;
  return { before: PCT(readB), after: PCT(readA), gain };
}

/** headline the row: uppercase for majors/goals, and DON'T double-print detail
 * when the parser already folded the outcome into the headline (penalty-kick). A
 * `possible` that is no longer pending (the VAR check has resolved / the feed moved
 * on) drops the "…Checking…" for a settled past-tense label — honest: the check
 * happened, we just don't claim a verdict the wire never sent. */
function headlineText(ev: LedgerEvent, pending: boolean): string {
  const h = ev.headline;
  if (ev.kind === 'goal') return h.toUpperCase();
  if (ev.kind === 'possible' && !pending) {
    return ev.detail === 'Penalty' || h.startsWith('Penalty') ? 'Penalty check' : 'Goal check';
  }
  return h;
}

/** the detail line, minus the redundant penalty-kick outcome the headline holds. */
function detailText(ev: LedgerEvent): string | null {
  if (!ev.detail) return null;
  if (ev.kind === 'penalty-kick') return null; // headline is "Penalty — Scored" already
  if (ev.kind === 'possible') return null; // the breath marker carries the state
  return ev.detail.toUpperCase();
}

function tickClass(side: Side | null): string {
  return side === 'home' ? 'home' : side === 'away' ? 'away' : 'neutral';
}

function minuteText(minute: number | null, spanLabel?: string): string {
  if (spanLabel) return spanLabel;
  return minute != null ? `${minute}'` : '·';
}

export interface LedgerList {
  el: HTMLElement;
  destroy(): void;
}

export function createLedgerList(opts: LedgerListOptions): LedgerList {
  const reduced =
    opts.reducedMotion ??
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // COPY LAW (owner, Jul 4): show, don't tell. The empty ledger states the one
  // fact it has — kickoff — or stays quiet. No narration about itself.
  const emptyLine = opts.kickoffLabel
    ? `Kick-off <span class="ko">${escapeHtml(opts.kickoffLabel)}</span>`
    : '';

  const root = document.createElement('section');
  root.className = 'rt-ledger';
  root.innerHTML = `
    <div class="rt-ledger-head">
      <span class="ttl">The Ledger</span>
      <span class="sub">newest first</span>
    </div>
    <div class="rt-ledger-scroll">
      <button class="rt-ledger-unread" type="button"></button>
      <div class="rt-ledger-rows"></div>
      <div class="rt-ledger-empty">${emptyLine}</div>
    </div>`;

  const scroll = root.querySelector<HTMLElement>('.rt-ledger-scroll')!;
  const rowsEl = root.querySelector<HTMLElement>('.rt-ledger-rows')!;
  const emptyEl = root.querySelector<HTMLElement>('.rt-ledger-empty')!;
  const unread = root.querySelector<HTMLButtonElement>('.rt-ledger-unread')!;

  // id → element, for keyed reconcile
  const nodeById = new Map<string, HTMLElement>();
  // ids we've already animated in (so patches don't re-trigger the stamp)
  const seen = new Set<string>();
  // which folds the reader opened (persist across re-renders)
  const openFolds = new Set<string>();

  let atTop = true;
  let unreadCount = 0;
  let lastHeadId: string | null = null;

  scroll.addEventListener('scroll', () => {
    atTop = scroll.scrollTop <= 4;
    if (atTop) {
      unreadCount = 0;
      unread.classList.remove('show');
    }
  });
  unread.addEventListener('click', () => {
    scroll.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    unreadCount = 0;
    unread.classList.remove('show');
  });

  // event delegation for fold toggles
  rowsEl.addEventListener('click', (e) => {
    const line = (e.target as HTMLElement).closest<HTMLElement>('.rt-fold-line');
    if (!line) return;
    const fold = line.closest<HTMLElement>('.rt-fold');
    if (!fold) return;
    const id = fold.getAttribute('data-fold-id') || '';
    const open = fold.getAttribute('data-open') === '1';
    fold.setAttribute('data-open', open ? '0' : '1');
    if (open) openFolds.delete(id);
    else openFolds.add(id);
  });

  function render(snap: LedgerSnapshot): void {
    const rows = snap.rows;
    emptyEl.style.display = rows.length === 0 ? '' : 'none';

    // detect a genuinely new head row (for the unread chip / auto-follow)
    const newHead = snap.headId && snap.headId !== lastHeadId;
    lastHeadId = snap.headId;

    // build the desired node list in order; reuse existing nodes by id
    const desiredIds: string[] = [];
    const frag = document.createDocumentFragment();
    for (const row of rows) {
      const id = row.id;
      desiredIds.push(id);
      let node = nodeById.get(id);
      const isNew = !node;
      if (!node) {
        node = document.createElement('div');
        nodeById.set(id, node);
      }
      paintRow(node, row);
      frag.appendChild(node);
      // stamp-in only truly new rows we haven't seen, and only when they're the
      // fresh head (avoids animating a backfill of history on first paint)
      if (isNew && !seen.has(id)) {
        seen.add(id);
        if (!reduced && seen.size > 1) {
          // seen.size>1 → not the very first bulk paint; a live new row
          markPrinting(node, row);
        }
      }
    }

    // remove nodes no longer present (shouldn't happen — ledger never drops — but safe)
    for (const [id, node] of nodeById) {
      if (!desiredIds.includes(id)) {
        node.remove();
        nodeById.delete(id);
        seen.delete(id);
      }
    }

    rowsEl.appendChild(frag); // re-append in the new order (moves existing nodes)

    // auto-follow: pinned to top unless the reader scrolled away
    if (newHead) {
      if (atTop) {
        scroll.scrollTop = 0;
      } else {
        unreadCount += 1;
        unread.textContent = `▲ ${unreadCount} NEW`;
        unread.classList.add('show');
      }
    }
  }

  function paintRow(node: HTMLElement, row: LedgerRow): void {
    if (row.kind === 'fold') {
      paintFold(node, row);
    } else {
      paintEvent(node, row);
    }
  }

  function paintEvent(node: HTMLElement, row: EventRow): void {
    const ev = row.ev;
    const isGoal = ev.kind === 'goal' && !row.pending;
    const cls = ['rt-row'];
    cls.push(row.major ? 'mag-major' : 'mag-minor');
    if (row.inlineMinor) cls.push('mag-minor');
    if (isGoal) cls.push('is-goal');
    if (row.pending) cls.push('is-pending');
    if (row.discarded) cls.push('is-discarded');
    node.className = cls.join(' ');
    node.removeAttribute('data-fold-id');
    node.removeAttribute('data-open');

    const min = minuteText(row.minute, row.spanLabel);
    const minCls = row.minute == null && !row.spanLabel ? 'min blank' : 'min';
    const detail = detailText(ev);
    const scoreLine =
      isGoal && ev.score ? `${scoreCode('home')} ${ev.score.home}–${ev.score.away} ${scoreCode('away')}` : '';

    let swingHTML = '';
    if (row.swing) {
      const s = swingDisplay(row.swing);
      // stepped arrow direction: up when the reading rose, down when it fell
      const rose = parseInt(s.after, 10) >= parseInt(s.before, 10);
      const arrow = rose ? '↗' : '↘';
      swingHTML =
        `<span class="rt-swing gain-${s.gain}">${s.before}<span class="arrow">${arrow}</span>${s.after}</span>`;
    }

    node.innerHTML =
      `<div class="${minCls}">${escapeHtml(min)}</div>` +
      `<div class="tick ${tickClass(ev.side)}"></div>` +
      `<div class="body">` +
      `<div class="head">${escapeHtml(headlineText(ev, row.pending))}` +
      (row.pending ? `<span class="breath">CHECKING</span>` : '') +
      `</div>` +
      (detail ? `<div class="detail">${escapeHtml(detail)}</div>` : '') +
      (scoreLine ? `<div class="score">${escapeHtml(scoreLine)}</div>` : '') +
      `</div>` +
      swingHTML;
  }

  // the score stamp uses the fixture tricodes injected as data-* on root by the app
  function scoreCode(side: 'home' | 'away'): string {
    return (side === 'home' ? root.dataset.homeCode : root.dataset.awayCode) || (side === 'home' ? 'HOME' : 'AWAY');
  }

  function paintFold(node: HTMLElement, row: FoldRow): void {
    node.className = 'rt-fold';
    node.setAttribute('data-fold-id', row.id);
    node.setAttribute('data-open', openFolds.has(row.id) ? '1' : '0');
    const s = row.summary;
    const parts: string[] = [`<span class="cnt">${s.total}</span> MOMENTS`];
    if (s.shots) parts.push(`<span class="cnt">${s.shots}</span> ${s.shots === 1 ? 'SHOT' : 'SHOTS'}`);
    if (s.corners) parts.push(`<span class="cnt">${s.corners}</span> ${s.corners === 1 ? 'CORNER' : 'CORNERS'}`);
    if (s.freeKicks) parts.push(`<span class="cnt">${s.freeKicks}</span> FK`);
    if (s.dangerMinutes) parts.push(`DANGER <span class="cnt">${s.dangerMinutes}'</span>`);
    const line = parts.join(' <span class="sep">·</span> ');

    // body: the hidden minors, newest-first, lighter
    let body = '';
    for (const item of row.items) {
      const tmp = document.createElement('div');
      paintEvent(tmp, item);
      body += tmp.outerHTML;
    }

    node.innerHTML =
      `<button class="rt-fold-line" type="button"><span class="caret">▸</span>${line}</button>` +
      `<div class="rt-fold-body">${body}</div>`;
  }

  function markPrinting(node: HTMLElement, _row: LedgerRow): void {
    node.classList.add('printing');
    const dur = 160;
    window.setTimeout(() => node.classList.remove('printing'), dur);
  }

  const unsub = opts.builder.subscribe(render);

  return {
    el: root,
    destroy() {
      unsub();
      nodeById.clear();
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
  );
}
