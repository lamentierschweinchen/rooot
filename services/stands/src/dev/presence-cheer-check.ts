/**
 * Dev-only verification script (NOT part of the service — never imported by
 * src/index.ts). Boots the REAL stands server in-process on an ephemeral
 * port and proves, over real WebSocket connections (the `ws` client):
 *
 *   (a) presence is a REFCOUNT, not a Set: two sockets adopting the SAME
 *       anonId — closing ONE must leave presence UNCHANGED; closing BOTH
 *       must drop it. (Post-mortem: a ground visit opens several sockets per
 *       fan — tabs/iframes — and closing just one of them used to erase the
 *       fan's presence entirely, which could stop stands broadcasts while
 *       the fan's other sockets were still open.)
 *   (b) a re-hello from the SAME socket with the SAME anonId must not
 *       inflate the refcount. Proven by the only observable that actually
 *       matters: hello, re-hello, then close that ONE socket and confirm
 *       presence fully drops. A double-counted refcount would leak — the
 *       single close would only bring it from 2 to 1, and presence would
 *       incorrectly stay "present" forever for a fan with zero open sockets.
 *   (c) an accepted cheer from fan A is fanned out to fan B as a discrete
 *       `cheerEcho` carrying the right side — the per-tap signal added
 *       because a single remote cheer was invisible in the smoothed roar.
 *   (d) (tonight-gate Fix 4) an odds tick driven into match A through the
 *       real broadcastToMatch dispatch path arrives at a client seated on A
 *       WITH matchId stamped === A, and a client seated on a DIFFERENT match
 *       B receives nothing at all — closing the gap where a client had no
 *       field to guard 'odds' by, unlike every other case in its switch.
 *
 * THE STANDS CARD substrate (write-only tonight — match-state.ts's FanStats;
 * no wire message carries it, so these scenarios read it via the `registry`
 * handle `createStandsServer()` returns, the same way (d) drives
 * broadcastToMatch directly):
 *   (e) fanStats.cheers accumulates the GRANTED total only (post-throttle),
 *       never the sent count, a zero-grant cheer adds nothing, and repeated
 *       grants ADD rather than overwrite.
 *   (f) fanStats.reacts counts DISTINCT drama moments (the momentReact accept
 *       path) — a re-pick within the SAME open moment adds nothing; a second,
 *       different moment adds one more.
 *   (g) fanStats.watchMs is presence-session time: a single connect→
 *       disconnect session accrues within tolerance of real elapsed time, and
 *       two OVERLAPPING sockets for the SAME anonId form exactly ONE
 *       continuous session (pinned to the FIRST connect, folded only at the
 *       LAST disconnect) — never double-counted, never reset to a later
 *       socket's connect time.
 *
 * Usage: tsx src/dev/presence-cheer-check.ts  (or: npm run check:presence-cheer)
 *
 * This file was written and first run against the PRE-FIX code (Set-based
 * presence, no cheerEcho) to capture a failing baseline for (a) — see
 * task-2-report.md for that RED output. It is committed in its GREEN,
 * post-fix form.
 */
import { WebSocket } from 'ws';
import { FEELING_PALETTES } from '@contracts/crowd';
import type { ClientMsg, ServerMsg } from '@contracts/crowd';
import type { FeedMsg } from '@contracts/feed';
import { CHEER_BUCKET_CAPACITY, CHEER_MAX_BATCH } from '../decay';
import type { MatchRegistry } from '../registry';

function log(tag: string, msg: string): void {
  console.log(`[presence-cheer-check:${tag}] ${msg}`);
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

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
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

function closeAndWait(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.once('close', () => resolve());
    ws.close();
  });
}

function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const poll = () => {
      if (predicate()) {
        resolve(true);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(poll, 40);
    };
    poll();
  });
}

/** Comfortably more than one STANDS_TICK_MS (250ms) broadcast period — after
 * this, any message already sent has been processed AND broadcast at least
 * once (Node is single-threaded; the message handler runs well inside this
 * window). Used instead of racing message timestamps against the tick timer. */
const SETTLE_MS = 320;
function settle(): Promise<void> {
  return sleep(SETTLE_MS);
}

type StandsMsg = Extract<ServerMsg, { type: 'stands' }>;

