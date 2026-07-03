/**
 * ROOOT data lane — MockSource.
 *
 * DEV-ONLY. A hand-scripted, entirely fictional 8-minute "match" that
 * compresses a full dramatic arc (kickoff → early lead → equalizer →
 * momentum swing → late go-ahead goal → hold-on finish) into a fast,
 * deterministic timeline other lanes can build against without waiting on
 * real fixtures or the live feed. It exists purely for local development
 * speed (stage/crowd/relic lanes iterating on animation without a network
 * dependency) — never used for a demo or judged submission.
 *
 * Honesty (AGENTS.md law #1): every tick's `source` is 'replay', same as
 * ReplaySource — there is no 'mock' variant of MatchCallbacks' source field
 * in contracts/match.ts, and there must not be, because the callback bus is
 * not the place to encode "is this real" — MockSource's OWN identity
 * (constructor name, this file's existence in a dev-only path, this doc
 * comment) is the honesty boundary. Nothing about a MockSource-sourced tick
 * looks any more "real" than a ReplaySource-sourced one to code consuming
 * MatchCallbacks — both replay a scripted timeline; only the CONTENT differs
 * (recorded truth vs invented drama). Any UI that surfaces "this is a demo"
 * messaging should key off *which class instantiated the source*
 * (main.ts's composition root knows), not off `source` on the tick itself.
 */
import type { Fixture, MatchCallbacks, MatchDataSource } from '@contracts/match';
import type { OddsTick, ScoreEvent, StatusEvent } from '@contracts/match';
import { FIXTURES } from './fixtureMeta';

type ScriptEvent =
  | { atMs: number; kind: 'odds'; tick: Omit<OddsTick, 'tMs' | 'source'> }
  | { atMs: number; kind: 'score'; ev: Omit<ScoreEvent, 'tMs' | 'source'> }
  | { atMs: number; kind: 'status'; ev: Omit<StatusEvent, 'tMs' | 'source'> };

const MOCK_FIXTURE: Fixture = FIXTURES['18193785'] ?? {
  id: 'mock-usa-belgium',
  home: { code: 'USA', name: 'USA', colors: ['#B22234', '#3C3B6E'], flag: '🇺🇸' },
  away: { code: 'BEL', name: 'Belgium', colors: ['#000000', '#FDDA24'], flag: '🇧🇪' },
  kickoffISO: new Date().toISOString(),
};

/** 8 minutes of wall-clock compressed into an entire match — every atMs below
 * is milliseconds from MockSource.start(). Probabilities are invented to
 * TELL a story (early Argentina-style favorite fades, wobbles, fights back
 * late) — never claim these came from a market. */
function buildScript(): ScriptEvent[] {
  const s: ScriptEvent[] = [];
  const min = (m: number) => m * 1000; // 1 fictional match-minute = 1 real second (8min match ≈ 480 "minutes")

  s.push({ atMs: 0, kind: 'status', ev: { phase: 'PRE', minute: null } });
  s.push({ atMs: 200, kind: 'status', ev: { phase: 'FIRST_HALF', minute: 0 } });
  s.push({ atMs: 200, kind: 'odds', tick: { minute: 0, pHome: 0.52, pDraw: 0.27, pAway: 0.21 } });

  // early home pressure builds
  s.push({ atMs: min(8), kind: 'odds', tick: { minute: 8, pHome: 0.58, pDraw: 0.25, pAway: 0.17 } });
  s.push({ atMs: min(15), kind: 'odds', tick: { minute: 15, pHome: 0.63, pDraw: 0.23, pAway: 0.14 } });

  // HOME GOAL, minute 22 — sharp jump
  s.push({
    atMs: min(22),
    kind: 'score',
    ev: { minute: 22, home: 1, away: 0, side: 'home', scorer: 'Mock Scorer 9' },
  });
  s.push({ atMs: min(22) + 500, kind: 'odds', tick: { minute: 22, pHome: 0.81, pDraw: 0.13, pAway: 0.06 } });

  s.push({ atMs: min(30), kind: 'odds', tick: { minute: 30, pHome: 0.79, pDraw: 0.14, pAway: 0.07 } });

  // HALF TIME
  s.push({ atMs: min(45), kind: 'status', ev: { phase: 'HALF_TIME', minute: 45 } });
  s.push({ atMs: min(45), kind: 'odds', tick: { minute: 45, pHome: 0.78, pDraw: 0.15, pAway: 0.07 } });

  s.push({ atMs: min(46), kind: 'status', ev: { phase: 'SECOND_HALF', minute: 45 } });

  // AWAY EQUALIZER, minute 58 — the big swing
  s.push({
    atMs: min(58),
    kind: 'score',
    ev: { minute: 58, home: 1, away: 1, side: 'away', scorer: 'Mock Scorer 14' },
  });
  s.push({ atMs: min(58) + 500, kind: 'odds', tick: { minute: 58, pHome: 0.38, pDraw: 0.29, pAway: 0.33 } });

  s.push({ atMs: min(65), kind: 'odds', tick: { minute: 65, pHome: 0.35, pDraw: 0.28, pAway: 0.37 } });
  s.push({ atMs: min(72), kind: 'odds', tick: { minute: 72, pHome: 0.33, pDraw: 0.27, pAway: 0.4 } });

  // AWAY GOES AHEAD, minute 79 — momentum peaks for away
  s.push({
    atMs: min(79),
    kind: 'score',
    ev: { minute: 79, home: 1, away: 2, side: 'away', scorer: 'Mock Scorer 14' },
  });
  s.push({ atMs: min(79) + 500, kind: 'odds', tick: { minute: 79, pHome: 0.14, pDraw: 0.19, pAway: 0.67 } });

  // HOME LATE EQUALIZER, minute 88 — the comeback beat
  s.push({
    atMs: min(88),
    kind: 'score',
    ev: { minute: 88, home: 2, away: 2, side: 'home', scorer: 'Mock Scorer 9' },
  });
  s.push({ atMs: min(88) + 500, kind: 'odds', tick: { minute: 88, pHome: 0.4, pDraw: 0.35, pAway: 0.25 } });

  s.push({ atMs: min(90), kind: 'odds', tick: { minute: 90, pHome: 0.41, pDraw: 0.36, pAway: 0.23 } });
  s.push({ atMs: min(93), kind: 'status', ev: { phase: 'FULL_TIME', minute: 90 } });

  return s.sort((a, b) => a.atMs - b.atMs);
}

export class MockSource implements MatchDataSource {
  private readonly script = buildScript();
  private timers: ReturnType<typeof setTimeout>[] = [];
  private cb: MatchCallbacks | null = null;

  // eslint-disable-next-line @typescript-eslint/require-await
  async initialize(): Promise<void> {
    console.warn('[MockSource] DEV-ONLY scripted match — never use for a demo or judged submission.');
  }

  start(cb: MatchCallbacks): void {
    this.cb = cb;
    cb.onFeedState?.('replay');
    for (const event of this.script) {
      const t = setTimeout(() => this.emit(event), event.atMs);
      this.timers.push(t);
    }
  }

  stop(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
  }

  getFixture(): Fixture | null {
    return MOCK_FIXTURE;
  }

  private emit(event: ScriptEvent): void {
    if (!this.cb) return;
    const tMs = Date.now();
    switch (event.kind) {
      case 'odds':
        this.cb.onOdds({ ...event.tick, tMs, source: 'replay' });
        return;
      case 'score':
        this.cb.onScore({ ...event.ev, tMs, source: 'replay' });
        return;
      case 'status':
        this.cb.onStatus({ ...event.ev, tMs, source: 'replay' });
        return;
    }
  }
}
