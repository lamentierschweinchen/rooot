/**
 * ROOOT composition root — coordinator-only (see AGENTS.md).
 *
 * THE WATCHING EXPERIENCE (BRIEF-WATCHING): the shell (Lane A) fed by
 * ReplaySource on the bundled REAL ARG–CPV capture, with the LIVE stands
 * service (Lane C, wss://rooot-stands.fly.dev) carrying root/cheer/rooted
 * counts — real fans move real counters even while the match data is replay.
 *
 * Coordinator glue, per the lanes' seams:
 *  · the crowd client's faith needs the SCORE (trailing side), and score never
 *    rides the crowd bus — so we tee onScore here and feed setTrailingSide.
 */
import { createApp } from './app';
import { ReplaySource, StandsCrowdClient, lookupFixture } from './data';
import type { MatchCallbacks, ScoreEvent } from '@contracts/match';
import type { Side } from '@contracts/crowd';

const STANDS_URL = 'wss://rooot-stands.fly.dev/';
const FIXTURE_ID = '18175918'; // ARG–CPV — tonight's real capture

function trailingSide(ev: ScoreEvent): Side | null {
  if (ev.home < ev.away) return 'home';
  if (ev.away < ev.home) return 'away';
  return null;
}

function mount(): void {
  const fixture = lookupFixture(FIXTURE_ID);
  if (!fixture) throw new Error('[rooot] fixture meta missing');

  const source = new ReplaySource({
    url: '/replay/arg-cpv-20260703.jsonl',
    fixture,
    speed: 60, // ~150 heartbeat lines precede the first odds tick — at 60x the belief settles in seconds
  });

  const crowd = new StandsCrowdClient({ url: STANDS_URL, matchId: FIXTURE_ID });

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
}

mount();
console.log('[rooot] the watching shell is up — real ARG–CPV replay + live stands.');
