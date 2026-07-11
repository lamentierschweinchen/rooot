/**
 * WEDGE SOAK clients (tonight-gate) — the other half of wedge-soak.ts, run as
 * a SEPARATE process so client-side message handling never pollutes the
 * server-side event-loop measurements.
 *
 * Models tonight's real client population against a local soak server:
 *   - STABLE feed watchers (?matchId= join, read everything, stay) — the
 *     footage tap / live monitor / lurking fans
 *   - JOIN CHURN: a fresh ?matchId= socket every WEDGE_CHURN_MS, measuring
 *     open→first-message latency and the join-replay burst size, closed after
 *     6s — the ops probes, monitor re-arms, and terrace reconnect watchdogs
 *   - FANS: helloed identities that cheer ~1/s, predict once, place a
 *     nextGoalCall every 15s, request a seatToken every 30s — the real crowd
 *
 * Prints one JSON line (prefix `[clients]`) every 5s: join latency of the
 * latest churn socket, msgs it got, stable watchers' last-message age.
 *
 * Usage: WEDGE_PORT=8791 tsx src/dev/wedge-clients.ts
 */
import { WebSocket } from 'ws';

const PORT = Number(process.env.WEDGE_PORT ?? 8791);
const MATCH_A = process.env.WEDGE_FIXTURE_A ?? '18213979';
const MATCH_B = process.env.WEDGE_FIXTURE_B ?? '18202783';
const CHURN_MS = Number(process.env.WEDGE_CHURN_MS ?? 4000);
const STABLE_A = Number(process.env.WEDGE_STABLE_A ?? 4);
const STABLE_B = Number(process.env.WEDGE_STABLE_B ?? 2);
const FANS = Number(process.env.WEDGE_FANS ?? 3);
const URL_A = `ws://127.0.0.1:${PORT}/?matchId=${MATCH_A}`;

interface WatcherState { lastMsgMs: number; msgs: number; }
const watchers: WatcherState[] = [];

function stableWatcher(matchId: string): void {
  const st: WatcherState = { lastMsgMs: Date.now(), msgs: 0 };
  watchers.push(st);
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?matchId=${matchId}`);
  ws.on('message', () => { st.lastMsgMs = Date.now(); st.msgs++; });
  ws.on('error', () => {});
  ws.on('close', () => setTimeout(() => stableWatcher(matchId), 1000)); // reconnect like a real tap
}

/* join churn — the probe/monitor/reconnect population */
let lastJoin = { latencyMs: -1, burstMsgs: 0, atSec: 0 };
const t0 = Date.now();
function churnOnce(): void {
  const opened = Date.now();
  let first = -1;
  let burst = 0;
  const ws = new WebSocket(URL_A);
  ws.on('message', () => {
    if (first < 0) first = Date.now() - opened;
    burst++;
  });
  ws.on('error', () => {});
  setTimeout(() => {
    lastJoin = { latencyMs: first, burstMsgs: burst, atSec: Math.round((Date.now() - t0) / 1000) };
    try { ws.close(); } catch { /* already dead */ }
  }, 6000);
}

/* fans — real accepted actions at honest rates */
function fan(i: number): void {
  const anonId = `soak-fan-${i}`;
  const side = i % 2 === 0 ? 'home' : 'away';
  const ws = new WebSocket(URL_A);
  ws.on('error', () => {});
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'hello', matchId: MATCH_A, anonId, side }));
    ws.send(JSON.stringify({ type: 'predict', matchId: MATCH_A, home: 1 + (i % 2), away: i % 2, atMs: Date.now() }));
    const cheer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) { clearInterval(cheer); return; }
      ws.send(JSON.stringify({ type: 'cheer', matchId: MATCH_A, side, n: 2 }));
    }, 1000);
    const call = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) { clearInterval(call); return; }
      ws.send(JSON.stringify({ type: 'nextGoalCall', matchId: MATCH_A, call: i % 3 === 0 ? 'none' : side, atMs: Date.now() }));
    }, 15000);
    const seat = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) { clearInterval(seat); return; }
      ws.send(JSON.stringify({ type: 'seatToken', matchId: MATCH_A, anonId }));
    }, 30000);
  });
  ws.on('close', () => setTimeout(() => fan(i), 2000));
}

for (let i = 0; i < STABLE_A; i++) stableWatcher(MATCH_A);
for (let i = 0; i < STABLE_B; i++) stableWatcher(MATCH_B);
for (let i = 0; i < FANS; i++) fan(i);
setInterval(churnOnce, CHURN_MS);

setInterval(() => {
  const now = Date.now();
  const ages = watchers.map((w) => Math.round((now - w.lastMsgMs) / 1000));
  console.log(`[clients] ${JSON.stringify({ tSec: Math.round((now - t0) / 1000), lastJoin, watcherMsgAgeSec: ages })}`);
}, 5000);
