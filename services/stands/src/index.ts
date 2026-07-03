/**
 * ROOOT stands service — L2 lane entrypoint.
 *
 * Job: hold the live stands for each match — rooted counts per side, decayed
 * cheer roar, pulse react counts, presence, rooms — and fan state out to all
 * clients at ~4 Hz. Also: the call relayer seam (see relay.ts — real relayer
 * lands separately). Optionally ingests TxLINE live odds/scores or a recorded
 * replay fixture, normalizing into contracts/feed.ts FeedMsg and broadcasting
 * alongside crowd state on the same WebSocket (contracts/crowd.ts ServerMsg).
 *
 * Rules (AGENTS.md): crowd counts are honest counts (rate-decay per anonId,
 * clamp bursts); no probabilities are ever derived from crowd data; secrets
 * only via env / .secrets — never committed, never logged; kill-switch env
 * flags for pulse/rooms; weekend scale = demo scale (in-memory + snapshot).
 *
 * Env:
 *   PORT                 ws+http port (default 8787)
 *   DISABLE_PULSE=1       drop react handling
 *   DISABLE_ROOMS=1       drop room/row join + RoomStateMsg
 *   STANDS_SNAPSHOT_PATH  restart-continuity snapshot file (default /tmp/rooot-stands-snapshot.json)
 *
 *   TXLINE_ENABLE=1       turn on live TxLINE ingest
 *   TXLINE_API             base URL (default https://txline-dev.txodds.com)
 *   TXLINE_TOKEN_FILE      path to { jwt, apiToken } (default ../../.secrets/txline-token.json)
 *   TXLINE_FIXTURES         comma-separated fixtureIds to fan out (required if TXLINE_ENABLE=1)
 *
 *   REPLAY_FILE            path to a fixtures/*.jsonl to replay
 *   REPLAY_FIXTURE          the single fixtureId that file's lines belong to
 *   REPLAY_SPEED            playback speed multiplier (default 1)
 */
import type { FeedMsg } from '@contracts/feed';
import { createStandsServer } from './server';
import { startTxLineIngest } from './ingest/txline';
import { startReplayIngest } from './ingest/replay';

const TXLINE_ENABLE = process.env.TXLINE_ENABLE === '1';
const REPLAY_FILE = process.env.REPLAY_FILE;

function parseFixtureIds(): Set<string> {
  const raw = process.env.TXLINE_FIXTURES ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

/**
 * A single TXLINE_FIXTURES subscription covers multiple fixtures on one
 * shared SSE connection — each normalized FeedMsg belongs to exactly ONE of
 * them (contracts/normalize.ts threads the source FixtureId/fixtureId
 * through under tick.raw / ev.raw). Routing every message to every
 * configured match would leak one match's odds into another's room —
 * a honesty-law violation (AGENTS.md #1: market data is per-match, never
 * blended/mislabeled). This pulls the true id back out for routing.
 */
function fixtureIdOfFeedMsg(msg: FeedMsg): string | null {
  let raw: unknown;
  if (msg.type === 'odds') raw = msg.tick.raw;
  else if (msg.type === 'score') raw = msg.ev.raw;
  else if (msg.type === 'status') raw = msg.ev.raw;
  else return null; // fixtureInfo/feedState aren't per-message-fixture-tagged here
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = obj.FixtureId ?? obj.fixtureId;
  return typeof id === 'number' ? String(id) : typeof id === 'string' ? id : null;
}

function main(): void {
  const { httpServer, port, broadcastToMatch } = createStandsServer();

  httpServer.listen(port, () => {
    console.log(`[stands] listening on :${port} (GET /health, WS upgrade at /)`);
  });

  const routeFeedMsg = (matchId: string, msg: FeedMsg) => broadcastToMatch(matchId, msg);

  if (TXLINE_ENABLE) {
    const fixtureIds = parseFixtureIds();
    if (fixtureIds.size === 0) {
      console.warn('[stands] TXLINE_ENABLE=1 but TXLINE_FIXTURES is empty — no fixtures will be ingested');
    } else {
      console.log(`[stands] TXLINE ingest enabled for fixtures: ${[...fixtureIds].join(', ')}`);
      try {
        startTxLineIngest({
          fixtureIds,
          onFeedMsg: (msg) => {
            // matchId == fixtureId by convention, but a shared subscription
            // carries many fixtures on one connection — route each message
            // to the ONE match it actually belongs to (see fixtureIdOfFeedMsg
            // doc comment: honesty law, never fan one match's odds into
            // another's room).
            const matchId = fixtureIdOfFeedMsg(msg);
            if (matchId && fixtureIds.has(matchId)) routeFeedMsg(matchId, msg);
          },
          onFeedState: (state) => {
            // feedState is transport health for the whole shared connection,
            // not per-fixture data — legitimately broadcast to every
            // configured match.
            console.log(`[stands:txline] feedState -> ${state}`);
            for (const matchId of fixtureIds) routeFeedMsg(matchId, { type: 'feedState', state });
          },
        });
      } catch (err) {
        // token file missing/malformed: fail loudly in logs, but don't crash
        // the crowd side of the service — cheer/react/room still work.
        console.error(`[stands] TXLINE ingest failed to start: ${String(err)}`);
      }
    }
  }

  if (REPLAY_FILE) {
    const fixtureId = process.env.REPLAY_FIXTURE;
    if (!fixtureId) {
      console.warn('[stands] REPLAY_FILE set but REPLAY_FIXTURE is missing — replay not started');
    } else {
      const speed = Number(process.env.REPLAY_SPEED ?? '1');
      console.log(`[stands] replay ingest: ${REPLAY_FILE} as fixture=${fixtureId} speed=${speed}x`);
      routeFeedMsg(fixtureId, { type: 'feedState', state: 'replay' });
      startReplayIngest({
        file: REPLAY_FILE,
        fixtureId,
        speed,
        onFeedMsg: (msg) => routeFeedMsg(fixtureId, msg),
        onDone: () => console.log(`[stands] replay of ${REPLAY_FILE} finished`),
      });
    }
  }

  console.log('[stands] up — the one server between the fans and the world.');
}

main();
