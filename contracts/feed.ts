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
import type { LedgerMsg } from './ledger';
import type { Spell } from './texture';
import type { StartingXIPlayer } from './normalize';

export type FeedState = 'connected' | 'reconnecting' | 'replay' | 'lost';

export type FeedMsg =
  | { type: 'fixtureInfo'; fixture: Fixture }
  | { type: 'odds'; tick: OddsTick }
  | { type: 'score'; ev: ScoreEvent }
  | { type: 'status'; ev: StatusEvent }
  /** the readable story (contracts/ledger.ts) — LiveSource forwards to onLedger */
  | { type: 'ledger'; msg: LedgerMsg }
  /** possession spells (contracts/texture.ts) — the loom's possession/pressure/
   * tempo threads; the wire's biggest stream. Carries fixtureId because a Spell
   * has none of its own (unlike odds/score/status whose .raw does) — the
   * service routes to the room by it. */
  | { type: 'spell'; fixtureId: string; spell: Spell }
  /** the announced starting elevens (from the `lineups` envelope) — home/away XI, so a
   * card can show WHO is playing before a ball is kicked. Cached + replayed on join. */
  | { type: 'lineup'; fixtureId: string; lineup: { home: StartingXIPlayer[]; away: StartingXIPlayer[] } }
  | { type: 'feedState'; state: FeedState };