/** Tracks the latest `stands` tick seen for one matchId on one socket. */
function attachStandsObserver(ws: WebSocket, matchId: string): { latest: StandsMsg | null } {
  const state: { latest: StandsMsg | null } = { latest: null };
  ws.on('message', (raw) => {
    let m: ServerMsg;
    try {
      m = JSON.parse(raw.toString()) as ServerMsg;
    } catch {
      return;
    }
    if (m.type === 'stands' && m.matchId === matchId) state.latest = m;
  });
  return state;
}

/* ── (a) presence refcount survives one-of-several-sockets closing ───────── */
async function scenarioPresenceRefcount(url: string): Promise<void> {
  const matchId = `presence-check-${Date.now()}`;
  log('a', `matchId=${matchId}`);

  // O is BOTH the observer and a "keepalive" fan: it hello's its OWN anonId
  // so the match stays active (and keeps ticking) for the WHOLE scenario,
  // independent of whatever 'dup' below does. Without this, the match goes
  // idle the instant 'dup' fully disconnects and the server simply stops
  // ticking — there'd be no wire evidence at all that presence dropped.
  const o = await connect(url);
  const obs = attachStandsObserver(o, matchId);
  send(o, { type: 'hello', matchId, anonId: 'keepalive', side: 'home' });
  await settle();
  assert('baseline presence is 1 (keepalive only)', obs.latest?.presence === 1, `presence=${obs.latest?.presence}`);

  // Two SOCKETS, same anonId ('dup') — the ground-visit-with-several-tabs case.
  const s1 = await connect(url);
  const s2 = await connect(url);
  send(s1, { type: 'hello', matchId, anonId: 'dup', side: 'home' });
  send(s2, { type: 'hello', matchId, anonId: 'dup', side: 'home' });
  await settle();
  assert(
    'presence is 2 after both sockets adopt the same anonId (map size, not refcount sum)',
    obs.latest?.presence === 2,
    `presence=${obs.latest?.presence}`,
  );

  // Close ONE of the two — presence must be UNCHANGED. This is the post-mortem bug.
  await closeAndWait(s1);
  await settle();
  assert(
    'closing ONE of two sockets for the same anonId leaves presence UNCHANGED at 2',
    obs.latest?.presence === 2,
    `presence=${obs.latest?.presence}`,
  );

  // Close the SECOND — presence must now drop by exactly 1 (back to keepalive only).
  await closeAndWait(s2);
  await settle();
  assert(
    'closing the LAST socket for that anonId drops presence to 1',
    obs.latest?.presence === 1,
    `presence=${obs.latest?.presence}`,
  );

  await closeAndWait(o);
}

/* ── (b) re-hello, same socket + anonId, must not double-count ──────────── */
async function scenarioRehelloNoDoubleCount(url: string): Promise<void> {
  const matchId = `rehello-check-${Date.now()}`;
  log('b', `matchId=${matchId}`);

  const o = await connect(url);
  const obs = attachStandsObserver(o, matchId);
  send(o, { type: 'hello', matchId, anonId: 'keepalive2', side: 'away' });
  await settle();
  assert('baseline presence is 1 (keepalive2 only)', obs.latest?.presence === 1, `presence=${obs.latest?.presence}`);

  const s = await connect(url);
  send(s, { type: 'hello', matchId, anonId: 'solo', side: 'home' });
  await settle();
  assert('presence is 2 after the first hello', obs.latest?.presence === 2, `presence=${obs.latest?.presence}`);

  // RE-hello, same socket, SAME anonId (e.g., a side re-pick) — must not touch
  // the refcount a second time.
  send(s, { type: 'hello', matchId, anonId: 'solo', side: 'away' });
  await settle();
  assert(
    'presence is still 2 right after the re-hello (no visible inflation)',
    obs.latest?.presence === 2,
    `presence=${obs.latest?.presence}`,
  );

  // The real proof: close the ONE socket that hello'd TWICE. If the second
  // hello had incremented the refcount again (to 2 for 'solo'), this single
  // close would only bring it to 1 and presence would incorrectly STICK at 2
  // forever — a leaked "phantom" connection — instead of dropping to 1.
  await closeAndWait(s);
  await settle();
  assert(
    "closing the single re-hello'd socket fully drops it — presence back to 1",
    obs.latest?.presence === 1,
    `presence=${obs.latest?.presence}`,
  );

  await closeAndWait(o);
}

