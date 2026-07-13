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
 *   STANDS_DATA_DIR       durable data dir (default: /data if mounted+writable, else /tmp) —
 *                          snapshot + sentiment records both live under this dir
 *   STANDS_SNAPSHOT_PATH  restart-continuity snapshot file (default <STANDS_DATA_DIR>/rooot-stands-snapshot.json)
 *   STANDS_SNAPSHOT_INTERVAL_MS  how often the snapshot is written (default 30000)
 *
 *   TXLINE_ENABLE=1       turn on live TxLINE ingest
 *   TXLINE_API             base URL (default https://txline-dev.txodds.com)
 *   TXLINE_TOKEN_FILE      path to { jwt, apiToken } (default ../../.secrets/txline-token.json)
 *   TXLINE_FIXTURES         comma-separated fixtureIds to fan out (required if TXLINE_ENABLE=1)
 *
 *   REPLAY_FILE            path to a fixtures/*.jsonl to replay
 *   REPLAY_FIXTURE          the single fixtureId that file's lines belong to
 *   REPLAY_SPEED            playback speed multiplier (default 1)
 *
 *   TXLINE_IDLE_TIMEOUT_MS     abort+reconnect a CONNECTED stream after this long
 *                               with zero bytes (default 60000; the wire heartbeats
 *                               every ~15s, so that is 4 missed beats)
 *   TXLINE_CONNECT_TIMEOUT_MS  abort+retry a connect whose response headers never
 *                               arrive (default 30000)
 *   SELF_PROBE_INTERVAL_MS     in-process /health self-probe cadence (default 30000)
 *   SELF_PROBE_TIMEOUT_MS      per-probe response deadline (default 5000)
 *   SELF_PROBE_MAX_MISSES      consecutive failures before exit(1)-for-restart (default 4)
 *   SELF_PROBE_DISABLE=1       disarm the self-probe entirely
 */
import type { FeedMsg } from '@contracts/feed';
import { armAnchorBackfill, armSelfProbe, createStandsServer } from './server';
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
  // ledger msgs carry their fixture on every variant (event: the id's
  // `${fixtureKey}:` prefix; amend/discard: fixtureKey) — MISSING THIS CASE
  // dropped every live ledger row before the room (caught live, CAN-MAR
  // kickoff, Jul 4: zero rows reached clients while replay mode worked).
  if (msg.type === 'ledger') {
    const m = msg.msg;
    if (m.type === 'event') {
      const sep = m.ev.id.indexOf(':');
      return sep > 0 ? m.ev.id.slice(0, sep) : null;
    }
    return m.fixtureKey || null;
  }
  if (msg.type === 'spell') return msg.fixtureId; // tagged at emit (Spell has no id)
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
    // read back the REAL bound port (PORT=0 asks the OS for a free one — `port`
    // itself would still print "0" in that case, which is what a dev-only
    // caller needs to discover the actual port a spawned instance bound to).
    const addr = httpServer.address();
    const actualPort = addr && typeof addr === 'object' ? addr.port : port;
    console.log(`[stands] listening on :${actualPort} (GET /health, WS upgrade at /)`);
    // dead-man for the Jul 11 accept-path wedge (armSelfProbe doc, server.ts):
    // probe our own /health through the real listener; exit(1) for a
    // supervisor restart after SELF_PROBE_MAX_MISSES consecutive failures.
    armSelfProbe(actualPort);
    // Anchor durability (opt-in via STANDS_ANCHOR_BACKFILL=1, set in fly.toml):
    // sweep DATA_DIR/sentiment/*.json at boot + periodically, re-anchoring any
    // record whose on-chain sig write-back was lost (server.ts armAnchorBackfill).
    // Disarmed by default so dev checks that boot this entrypoint never fire
    // real devnet anchors.
    armAnchorBackfill();
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
