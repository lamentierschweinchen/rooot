/**
 * WebSocket + HTTP server. Wires the contracts/crowd.ts protocol to
 * MatchState/MatchRegistry. One WS connection = one browser tab; each
 * connection joins exactly one match room (cap: 1 room per connection, per
 * task spec) via HelloMsg, and may additionally join one row (RoomStateMsg
 * roomId) inside that match.
 *
 * Kill switches (env): DISABLE_PULSE drops react handling silently (hello/
 * cheer/call still work); DISABLE_ROOMS drops roomId join/RoomStateMsg.
 */
import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { CallMsg, CallReceiptMsg, ClientMsg, RoomStateMsg, ServerMsg, Side } from '@contracts/crowd';
import type { FeedMsg } from '@contracts/feed';
import { MatchRegistry } from './registry';
import { relayCall } from './relay';

const PORT = Number(process.env.PORT ?? 8787);
const DISABLE_PULSE = process.env.DISABLE_PULSE === '1';
const DISABLE_ROOMS = process.env.DISABLE_ROOMS === '1';

/** Rate-limit hello floods: max hellos per connection per window. */
const HELLO_MAX_PER_WINDOW = 5;
const HELLO_WINDOW_MS = 10_000;

const START_MS = Date.now();

interface ConnState {
  ws: WebSocket;
  matchId: string | null;
  anonId: string | null;
  helloTimestamps: number[];
}

const conns = new Map<WebSocket, ConnState>();

function send(ws: WebSocket, msg: ServerMsg | FeedMsg): void {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(msg));
}