/* ── (c) an accepted cheer fans out as a discrete cheerEcho ─────────────── */
async function scenarioCheerEcho(url: string): Promise<void> {
  const matchId = `cheer-check-${Date.now()}`;
  log('c', `matchId=${matchId}`);

  const a = await connect(url);
  send(a, { type: 'hello', matchId, anonId: 'cheerer-a', side: 'away' });

  // B watches the match WITHOUT hello'ing (feed-only / spectator, URL-seated)
  // — the discrete cheer signal is a broadcast, like the roar, visible to
  // anyone watching, not gated on being rooted.
  const b = await connect(`${url}/?matchId=${encodeURIComponent(matchId)}`);
  const echoes: Array<{ side: string; atMs: number }> = [];
  b.on('message', (raw) => {
    let m: ServerMsg;
    try {
      m = JSON.parse(raw.toString()) as ServerMsg;
    } catch {
      return;
    }
    if (m.type === 'cheerEcho' && m.matchId === matchId) echoes.push({ side: m.side, atMs: m.atMs });
  });

  await sleep(200); // let A's hello and B's URL seating settle

  send(a, { type: 'cheer', matchId, side: 'away', n: 1, atMs: Date.now() });

  const gotEcho = await waitFor(() => echoes.length > 0, 2000);
  assert(
    "B receives a cheerEcho after A's accepted cheer",
    gotEcho,
    gotEcho ? `echoes=${JSON.stringify(echoes)}` : 'no cheerEcho arrived within 2000ms',
  );
  if (gotEcho) {
    assert('the cheerEcho carries the correct side (away)', echoes[0]?.side === 'away', `side=${echoes[0]?.side}`);
  }

  await closeAndWait(a);
  await closeAndWait(b);
}

/* ── (d) Fix 4 (design-lane wire probe): odds ticks carry matchId, so a
 * client watching a DIFFERENT match never has anything to guard against —
 * screenshot evidence showed market ticks briefly rendering under the
 * PREVIOUS fixture's labels during a transition. Drives the tick through
 * broadcastToMatch directly — the SAME dispatch index.ts's routeFeedMsg uses
 * for every real TXLINE/replay message (mirrors verdict-replay-check.ts's
 * established convention for "the real feed dispatch path"). ───────────── */
async function scenarioOddsMatchIdGuard(url: string, broadcastToMatch: (matchId: string, msg: ServerMsg | FeedMsg) => void): Promise<void> {
  const matchA = `odds-guard-a-${Date.now()}`;
  const matchB = `odds-guard-b-${Date.now()}`;
  log('d', `matchA=${matchA} matchB=${matchB}`);

  // feed-only sockets, URL-seated into two DIFFERENT match rooms — no hello
  // needed; broadcastToMatch already scopes delivery by state.matchId
  // server-side (this proves the STAMP, not the room-scoping, which already
  // existed before Fix 4).
  const a = await connect(`${url}/?matchId=${encodeURIComponent(matchA)}`);
  const b = await connect(`${url}/?matchId=${encodeURIComponent(matchB)}`);
  const seenA: Array<{ type: string; matchId?: string }> = [];
  const seenB: Array<{ type: string; matchId?: string }> = [];
  a.on('message', (raw) => {
    try {
      const m = JSON.parse(raw.toString());
      if (m.type === 'odds') seenA.push(m);
    } catch {
      /* ignore */
    }
  });
  b.on('message', (raw) => {
    try {
      const m = JSON.parse(raw.toString());
      if (m.type === 'odds') seenB.push(m);
    } catch {
      /* ignore */
    }
  });

  await sleep(150); // let both URL-seatings settle

  broadcastToMatch(matchA, {
    type: 'odds',
    tick: { tMs: Date.now(), minute: 10, pHome: 0.5, pDraw: 0.3, pAway: 0.2, source: 'replay' },
  });

  const gotA = await waitFor(() => seenA.length > 0, 1500);
  assert('client A (seated on match A) receives the odds tick, stamped with matchId === A', gotA && seenA[0]?.matchId === matchA, `seenA=${JSON.stringify(seenA)}`);
  await sleep(300); // give a stray cross-room delivery a real chance to arrive before declaring B clean
  assert("client B (seated on a DIFFERENT match) receives NOTHING from A's odds tick", seenB.length === 0, `seenB=${JSON.stringify(seenB)}`);

  await closeAndWait(a);
  await closeAndWait(b);
}

