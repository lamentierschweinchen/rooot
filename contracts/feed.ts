/**
 * ROOOT feed seam — normalized match data as the stands service broadcasts it.
 * FROZEN: only the coordinator changes this file.
 *
 * The service holds the single TxLINE connection (tokens stay server-side) and
 * fans normalized events to every client over the same WebSocket that carries
 * crowd state (contracts/crowd.ts ServerMsg). Clients therefore speak:
 * `ServerMsg | FeedMsg`. The web app's LiveSource adapts FeedMsg back into
 * MatchCallbacks (contracts/match.ts); ReplaySource produces the same callbacks
 * from recorded JSONL — one seam, many transports.
 */

import type { Fixture, OddsTick, ScoreEvent, StatusEvent } from './match';

export type FeedState = 'connected' | 'reconnecting' | 'replay' | 'lost';

export type FeedMsg =
  | { type: 'fixtureInfo'; fixture: Fixture }
  | { type: 'odds'; tick: OddsTick }
  | { type: 'score'; ev: ScoreEvent }
  | { type: 'status'; ev: StatusEvent }
  | { type: 'feedState'; state: FeedState };
