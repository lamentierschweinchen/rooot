/**
 * ROOOT event store — project.ts: named projections over a TimedEvent stream
 * (services/stands/src/eventstore/load.ts). Pure functions, no I/O — every
 * projection here is a fold over an in-memory array; nothing here reads a
 * file, opens a socket, or touches the clock.
 */
import type { FeedMsg } from '@contracts/feed';
import type { MatchPhase } from '@contracts/match';
import type { SentimentRecord } from '@contracts/sentiment';
import { SentimentAccumulator } from '../sentiment/accumulator';
import type { TimedEvent } from './load';

/** The generic fold every named projection below is built from. */
export function project<S>(events: TimedEvent[], reducer: (state: S, msg: FeedMsg) => S, init: S): S {
  let state = init;
  for (const e of events) state = reducer(state, e.msg);
  return state;
}

/* ── (a) matchState — the status/score/clock timeline ─────────────────── */

export interface MatchStateProjection {
  statusHistory: Array<{ atMs: number; phase: MatchPhase; minute: number | null }>;
  scoreHistory: Array<{ atMs: number; home: number; away: number; minute: number | null }>;
  /** the timeline collapsed to "what the match looks like right now" — the tail of both histories above. */
  current: { phase: MatchPhase | null; minute: number | null; score: { home: number; away: number } };
}

function matchStateReducer(state: MatchStateProjection, msg: FeedMsg): MatchStateProjection {
  if (msg.type === 'status') {
    state.statusHistory.push({ atMs: msg.ev.tMs, phase: msg.ev.phase, minute: msg.ev.minute });
    state.current = {
      ...state.current,
      phase: msg.ev.phase,
      minute: msg.ev.minute ?? state.current.minute,
    };
  } else if (msg.type === 'score') {
    state.scoreHistory.push({ atMs: msg.ev.tMs, home: msg.ev.home, away: msg.ev.away, minute: msg.ev.minute });
    state.current = {
      ...state.current,
      score: { home: msg.ev.home, away: msg.ev.away },
      minute: msg.ev.minute ?? state.current.minute,
    };
  }
  return state;
}

/** (a) the phase/score/clock timeline, plus the collapsed "right now" view. */
export function projectMatchState(events: TimedEvent[]): MatchStateProjection {
  const init: MatchStateProjection = {
    statusHistory: [],
    scoreHistory: [],
    current: { phase: null, minute: null, score: { home: 0, away: 0 } },
  };
  return project(events, matchStateReducer, init);
}

/* ── (b) the sentiment fold — SentimentAccumulator, reused exactly ────── */

/**
 * Feed a TimedEvent stream through a FRESH SentimentAccumulator — the SAME
 * class the live service folds its own broadcast stream through (services/
 * stands/src/sentiment/accumulator.ts), imported and reused verbatim, never
 * reimplemented. `onFeed` accepts `ServerMsg | FeedMsg`; every TimedEvent's
 * `msg` is a FeedMsg, a legal subset.
 *
 * Stays pure in spirit even though SentimentAccumulator is a mutable class:
 * a fresh instance in, the same instance (mutated only in memory) out — no
 * file/network/clock touched. Crystallizing (`.crystallize(...)`) is the
 * caller's call: it needs crowd inputs + edition metadata this module has no
 * honest way to invent (see eventstore/reproject.ts, which supplies the
 * honest offline zero-fill).
 */
export function projectSentiment(
  events: TimedEvent[],
  matchId: string,
  fixture: SentimentRecord['fixture'],
): SentimentAccumulator {
  const acc = new SentimentAccumulator(matchId, fixture);
  return project<SentimentAccumulator>(
    events,
    (a, msg) => {
      a.onFeed(msg);
      return a;
    },
    acc,
  );
}

/* ── (c) stats — counts by event type, the data-explorer seed ─────────── */

export type StatsProjection = Record<FeedMsg['type'], number>;

function statsReducer(state: StatsProjection, msg: FeedMsg): StatsProjection {
  state[msg.type] = (state[msg.type] ?? 0) + 1;
  return state;
}

/** (c) counts by FeedMsg type — the data-explorer seed (research §3). */
export function projectStats(events: TimedEvent[]): StatsProjection {
  const init: StatsProjection = {
    fixtureInfo: 0,
    odds: 0,
    score: 0,
    status: 0,
    ledger: 0,
    spell: 0,
    lineup: 0,
    feedState: 0,
  };
  return project(events, statsReducer, init);
}