/* ── (e) THE STANDS CARD: fanStats.cheers accumulates the GRANTED total only
 * ──────────────────────────────────────────────────────────────────────── */
async function scenarioFanStatsCheers(url: string, registry: MatchRegistry): Promise<void> {
  const matchId = `fanstats-cheers-check-${Date.now()}`;
  const anonId = 'fanstats-cheer-fan';
  log('e', `matchId=${matchId}`);

  const fan = await connect(url);
  send(fan, { type: 'hello', matchId, anonId, side: 'home' });
  await settle();

  const match = registry.get(matchId);
  if (!match) throw new Error('fanstats-cheers: match not found after hello');

  const fsAfterHello = match.fanStatsFor(anonId);
  assert(
    'hello alone creates a fanStats row (0 cheers, firstSeenMs stamped)',
    fsAfterHello?.cheers === 0 && (fsAfterHello?.firstSeenMs ?? 0) > 0,
    `fanStats=${JSON.stringify(fsAfterHello)}`,
  );

  // burst #1: a single n=CHEER_MAX_BATCH(10) message on a FRESH per-anonId
  // TokenBucket (capacity 8, decay.ts) is granted EXACTLY 8, deterministically
  // — the bucket is created + drawn from synchronously inside one handleCheer
  // call, so there is no real-clock refill window for jitter to move this.
  send(fan, { type: 'cheer', matchId, side: 'home', n: CHEER_MAX_BATCH, atMs: Date.now() });
  await settle();
  let fs = match.fanStatsFor(anonId);
  assert(
    `a ${CHEER_MAX_BATCH}-cheer burst on a fresh bucket accumulates only the GRANTED ${CHEER_BUCKET_CAPACITY}, not the sent ${CHEER_MAX_BATCH}`,
    fs?.cheers === CHEER_BUCKET_CAPACITY,
    `fanStats=${JSON.stringify(fs)}`,
  );

  // burst #2: fired immediately after (bucket now ~empty) — grants 0. A
  // zero-grant cheer must accumulate NOTHING.
  send(fan, { type: 'cheer', matchId, side: 'home', n: 5, atMs: Date.now() });
  await settle();
  fs = match.fanStatsFor(anonId);
  assert(
    'an immediate follow-up cheer against an exhausted bucket grants 0 and accumulates nothing (cheers unchanged)',
    fs?.cheers === CHEER_BUCKET_CAPACITY,
    `fanStats=${JSON.stringify(fs)}`,
  );

  // wait for ~1 token of refill (3/s → ~333ms/token; 450ms comfortably lands
  // in the [1,2)-token window) then cheer n=1 — grants exactly 1, proving
  // cheers ACCUMULATES across calls rather than being overwritten.
  await sleep(450);
  send(fan, { type: 'cheer', matchId, side: 'home', n: 1, atMs: Date.now() });
  await settle();
  fs = match.fanStatsFor(anonId);
  assert(
    `a subsequent granted cheer ADDS to the running total (${CHEER_BUCKET_CAPACITY} + 1 = ${CHEER_BUCKET_CAPACITY + 1}), not overwrites it`,
    fs?.cheers === CHEER_BUCKET_CAPACITY + 1,
    `fanStats=${JSON.stringify(fs)}`,
  );
  assert(
    'lastSeenMs advanced across the scenario (tracks real activity, not a stamp-once)',
    !!fs && !!fsAfterHello && fs.lastSeenMs - fsAfterHello.lastSeenMs >= 400,
    `firstLastSeen=${fsAfterHello?.lastSeenMs} finalLastSeen=${fs?.lastSeenMs}`,
  );

  await closeAndWait(fan);
}

/* ── (f) THE STANDS CARD: fanStats.reacts counts DISTINCT drama moments only
 * ──────────────────────────────────────────────────────────────────────── */
