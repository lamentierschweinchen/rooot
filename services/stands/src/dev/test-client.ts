/**
 * Dev-only verification script (NOT part of the service — never imported by
 * src/index.ts). Simulates 3 WebSocket clients rooting/cheering/reacting
 * against a running stands server and asserts the honesty mechanics:
 *
 *   1. counts move by exactly 1 per hello-with-side (once-per-anonId ROOT).
 *   2. roar (decayed cheers/sec) rises while a client cheers within the token
 *      bucket's sustained rate, is CLAMPED for a client that floods far past
 *      the bucket (macro simulation), and DECAYS back toward 0 within a few
 *      seconds after everyone stops cheering (3s rolling window).
 *   3. pulse react counts respect the 1/sec/kind/user throttle — a rapid
 *      double-react of the same kind only counts once.
 *
 * Usage: `npm run test:client` against a server already running on PORT
 * (default 8787; override with STANDS_URL=ws://host:port).
 */
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '@contracts/crowd';

const URL = process.env.STANDS_URL ?? 'ws://localhost:8787';
const MATCH_ID = `test-${Date.now()}`;

function log(tag: string, msg: string): void {
  console.log(`[test-client:${tag}] ${msg}`);
}

function connect(anonId: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function send(ws: WebSocket, msg: ClientMsg): void {
  ws.send(JSON.stringify(msg));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface Assertion {
  desc: string;
  pass: boolean;
  detail: string;
}

const assertions: Assertion[] = [];
function assert(desc: string, pass: boolean, detail: string): void {
  assertions.push({ desc, pass, detail });
  log(pass ? 'PASS' : 'FAIL', `${desc} — ${detail}`);
}

async function main(): Promise<void> {
  log('setup', `connecting 3 clients to ${URL}, matchId=${MATCH_ID}`);

  const clientA = await connect('a'); // honest cheerer, home
  const clientB = await connect('b'); // macro/flood attempt, home
  const clientC = await connect('c'); // idle-ish reactor, away

  type StandsMsg = Extract<ServerMsg, { type: 'stands' }>;
  const state: { latest: StandsMsg | null; history: StandsMsg[] } = { latest: null, history: [] };

  const onMsg = (raw: WebSocket.RawData) => {
    const msg = JSON.parse(raw.toString()) as ServerMsg;
    if (msg.type === 'stands' && msg.matchId === MATCH_ID) {
      state.latest = msg;
      state.history.push(msg);
    }
  };
  clientA.on('message', onMsg);
  clientB.on('message', onMsg);
  clientC.on('message', onMsg);

  // ── hello: root A+B home, C away ──────────────────────────────────
  send(clientA, { type: 'hello', matchId: MATCH_ID, anonId: 'a', name: 'Alice', side: 'home' });
  send(clientB, { type: 'hello', matchId: MATCH_ID, anonId: 'b', name: 'Bob', side: 'home' });
  send(clientC, { type: 'hello', matchId: MATCH_ID, anonId: 'c', name: 'Cleo', side: 'away' });
  await sleep(400); // let a broadcast tick land

  assert(
    'counts reflect 2 home + 1 away roots',
    state.latest?.counts.home === 2 && state.latest?.counts.away === 1,
    `counts=${JSON.stringify(state.latest?.counts)}`,
  );
  assert(
    'presence reflects 3 connected clients',
    state.latest?.presence === 3,
    `presence=${state.latest?.presence}`,
  );

  // ── cheer: A honest (within sustained rate), B floods (macro sim) ──
  log('cheer', 'A cheers honestly (1/batch, 6x over 2s); B floods (n=10 x 6, back to back)');
  for (let i = 0; i < 6; i++) {
    send(clientA, { type: 'cheer', matchId: MATCH_ID, side: 'home', n: 1, atMs: Date.now() });
    await sleep(333); // ~3/sec, matches the sustained refill rate
  }
  for (let i = 0; i < 6; i++) {
    send(clientB, { type: 'cheer', matchId: MATCH_ID, side: 'home', n: 10, atMs: Date.now() }); // clamped to CHEER_MAX_BATCH=10 client-side batch, then bucket-throttled
  }
  await sleep(500);

  const roarAfterCheer = state.latest?.roar.home ?? 0;
  assert(
    'roar.home rose above 0 after cheering',
    roarAfterCheer > 0,
    `roar.home=${roarAfterCheer.toFixed(2)}/s`,
  );
  assert(
    'roar.home stayed within a plausible clamp (bucket caps total granted tokens, not raw taps)',
    // A's 6 honest taps + B's flood, drained through two 8-capacity buckets
    // refilling at 3/s, cannot sustain anywhere near B's raw 60-tap flood.
    roarAfterCheer < 20,
    `roar.home=${roarAfterCheer.toFixed(2)}/s (raw taps sent: A=6, B=60 — clamp+bucket should crush B's flood)`,
  );
  assert('roar.away stayed at 0 (no away cheers sent)', (state.latest?.roar.away ?? -1) === 0, `roar.away=${state.latest?.roar.away}`);

  // ── decay: stop cheering, wait past the 3s window, expect roar -> 0 ──
  log('decay', 'stopping all cheers, waiting 3.5s for the rolling window to clear');
  await sleep(3_500);
  const roarAfterDecay = state.latest?.roar.home ?? -1;
  assert('roar.home decayed back to 0 after the 3s window', roarAfterDecay === 0, `roar.home=${roarAfterDecay}`);

  // ── react: throttle test — same kind twice fast should count once ──
  log('react', 'C reacts belief twice within 200ms (throttle should drop the second)');
  send(clientC, { type: 'react', matchId: MATCH_ID, side: 'away', kind: 'belief', atMs: Date.now() });
  await sleep(100);
  send(clientC, { type: 'react', matchId: MATCH_ID, side: 'away', kind: 'belief', atMs: Date.now() });
  await sleep(300);
  const pulseAway1 = state.latest?.pulse.away.belief ?? -1;
  assert('pulse.away.belief counted once despite two rapid taps', pulseAway1 === 1, `pulse.away.belief=${pulseAway1}`);

  log('react', 'C reacts belief again after 1.1s (should be accepted this time)');
  await sleep(1_100);
  send(clientC, { type: 'react', matchId: MATCH_ID, side: 'away', kind: 'belief', atMs: Date.now() });
  await sleep(300);
  const pulseAway2 = state.latest?.pulse.away.belief ?? -1;
  assert('pulse.away.belief incremented after throttle window passed', pulseAway2 === 2, `pulse.away.belief=${pulseAway2}`);

  // ── sample output ───────────────────────────────────────────────
  log('sample', `final StandsStateMsg: ${JSON.stringify(state.latest)}`);
  log('sample', `${state.history.length} broadcast ticks observed over the run`);

  clientA.close();
  clientB.close();
  clientC.close();

  const failed = assertions.filter((a) => !a.pass);
  console.log('\n──────────── SUMMARY ────────────');
  console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
  if (failed.length > 0) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.desc} (${f.detail})`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[test-client] fatal:', err);
  process.exitCode = 1;
});
