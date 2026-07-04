/**
 * ROOOT composition root — coordinator-only (see AGENTS.md).
 *
 * MODE SELECTION (the live dress switch, Jul 4):
 *  · `?match=<fixtureId>&mode=live|replay` — explicit override, always wins.
 *  · auto: if a fixture the stands service ingests is inside its live window
 *    (KO−45min → KO+3h30 — covers ET+pens), the page IS that match, LIVE
 *    (LiveSource over the stands WS: normalized feed + ledger fan-out).
 *  · otherwise: the featured replay (the ARG–CPV five-goal epic) with the
 *    crowd socket still live — real fans move real counters over a replay.
 *
 * Coordinator glue, per the lanes' seams:
 *  · the crowd client's faith needs the SCORE (trailing side), and score never
 *    rides the crowd bus — so we tee onScore here and feed setTrailingSide.
 */
import { createApp } from './app';
import { LiveSource, ReplaySource, StandsCrowdClient, lookupFixture } from './data';
import type { MatchCallbacks, MatchDataSource, ScoreEvent } from '@contracts/match';
import type { Side } from '@contracts/crowd';

const STANDS_URL = 'wss://rooot-stands.fly.dev/';
/** fixtures the deployed service ingests live (fly.toml -e TXLINE_FIXTURES) */
const LIVE_FIXTURES = ['18185036', '18188721'];
const FEATURED_REPLAY = { fixtureId: '18175918', url: '/replay/arg-cpv-20260703.jsonl' };
const LIVE_WINDOW_BEFORE_MS = 45 * 60_000;
const LIVE_WINDOW_AFTER_MS = 210 * 60_000; // ET + pens + seal comfortably

function pickMode(): { fixtureId: string; mode: 'live' | 'replay' } {
  const q = new URLSearchParams(window.location.search);
  const override = q.get('match');
  if (override && lookupFixture(override)) {
    const m = q.get('mode');
    return { fixtureId: override, mode: m === 'live' ? 'live' : m === 'replay' ? 'replay' : LIVE_FIXTURES.includes(override) ? 'live' : 'replay' };
  }
  const now = Date.now();
  for (const id of LIVE_FIXTURES) {
    const fx = lookupFixture(id);
    if (!fx) continue;
    const ko = Date.parse(fx.kickoffISO);
    if (Number.isFinite(ko) && now >= ko - LIVE_WINDOW_BEFORE_MS && now <= ko + LIVE_WINDOW_AFTER_MS) {
      return { fixtureId: id, mode: 'live' };
    }
  }
  return { fixtureId: FEATURED_REPLAY.fixtureId, mode: 'replay' };
}

function trailingSide(ev: ScoreEvent): Side | null {
  if (ev.home < ev.away) return 'home';
  if (ev.away < ev.home) return 'away';
  return null;
}

function mount(): void {
  const pick = pickMode();
  const fixture = lookupFixture(pick.fixtureId);
  if (!fixture) throw new Error('[rooot] fixture meta missing');

  const source: MatchDataSource =
    pick.mode === 'live'
      ? new LiveSource({ url: STANDS_URL, matchId: pick.fixtureId })
      : new ReplaySource({
          url: pick.fixtureId === FEATURED_REPLAY.fixtureId ? FEATURED_REPLAY.url : `/replay/${pick.fixtureId}.jsonl`,
          fixture,
          speed: 60, // heartbeat-heavy pre-match tape — the belief settles in seconds
        });

  const crowd = new StandsCrowdClient({ url: STANDS_URL, matchId: pick.fixtureId });

  const app = createApp({
    mount: document.body,
    source,
    fixture,
    crowd,
    autostart: false, // we start it ourselves with the faith tee below
  });

  // faith tee: score → trailing side → crowd client (contracts/ledger.ts
  // CrowdView.faithSide; the crowd wire itself never carries a score).
  const cb = app.callbacks;
  const teed: MatchCallbacks = {
    ...cb,
    onScore: (ev) => {
      crowd.setTrailingSide(trailingSide(ev));
      cb.onScore(ev);
    },
  };

  // (hidden-tab rAF pump lives inside createApp — the shell owns its stage)
  void source.initialize().then(() => source.start(teed));
  console.log(`[rooot] up — ${fixture.home.code}–${fixture.away.code} · ${pick.mode.toUpperCase()}`);
}

mount();