async function scenarioFanStatsReacts(url: string, registry: MatchRegistry): Promise<void> {
  const matchId = `fanstats-reacts-check-${Date.now()}`;
  const anonId = 'fanstats-react-fan';
  log('f', `matchId=${matchId}`);

  const fan = await connect(url);
  send(fan, { type: 'hello', matchId, anonId, side: 'home' });
  await settle();

  // opens the moment directly via the real beginMoment/endMoment methods —
  // the same functions server.ts's momentLifecycle calls off a real feed
  // event (mirrors scenario (d)'s precedent of driving real dispatch logic
  // directly rather than fabricating a full feed simulation). The react
  // itself still goes through the REAL WS momentReact message → server.ts's
  // handleMomentReact → match.momentReact — the actual accept path
  // fanStats.reacts hooks into.
  const match = registry.getOrCreate(matchId);
  const momentA = `${matchId}:goal:1`;
  const paletteA = match.beginMoment(momentA, 'goal', 'home', 10, Date.now());
  if (!paletteA) throw new Error('fanstats-reacts: failed to open moment A');

  send(fan, { type: 'momentReact', matchId, anonId, momentId: momentA, side: 'home', token: paletteA[0]!, atMs: Date.now() });
  await settle();
  let fs = match.fanStatsFor(anonId);
  assert('reacting to a moment for the first time counts as 1 distinct react', fs?.reacts === 1, `fanStats=${JSON.stringify(fs)}`);

  // re-pick within the SAME open moment — a different token, same momentId.
  send(fan, { type: 'momentReact', matchId, anonId, momentId: momentA, side: 'home', token: paletteA[1]!, atMs: Date.now() });
  await settle();
  fs = match.fanStatsFor(anonId);
  assert('a re-pick/replacement within the SAME open moment adds nothing (reacts stays 1)', fs?.reacts === 1, `fanStats=${JSON.stringify(fs)}`);

  match.endMoment(momentA, Date.now());

  const momentB = `${matchId}:var:1`;
  const paletteB = match.beginMoment(momentB, 'var', null, 11, Date.now());
  if (!paletteB) throw new Error('fanstats-reacts: failed to open moment B');

  send(fan, { type: 'momentReact', matchId, anonId, momentId: momentB, side: 'home', token: paletteB[0]!, atMs: Date.now() });
  await settle();
  fs = match.fanStatsFor(anonId);
  assert('reacting to a SECOND, different moment adds one more distinct react (2)', fs?.reacts === 2, `fanStats=${JSON.stringify(fs)}`);

  match.endMoment(momentB, Date.now());
  await closeAndWait(fan);
}

/* ── (g) THE STANDS CARD: fanStats.watchMs is presence-session time; two
 * overlapping sockets for the same anonId form exactly ONE session ────────
 * ──────────────────────────────────────────────────────────────────────── */
