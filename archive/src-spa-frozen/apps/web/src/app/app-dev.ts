/**
 * ROOOT — WATCHING SHELL dev entry (verification only; Lane A owns this file).
 *
 * Wires createApp against the bundled REAL ARG–CPV replay at speed 60 — the same
 * fixture main.ts uses — so the whole watching experience (scoreband · stage window ·
 * cheer bar · social strip · THE LEDGER) can be judged without the coordinator's
 * main.ts wiring. The crowd runs on the honest DISCONNECTED stand-in (Lane C delivers
 * the real client), so the social strip shows its "STANDS OPENING SOON" state and the
 * cheer is local-only + ghosted — exactly the seam the shell must handle gracefully.
 *
 * ?ledger=fixture  → ALSO drives the ledger builder from the AUS–EGY portion of
 *   fixtures/scores-night parsed through parseLedgerMessage (the ARG–CPV bundle is
 *   pre-match-thin on story events; the night fixture has goals/cards/pens/swings),
 *   so the readable ledger can be verified with real movement. Dev-only path.
 * ?reduced         → forces prefers-reduced-motion for the calm-variant check.
 */

import { createApp } from './createApp';
import { ReplaySource, lookupFixture } from '../data';
import { createLedgerBuilder } from '../ledger';
import { parseLedgerMessage, parseOddsMessage, sniffParticipant1IsHome } from '@contracts/normalize';
import type { OddsTick } from '@contracts/match';

function forceReducedMotion(): void {
  const real = window.matchMedia.bind(window);
  window.matchMedia = ((q: string) => {
    if (typeof q === 'string' && q.includes('prefers-reduced-motion')) {
      return { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} } as unknown as MediaQueryList;
    }
    return real(q);
  }) as typeof window.matchMedia;
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  if (params.has('reduced')) forceReducedMotion();

  const fixture = lookupFixture('18175918'); // ARG–CPV, the bundled real replay
  if (!fixture) throw new Error('[app-dev] fixture meta missing');

  const source = new ReplaySource({
    url: '/replay/arg-cpv-20260703.jsonl',
    fixture,
    speed: 60,
  });

  const app = createApp({ mount: document.body, source, fixture });
  (window as unknown as { __app?: unknown }).__app = app;

  // The bundled ARG–CPV window is pre-match market data (rich odds, thin on ledger
  // story). To light the LEDGER with real events we can OPTIONALLY replay the
  // AUS–EGY story fixture through the same frozen parser into app.callbacks.onLedger.
  if (params.has('ledger')) {
    void driveLedgerFromNightFixture(app.callbacks.onLedger, app.callbacks.onOdds, params.get('ledger') === 'fast');
  }
}

/**
 * Dev-only: stream the AUS–EGY story (fixtures/scores-night) + its odds through the
 * FROZEN parseLedgerMessage/parseOddsMessage into the shell's ledger callbacks so
 * the readable ledger can be seen with real goals/cards/pens/swings. Paces the story
 * fast (default) so a screenshot lands mid-drama; `?ledger=fast` collapses to instant.
 */
async function driveLedgerFromNightFixture(
  onLedger: ((m: import('@contracts/ledger').LedgerMsg) => void) | undefined,
  onOdds: ((t: OddsTick) => void) | undefined,
  instant: boolean,
): Promise<void> {
  if (!onLedger) return;
  const AUS_EGY = 18176123;
  const [scoresTxt, oddsTxt] = await Promise.all([
    fetch('/fixtures/scores-night-20260703.jsonl').then((r) => (r.ok ? r.text() : '')),
    fetch('/fixtures/odds-night-20260703.jsonl').then((r) => (r.ok ? r.text() : '')),
  ]);
  if (!scoresTxt) {
    console.warn('[app-dev] night scores fixture not served (dev-only path) — ledger stays on ARG–CPV');
    return;
  }

  interface Raw { receivedAtMs: number; event: string; data: string }
  const parse = (txt: string): Raw[] => {
    const out: Raw[] = [];
    for (const l of txt.split('\n')) {
      const t = l.trim();
      if (!t) continue;
      try {
        const o = JSON.parse(t) as Raw;
        if (typeof o.receivedAtMs === 'number' && typeof o.event === 'string') out.push(o);
      } catch { /* skip */ }
    }
    return out;
  };

  // feed odds first (swing correlation ring) — only AUS-EGY
  let p1IsHome = true;
  for (const l of parse(oddsTxt)) {
    if (l.event !== 'message') continue;
    if (l.data.includes('"Participant1IsHome"')) {
      const p = sniffParticipant1IsHome(l.data);
      if (p !== null) p1IsHome = p;
    }
    const odds = parseOddsMessage(l.data, l.receivedAtMs, 'replay', p1IsHome);
    if (odds && (odds.raw as { FixtureId?: number })?.FixtureId === AUS_EGY) onOdds?.(odds as OddsTick);
  }

  // then the story, paced. instant → all at once; else a quick cadence so we can watch
  // rows print in, folds fill, possibles resolve, discards strike.
  const msgs = parse(scoresTxt).filter((l) => l.event === 'message' && l.data.includes(`"FixtureId":${AUS_EGY}`));
  if (instant) {
    for (const l of msgs) {
      const m = parseLedgerMessage(l.data, l.receivedAtMs, 'replay');
      if (m) onLedger(m);
    }
    return;
  }
  let i = 0;
  const step = (): void => {
    // emit a small batch per tick so the whole story lands in ~a few seconds
    for (let k = 0; k < 3 && i < msgs.length; k++, i++) {
      const l = msgs[i]!;
      const m = parseLedgerMessage(l.data, l.receivedAtMs, 'replay');
      if (m) onLedger(m);
    }
    if (i < msgs.length) window.setTimeout(step, 90);
  };
  step();
}

void boot();