/** Broadcast to every connection currently in matchId's room. */
function broadcastToMatch(matchId: string, msg: ServerMsg | FeedMsg): void {
  const payload = JSON.stringify(msg);
  for (const [ws, state] of conns) {
    if (state.matchId === matchId && ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
  if (msg.type === 'feedState') lastFeedState.set(matchId, msg); // see handleHello: replay-on-join
}

/**
 * feedState is edge-triggered (onFeedState fires on TRANSITIONS — task spec),
 * so a client that connects between transitions would otherwise never learn
 * current feed health. Cache the latest per match and replay it to anyone
 * who hellos in after the fact.
 */
const lastFeedState = new Map<string, Extract<FeedMsg, { type: 'feedState' }>>();

const registry = new MatchRegistry((matchId, msg) => broadcastToMatch(matchId, msg));

function isValidSide(v: unknown): v is Side {
  return v === 'home' || v === 'away';
}

function broadcastRoomState(matchId: string, roomId: string): void {
  if (DISABLE_ROOMS) return;
  const match = registry.get(matchId);
  const room = match?.rooms.get(roomId);
  if (!match || !room) return;
  const msg: RoomStateMsg = { type: 'room', roomId, members: room.toWireMembers() };
  broadcastToMatch(matchId, msg);
}

function handleHello(ws: WebSocket, state: ConnState, msg: Extract<ClientMsg, { type: 'hello' }>): void {
  const now = Date.now();
  state.helloTimestamps = state.helloTimestamps.filter((t) => now - t < HELLO_WINDOW_MS);
  if (state.helloTimestamps.length >= HELLO_MAX_PER_WINDOW) {
    console.warn(`[stands] hello flood from anonId=${msg.anonId?.slice(0, 8)}, dropping`);
    return;
  }
  state.helloTimestamps.push(now);

  if (!msg.matchId || !msg.anonId) return; // malformed, ignore

  // cap: 1 room (match) per connection — a hello for a NEW matchId on an
  // already-joined connection is rejected rather than silently re-homing it.
  if (state.matchId && state.matchId !== msg.matchId) {
    console.warn(`[stands] conn already in match=${state.matchId}, rejecting hello for ${msg.matchId}`);
    return;
  }

  const wasConnected = state.matchId !== null;
  state.matchId = msg.matchId;
  state.anonId = msg.anonId;

  const match = registry.getOrCreate(msg.matchId);
  if (!wasConnected) match.markConnected(msg.anonId);
  if (msg.side) match.root(msg.anonId, msg.side);

  const cachedFeedState = lastFeedState.get(msg.matchId);
  if (cachedFeedState) send(ws, cachedFeedState);

  if (msg.roomId && !DISABLE_ROOMS) {
    const room = match.getOrCreateRoom(msg.roomId);
    const result = room.join({
      anonId: msg.anonId,
      name: msg.name ?? 'fan',
      side: msg.side ?? 'home',
      present: true,
      ws,
    });
    if (result === 'full') {
      // reject overflow gracefully: no membership change, no crash — the
      // client's own hello simply doesn't seat them; StandsState still flows.
      console.warn(`[stands] room ${msg.roomId} full, anonId=${msg.anonId.slice(0, 8)} not seated`);
    } else {
      broadcastRoomState(msg.matchId, msg.roomId);
    }
  }
}

function handleCheer(state: ConnState, msg: Extract<ClientMsg, { type: 'cheer' }>): void {
  if (!state.matchId || !state.anonId || state.matchId !== msg.matchId) return;
  if (!isValidSide(msg.side) || typeof msg.n !== 'number') return;
  const match = registry.getOrCreate(msg.matchId);
  match.cheer(state.anonId, msg.side, msg.n);
}

function handleReact(state: ConnState, msg: Extract<ClientMsg, { type: 'react' }>): void {
  if (DISABLE_PULSE) return;
  if (!state.matchId || !state.anonId || state.matchId !== msg.matchId) return;
  if (!isValidSide(msg.side)) return;
  const match = registry.getOrCreate(msg.matchId);
  match.react(state.anonId, msg.side, msg.kind);
}

function isValidCall(msg: CallMsg): boolean {
  return (
    typeof msg.matchId === 'string' &&
    msg.matchId.length > 0 &&
    typeof msg.anonId === 'string' &&
    msg.anonId.length > 0 &&
    isValidSide(msg.side) &&
    typeof msg.claim === 'string' &&
    msg.claim.length > 0 &&
    (msg.minute === null || typeof msg.minute === 'number') &&
    typeof msg.marketP === 'object' &&
    msg.marketP !== null &&
    typeof msg.marketP.home === 'number' &&
    typeof msg.marketP.draw === 'number' &&
    typeof msg.marketP.away === 'number' &&
    typeof msg.atMs === 'number'
  );
}

async function handleCall(ws: WebSocket, state: ConnState, msg: Extract<ClientMsg, { type: 'call' }>): Promise<void> {
  if (!state.matchId || state.matchId !== msg.matchId) return;
  if (!isValidCall(msg)) {
    console.warn(`[stands] malformed call from anonId=${msg.anonId?.slice?.(0, 8)}, dropping`);
    return;
  }
  // NOTE: marketP re-verification against the live feed window (per the
  // contracts/crowd.ts doc comment) is not implemented yet — tracked as a
  // remaining TODO alongside the real relayer. Today this only checks shape.
  const txSig = await relayCall(msg);
  const receipt: CallReceiptMsg = {
    type: 'callReceipt',
    matchId: msg.matchId,
    anonId: msg.anonId,
    claim: msg.claim,
    minute: msg.minute,
    marketP: msg.marketP,
    txSig,
    atMs: Date.now(),
  };
  send(ws, receipt);
}

function handleClose(ws: WebSocket): void {
  const state = conns.get(ws);
  conns.delete(ws);
  if (!state?.matchId || !state.anonId) return;
  const match = registry.get(state.matchId);
  if (!match) return;
  match.markDisconnected(state.anonId);
  const found = match.findRoomOf(state.anonId);
  if (found) {
    found.room.setPresent(state.anonId, false);
    broadcastRoomState(state.matchId, found.roomId);
  }
}

function handleMessage(ws: WebSocket, state: ConnState, raw: string): void {
  let msg: ClientMsg;
  try {
    msg = JSON.parse(raw) as ClientMsg;
  } catch {
    return; // not JSON, ignore
  }
  switch (msg.type) {
    case 'hello':
      return handleHello(ws, state, msg);
    case 'cheer':
      return handleCheer(state, msg);
    case 'react':
      return handleReact(state, msg);
    case 'call':
      void handleCall(ws, state, msg);
      return;
    default:
      return; // unknown type, ignore
  }
}

export function createStandsServer() {
  const httpServer = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      const body = JSON.stringify({
        uptime: Math.floor((Date.now() - START_MS) / 1000),
        matchesActive: registry.activeMatchCount(),
        clients: registry.totalClientCount(),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not found');
  });

  const wss = new WebSocketServer({ server: httpServer });

  wss.on('connection', (ws: WebSocket, req) => {
    const state: ConnState = { ws, matchId: null, anonId: null, helloTimestamps: [] };
    // FEED SEATING BY URL (caught live at CAN-MAR, Jul 4): broadcastToMatch
    // filters on state.matchId, which only hello set — so a feed-only client
    // (LiveSource watches; it has no crowd identity to hello with) received
    // NOTHING. Watching the match is public: seat the socket into its match
    // from ?matchId= at connect. hello still owns crowd identity/actions,
    // and the 1-match-per-connection cap still holds (hello for a DIFFERENT
    // match on a URL-seated conn is rejected by handleHello as before).
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      const mid = url.searchParams.get('matchId');
      if (mid) {
        state.matchId = mid;
        const last = lastFeedState.get(mid);
        if (last && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(last));
      }
    } catch {
      // unparseable URL — stay unseated; hello can still seat this conn
    }
    conns.set(ws, state);
    ws.on('message', (data) => handleMessage(ws, state, data.toString()));
    ws.on('close', () => handleClose(ws));
    ws.on('error', () => handleClose(ws));
  });

  registry.loadSnapshot();
  registry.start();

  httpServer.on('close', () => registry.stop());

  return { httpServer, wss, registry, port: PORT, broadcastToMatch };
}