async function scenarioFanStatsWatchMs(url: string, registry: MatchRegistry): Promise<void> {
  // ── single socket: connect → hold ~1.5s → disconnect → watchMs folds ──
  const matchIdSingle = `fanstats-watchms-single-${Date.now()}`;
  const anonIdSingle = 'fanstats-watch-single';
  log('g', `matchIdSingle=${matchIdSingle}`);
  const matchSingle = registry.getOrCreate(matchIdSingle);

  const fan = await connect(url);
  const singleStart = Date.now();
  send(fan, { type: 'hello', matchId: matchIdSingle, anonId: anonIdSingle, side: 'home' });
  await sleep(1500);
  await closeAndWait(fan);
  await settle();
  const singleElapsed = Date.now() - singleStart;
  const fsSingle = matchSingle.fanStatsFor(anonIdSingle);
  assert(
    `a single connect→disconnect session (held ~1500ms) accrues watchMs within tolerance of the real elapsed time (measured ${singleElapsed}ms)`,
    !!fsSingle && fsSingle.watchMs > 1300 && fsSingle.watchMs <= singleElapsed + 150,
    `watchMs=${fsSingle?.watchMs} elapsed=${singleElapsed}`,
  );

  // ── overlapping sockets, SAME anonId: ONE continuous session, no double-count ──
  const matchIdOverlap = `fanstats-watchms-overlap-${Date.now()}`;
  const anonIdOverlap = 'fanstats-watch-overlap';
  log('g', `matchIdOverlap=${matchIdOverlap}`);
  const matchOverlap = registry.getOrCreate(matchIdOverlap);

  const s1 = await connect(url);
  const overlapStart = Date.now();
  send(s1, { type: 'hello', matchId: matchIdOverlap, anonId: anonIdOverlap, side: 'home' });
  // s1 holds the session ALONE for a full 800ms before s2 ever joins — a
  // buggy "session restarts on every connect" would lose this whole leg,
  // clearly separating a correct total from a buggy one below.
  await sleep(800);

  const s2 = await connect(url);
  send(s2, { type: 'hello', matchId: matchIdOverlap, anonId: anonIdOverlap, side: 'home' });
  await settle();

  await sleep(300); // both sockets open together
  await closeAndWait(s1); // ONE of two closes — must NOT fold (s2 still open)
  await settle();
  const fsMidOverlap = matchOverlap.fanStatsFor(anonIdOverlap);
  assert(
    'closing ONE of two overlapping sockets for the same anonId does NOT fold the session yet (watchMs still 0 — the other socket keeps it open)',
    fsMidOverlap?.watchMs === 0,
    `watchMs=${fsMidOverlap?.watchMs}`,
  );

  await sleep(300);
  await closeAndWait(s2); // the LAST socket closes — now it folds
  await settle();
  const overlapElapsed = Date.now() - overlapStart;
  const fsOverlap = matchOverlap.fanStatsFor(anonIdOverlap);
  assert(
    `two overlapping sockets for the SAME anonId form exactly ONE session pinned to the FIRST connect — watchMs (${fsOverlap?.watchMs}ms) tracks the full ~${overlapElapsed}ms window, not reset to the second socket's later connect and not double-counted`,
    !!fsOverlap && fsOverlap.watchMs > overlapElapsed * 0.75 && fsOverlap.watchMs <= overlapElapsed + 150,
    `watchMs=${fsOverlap?.watchMs} elapsed=${overlapElapsed}`,
  );
}

async function main(): Promise<void> {
  // Set BEFORE importing ../server (transitively ./registry -> ./snapshot,
  // which captures this env var into a module-level constant at import time)
  // so this check never reads/writes a real local snapshot file — a dynamic
  // import is required here since static imports are hoisted ahead of any
  // other top-level code in the module, including this assignment.
  process.env.STANDS_SNAPSHOT_PATH ||= '/tmp/rooot-presence-cheer-check-snapshot.json';
  const { createStandsServer } = await import('../server');

  const { httpServer, registry, broadcastToMatch } = createStandsServer();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const addr = httpServer.address();
  if (addr === null || typeof addr === 'string') throw new Error('failed to bind an ephemeral port');
  const url = `ws://127.0.0.1:${addr.port}`;
  log('setup', `stands server up on ephemeral port ${addr.port}`);

  try {
    await scenarioPresenceRefcount(url);
    await scenarioRehelloNoDoubleCount(url);
    await scenarioCheerEcho(url);
    await scenarioOddsMatchIdGuard(url, broadcastToMatch);
    await scenarioFanStatsCheers(url, registry);
    await scenarioFanStatsReacts(url, registry);
    await scenarioFanStatsWatchMs(url, registry);
  } finally {
    registry.stop();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }

  console.log('\n──────────── SUMMARY ────────────');
  const failed = assertions.filter((x) => !x.pass);
  console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
  if (failed.length > 0) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.desc} (${f.detail})`);
    process.exitCode = 1;
  }
}

// the fanStats watchMs scenario (g) alone holds real sockets open for several
// real seconds (a single ~1.5s session + an ~1.7s overlapping-session pair) on
// top of the pre-existing scenarios' settle()s — 20s was comfortable before,
// 45s keeps the same safety margin now.
const watchdog = setTimeout(() => {
  console.error('[presence-cheer-check] watchdog: hung for 45s, forcing exit');
  process.exit(1);
}, 45_000);

main()
  .then(() => {
    clearTimeout(watchdog);
    process.exit(process.exitCode ?? 0);
  })
  .catch((err) => {
    clearTimeout(watchdog);
    console.error('[presence-cheer-check] fatal:', err);
    process.exit(1);
  });
