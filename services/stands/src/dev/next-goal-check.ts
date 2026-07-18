/**
 * NEXT GOAL (in-game) dev check (tonight-gate) — docs/BACKLOG-full-version-
 * and-deferred-ideas.md §2. Proves the mechanism end-to-end with a REAL
 * server and real ws clients (same discipline as verdict-replay-check.ts /
 * restart-persistence-check.ts). One in-process server (booted once, shared
 * — matchIds are disjoint per scenario) runs scenarios 1-4; scenario 5 is a
 * real child-process boot/kill/reboot.
 *
 * 1. scenarioLiveFlow (driving broadcastToMatch directly — the SAME function
 *    TXLINE/REPLAY ingest calls for every live message):
 *    - a call sent before kickoff (phase PRE) is rejected — silently dropped.
 *    - call-replace semantics: a fan's second call REPLACES the first.
 *    - state broadcasts carry an honest n (=== home+away+none) + market stamp.
 *    - an UNCONFIRMED goal emission resolves NOTHING (review Critical 1);
 *      the confirmed:true emission of the same id then resolves every open
 *      call with personal verdicts carrying the market stamped at CALL time,
 *      and the book empties (n:0).
 *    - re-emitting the SAME confirmed goal id doesn't double-resolve.
 *    - FULL_TIME resolves 'none' correct / side calls wrong; a re-delivered
 *      FULL_TIME doesn't double-resolve.
 *    - fanStats.nextGoalCalls/nextGoalCorrect accumulate at RESOLUTION only.
 *
 * 2. scenarioRealCaptureConfirmGate (review Critical 1's required evidence,
 *    using the REAL premiere capture's envelopes VERBATIM —
 *    captures/premiere-fra-mar-18209181-919c9af.json): goal 18209181:495
 *    emitted confirmed:false ONCE, was never confirmed, and the final score
 *    (FRA 2-0 MAR) excludes it — a disallowed goal. Driving it through the
 *    real dispatch resolves NOTHING (before the fix it would have graded the
 *    fan's 'away' call CORRECT against a goal that never happened). Goal
 *    18209181:683's real unconfirmed→confirmed pair (~105s lag) resolves
 *    exactly once, ON the confirmation; its second confirmed re-emission
 *    resolves nothing further. White-box: the persisted nextGoalResolvedIds
 *    carries :683 and NOT :495; the record row (nextGoalRows) carries
 *    confirmedGoalId :683.
 *
 * 3. scenarioSentimentRecordRows (review Important 3): a real-fixture match
 *    (18175918, in teams.ts, so the accumulator exists) driven FH → odds →
 *    calls → confirmed goal → new call → score → FULL_TIME through the real
 *    dispatch. The crystallized SentimentRecord on disk carries nextGoal
 *    rows for BOTH cycles — including the FULL_TIME cycle, which proves
 *    nextGoalLifecycle runs BEFORE predictLifecycle's crystallize in
 *    broadcastToMatch (ordered wrong, the record would lose its last cycle).
 *    Devnet-safe: RELAYER_KEYPAIR stripped + RELAYER_KEYPAIR_FILE pointed at
 *    a nonexistent path BEFORE the server module loads, so anchorRecordHash
 *    always resolves null without ever attempting a transaction (the same
 *    guarantee restart-persistence-check.ts's anchor-guard scenario relies
 *    on, made explicit here because THIS scenario crystallizes in-process).
 *
 * 4. scenarioInPlayPenalty (re-review Critical — converted in-play penalties
 *    ARE the next goal): the REAL PAR–FRA envelopes (apps/web/public/replay/
 *    par-fra-20260704.jsonl, committed) driven through the REAL parser
 *    (contracts/normalize.ts parseLedgerMessage — the same one live/replay
 *    ingest use). France's only goal that day exists EXCLUSIVELY as three
 *    penalty_outcome envelopes (Id 609, Confirmed false→true→true, Outcome
 *    "Scored"; zero Action:'goal' envelopes in the whole file) → ledger kind
 *    'penalty-kick'. The unconfirmed emission resolves nothing; the
 *    confirmed Scored emission resolves the book exactly once, correct side;
 *    the second confirmed re-emission dedupes. A confirmed MISSED in-play
 *    penalty resolves nothing. A shootout-phase (PENALTIES) confirmed Scored
 *    kick resolves NOTHING — and the surviving open call still resolves
 *    'none'-semantics at FULL_TIME (today's shootout behavior, unregressed).
 *    White-box: the dedup Set carries only the real pen id + the FT id (the
 *    missed and shootout kicks never consume a cycle); the record rows match.
 *
 * 5. scenarioRestart (REAL child processes, zero shared memory): cycle 1
 *    resolves via a real REPLAY_FILE confirmed goal; cycle 2 opens and is
 *    left OPEN — SIGKILLed mid-cycle. boot2 = fresh child, SAME dataDir,
 *    SAME replay file — the exact re-dispatch mechanism of review Critical 2
 *    (TxLINE's seedSnapshot replays the full historical action list on every
 *    ingest boot; REPLAY mode always plays from line 0): the re-delivered,
 *    already-resolved goal must NOT re-resolve against the restored cycle-2
 *    call (nextGoalResolvedIds persisted + pre-armed before ingest), the
 *    join replay shows the restored open call, re-hello replays cycle 1's
 *    verdict exactly once, and fanStats counters + the record row survive on
 *    disk unchanged.
 *
 * Usage: tsx src/dev/next-goal-check.ts (or: npm run check:next-goal)
 */
import { type ChildProcessByStdio, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import type { ClientMsg, NextGoalStateMsg, NextGoalVerdictMsg, ServerMsg } from '@contracts/crowd';
import type { FeedMsg } from '@contracts/feed';
import type { LedgerMsg } from '@contracts/ledger';
import { parseLedgerMessage } from '@contracts/normalize';
import type { SentimentRecord } from '@contracts/sentiment';

function log(tag: string, msg: string): void {
  console.log(`[next-goal-check:${tag}] ${msg}`);
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function waitFor(cond: () => boolean, timeoutMs: number, stepMs = 50): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (cond()) { resolve(true); return; }
      if (Date.now() - start >= timeoutMs) { resolve(false); return; }
      setTimeout(tick, stepMs);
    };
    tick();
  });
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
function closeAndWait(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
    ws.once('close', () => resolve());
    ws.close();
  });
}

/** Captures every nextGoalState broadcast for the match + every nextGoalVerdict
 * personally addressed to `anonId` seen on this one socket. */
function attachNextGoalCapture(ws: WebSocket, matchId: string, anonId: string): { states: NextGoalStateMsg[]; verdicts: NextGoalVerdictMsg[] } {
  const captured = { states: [] as NextGoalStateMsg[], verdicts: [] as NextGoalVerdictMsg[] };
  ws.on('message', (raw) => {
    let m: ServerMsg;
    try {
      m = JSON.parse(raw.toString()) as ServerMsg;
    } catch {
      return;
    }
    if (m.type === 'nextGoalState' && m.matchId === matchId) captured.states.push(m);
    if (m.type === 'nextGoalVerdict' && m.matchId === matchId && m.anonId === anonId) captured.verdicts.push(m);
  });
  return captured;
}

/* ── on-disk snapshot reader (write-only substrates: fanStats, the dedup Set,
 * the record rows — no wire message carries them; reading the real persisted
 * file is the same honest approach restart-persistence-check.ts uses) ────── */
interface SnapshotFileOnDisk {
  savedAtMs: number;
  matches: Array<{
    matchId: string;
    fanStats?: Array<[string, { nextGoalCalls?: number; nextGoalCorrect?: number }]>;
    nextGoalOpen?: Array<[string, { call: string }]>;
    nextGoalResolvedIds?: string[];
    nextGoalRows?: NonNullable<SentimentRecord['nextGoal']>;
  }>;
}
function readSnapshotFileAt(dataDir: string): SnapshotFileOnDisk | null {
  const p = path.join(dataDir, 'rooot-stands-snapshot.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as SnapshotFileOnDisk;
  } catch {
    return null; // mid-rename read — treat as not-yet-readable
  }
}
function snapshotMatchOn(dataDir: string, matchId: string) {
  return readSnapshotFileAt(dataDir)?.matches.find((m) => m.matchId === matchId);
}

/* ═════════════════ the shared in-process server (scenarios 1-3) ══════════ */
interface InProcessCtx {
  url: string;
  dataDir: string;
  registry: { get(matchId: string): { nextGoalOpenCount(): number; fanStatsFor(anonId: string): { nextGoalCalls: number; nextGoalCorrect: number } | undefined } | undefined; snapshotNow(): void; stop(): void };
  broadcastToMatch: (matchId: string, msg: ServerMsg | FeedMsg) => void;
  httpServer: { close(cb: () => void): void; closeAllConnections?: () => void; listen(port: number, host: string, cb: () => void): void; address(): unknown };
}

async function bootInProcess(): Promise<InProcessCtx> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-nextgoal-inproc-'));
  // Set BEFORE the dynamic import — module-level constants in snapshot.ts AND
  // relay.ts read these at import time (verdict-replay-check.ts's pattern).
  process.env.STANDS_DATA_DIR = dataDir;
  process.env.STANDS_SNAPSHOT_INTERVAL_MS = '20000'; // far longer than these scenarios' runtime — every on-disk assert is attributable to an explicit snapshotNow()/post-FT write
  // Devnet isolation for scenario 3's IN-PROCESS crystallize (relay.ts loads
  // the keypair from RELAYER_KEYPAIR env or RELAYER_KEYPAIR_FILE, default
  // ../../.secrets/... — absent in this worktree, but strip explicitly so an
  // ambient env var can never make anchorRecordHash attempt a real tx).
  delete process.env.RELAYER_KEYPAIR;
  process.env.RELAYER_KEYPAIR_FILE = '/nonexistent/never-a-keypair.json';
  const { createStandsServer } = await import('../server');
  const { httpServer, registry, broadcastToMatch } = createStandsServer();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const addr = httpServer.address();
  if (addr === null || typeof addr === 'string') throw new Error('failed to bind an ephemeral port');
  const url = `ws://127.0.0.1:${addr.port}`;
  log('boot', `in-process stands server up on ephemeral port ${addr.port} (dataDir=${dataDir})`);
  return { url, dataDir, registry: registry as unknown as InProcessCtx['registry'], broadcastToMatch, httpServer: httpServer as unknown as InProcessCtx['httpServer'] };
}

/* ═══════════════════════ scenario 1 — live flow ═════════════════════════ */
async function scenarioLiveFlow(ctx: InProcessCtx): Promise<void> {
  const { url, registry, broadcastToMatch } = ctx;
  const MATCH_ID = `nextgoal-live-${Date.now()}`;
  log('live', `matchId=${MATCH_ID}`);

  const fanA = await connect(url); // rooted home; calls home then replaces with away
  const fanB = await connect(url); // rooted away; calls none
  const fanC = await connect(url); // rooted home; calls home, never replaces
  const capA = attachNextGoalCapture(fanA, MATCH_ID, 'ng-fan-a');
  const capB = attachNextGoalCapture(fanB, MATCH_ID, 'ng-fan-b');
  const capC = attachNextGoalCapture(fanC, MATCH_ID, 'ng-fan-c');
  send(fanA, { type: 'hello', matchId: MATCH_ID, anonId: 'ng-fan-a', side: 'home' });
  send(fanB, { type: 'hello', matchId: MATCH_ID, anonId: 'ng-fan-b', side: 'away' });
  send(fanC, { type: 'hello', matchId: MATCH_ID, anonId: 'ng-fan-c', side: 'home' });
  await sleep(150);

  /* ── pre-kickoff rejection ── */
  broadcastToMatch(MATCH_ID, { type: 'status', ev: { tMs: Date.now(), phase: 'PRE', minute: null, source: 'replay' } });
  await sleep(50);
  send(fanA, { type: 'nextGoalCall', matchId: MATCH_ID, anonId: 'ng-fan-a', call: 'home', atMs: Date.now() });
  await sleep(150);
  assert(
    'a call sent before kickoff (phase PRE) is rejected — no state broadcast, nothing open',
    capA.states.length === 0 && (registry.get(MATCH_ID)?.nextGoalOpenCount() ?? -1) === 0,
    `states=${capA.states.length} openCount=${registry.get(MATCH_ID)?.nextGoalOpenCount()}`,
  );

  /* ── enter live play + establish the market ── */
  broadcastToMatch(MATCH_ID, { type: 'status', ev: { tMs: Date.now(), phase: 'FIRST_HALF', minute: 0, source: 'replay' } });
  broadcastToMatch(MATCH_ID, { type: 'odds', tick: { tMs: Date.now(), minute: 1, pHome: 0.5, pDraw: 0.25, pAway: 0.25, source: 'replay' } });
  await sleep(100);

  /* ── call-replace semantics ── */
  send(fanA, { type: 'nextGoalCall', matchId: MATCH_ID, anonId: 'ng-fan-a', call: 'home', atMs: Date.now() });
  await sleep(80);
  send(fanA, { type: 'nextGoalCall', matchId: MATCH_ID, anonId: 'ng-fan-a', call: 'away', atMs: Date.now() }); // REPLACES the open 'home' call
  await sleep(80);
  send(fanB, { type: 'nextGoalCall', matchId: MATCH_ID, anonId: 'ng-fan-b', call: 'none', atMs: Date.now() });
  await sleep(80);
  send(fanC, { type: 'nextGoalCall', matchId: MATCH_ID, anonId: 'ng-fan-c', call: 'home', atMs: Date.now() });
  await sleep(150);

  const afterCallsState = capC.states[capC.states.length - 1];
  assert(
    "call-replace: fan A's SECOND call (away) replaced the first (home) — open tally is home:1 (fan C), away:1 (fan A), none:1 (fan B), n:3",
    afterCallsState?.open.n === 3 && afterCallsState?.open.home === 1 && afterCallsState?.open.away === 1 && afterCallsState?.open.none === 1,
    `afterCallsState=${JSON.stringify(afterCallsState)}`,
  );
  assert(
    'market stamps are present on state broadcasts once an odds tick exists',
    capC.states.some((s) => s.marketAtTs !== null) && afterCallsState?.marketAtTs?.home === 0.5,
    `states=${JSON.stringify(capC.states.map((s) => s.marketAtTs))}`,
  );

  /* ── review Critical 1: an UNCONFIRMED goal resolves NOTHING ── */
  broadcastToMatch(MATCH_ID, {
    type: 'ledger',
    msg: { type: 'event', ev: { id: 'ng-goal-1', kind: 'goal', side: 'home', minute: 10, tMs: Date.now(), major: true, headline: 'Goal (provisional)', score: { home: 1, away: 0 }, confirmed: false } },
  });
  await sleep(150);
  assert(
    'an UNCONFIRMED goal emission (confirmed:false) resolves NOTHING — no verdicts, book intact at n:3',
    capA.verdicts.length === 0 && capB.verdicts.length === 0 && capC.verdicts.length === 0 && (registry.get(MATCH_ID)?.nextGoalOpenCount() ?? -1) === 3,
    `verdicts=[${capA.verdicts.length},${capB.verdicts.length},${capC.verdicts.length}] openCount=${registry.get(MATCH_ID)?.nextGoalOpenCount()}`,
  );

  /* ── the same goal CONFIRMS (same ev.id) → resolves the book ── */
  broadcastToMatch(MATCH_ID, {
    type: 'ledger',
    msg: { type: 'event', ev: { id: 'ng-goal-1', kind: 'goal', side: 'home', minute: 10, tMs: Date.now(), major: true, headline: 'Goal — Home', score: { home: 1, away: 0 }, confirmed: true } },
  });
  await sleep(200);

  assert(
    "the CONFIRMED emission of the same id resolves: fan A (last called 'away') gets a WRONG verdict — home scored",
    capA.verdicts.length === 1 && capA.verdicts[0]?.outcome === 'wrong' && capA.verdicts[0]?.call === 'away' && capA.verdicts[0]?.happened === 'home',
    `capA.verdicts=${JSON.stringify(capA.verdicts)}`,
  );
  assert(
    "fan B (called 'none') gets a WRONG verdict — a goal WAS scored",
    capB.verdicts.length === 1 && capB.verdicts[0]?.outcome === 'wrong' && capB.verdicts[0]?.call === 'none' && capB.verdicts[0]?.happened === 'home',
    `capB.verdicts=${JSON.stringify(capB.verdicts)}`,
  );
  assert(
    "fan C (called 'home') gets a CORRECT verdict — home scored",
    capC.verdicts.length === 1 && capC.verdicts[0]?.outcome === 'correct' && capC.verdicts[0]?.call === 'home' && capC.verdicts[0]?.happened === 'home',
    `capC.verdicts=${JSON.stringify(capC.verdicts)}`,
  );
  assert(
    'every verdict carries the market stamped at CALL time (non-null once odds exist)',
    capA.verdicts[0]?.marketAtCall?.home === 0.5 && capB.verdicts[0]?.marketAtCall?.home === 0.5 && capC.verdicts[0]?.marketAtCall?.home === 0.5,
    `marketAtCall=${JSON.stringify([capA.verdicts[0]?.marketAtCall, capB.verdicts[0]?.marketAtCall, capC.verdicts[0]?.marketAtCall])}`,
  );

  const postGoalState = capC.states[capC.states.length - 1];
  assert('the book is empty (n:0) immediately after resolution — a fresh cycle begins', postGoalState?.open.n === 0, `postGoalState=${JSON.stringify(postGoalState)}`);

  /* ── re-emission of the SAME confirmed goal id doesn't double-resolve ── */
  send(fanA, { type: 'nextGoalCall', matchId: MATCH_ID, anonId: 'ng-fan-a', call: 'away', atMs: Date.now() }); // a fresh cycle-2 call
  await sleep(100);
  broadcastToMatch(MATCH_ID, {
    type: 'ledger',
    msg: { type: 'event', ev: { id: 'ng-goal-1', kind: 'goal', side: 'home', minute: 10, tMs: Date.now(), major: true, headline: 'Goal — Home (re-emission)', score: { home: 1, away: 0 }, confirmed: true } },
  });
  await sleep(150);
  assert("re-emitting the SAME confirmed goal id (ev.id 'ng-goal-1') does not resolve fan A's fresh cycle-2 call again", capA.verdicts.length === 1, `capA.verdicts=${JSON.stringify(capA.verdicts)}`);
  assert('the cycle-2 open call survives the re-emission untouched', (registry.get(MATCH_ID)?.nextGoalOpenCount() ?? -1) === 1, `openCount=${registry.get(MATCH_ID)?.nextGoalOpenCount()}`);

  /* ── 'none' resolves correct at FT; side calls resolve wrong ── */
  send(fanB, { type: 'nextGoalCall', matchId: MATCH_ID, anonId: 'ng-fan-b', call: 'none', atMs: Date.now() });
  await sleep(100);
  broadcastToMatch(MATCH_ID, { type: 'status', ev: { tMs: Date.now(), phase: 'FULL_TIME', minute: 90, source: 'replay' } });
  await sleep(200);

  assert(
    "fan A (called 'away', no further goal before FT) gets WRONG at FULL_TIME",
    capA.verdicts.length === 2 && capA.verdicts[1]?.outcome === 'wrong' && capA.verdicts[1]?.happened === 'none',
    `capA.verdicts=${JSON.stringify(capA.verdicts)}`,
  );
  assert(
    "fan B (called 'none') gets CORRECT at FULL_TIME — no more goals",
    capB.verdicts.length === 2 && capB.verdicts[1]?.outcome === 'correct' && capB.verdicts[1]?.happened === 'none',
    `capB.verdicts=${JSON.stringify(capB.verdicts)}`,
  );

  // a re-delivered FULL_TIME must not double-resolve either.
  broadcastToMatch(MATCH_ID, { type: 'status', ev: { tMs: Date.now(), phase: 'FULL_TIME', minute: 90, source: 'replay' } });
  await sleep(150);
  assert('a re-delivered FULL_TIME produces no extra verdicts', capA.verdicts.length === 2 && capB.verdicts.length === 2, `capA=${capA.verdicts.length} capB=${capB.verdicts.length}`);

  assert(
    'every nextGoalState broadcast across the whole run carries an honest n === home+away+none',
    capC.states.length > 0 && capC.states.every((s) => s.open.n === s.open.home + s.open.away + s.open.none),
    `n check over ${capC.states.length} broadcasts`,
  );

  /* ── fanStats counters accumulate at RESOLUTION, never at call time ── */
  const fsA = registry.get(MATCH_ID)?.fanStatsFor('ng-fan-a');
  const fsB = registry.get(MATCH_ID)?.fanStatsFor('ng-fan-b');
  const fsC = registry.get(MATCH_ID)?.fanStatsFor('ng-fan-c');
  assert(
    "fan A: 2 resolved calls (cycle 1's home→away replace counts ONCE; cycle 2 counts again), 0 correct",
    fsA?.nextGoalCalls === 2 && fsA?.nextGoalCorrect === 0,
    `fsA=${JSON.stringify(fsA)}`,
  );
  assert(
    "fan B: 2 resolved calls ('none' wrong at the goal, 'none' correct at FT), 1 correct",
    fsB?.nextGoalCalls === 2 && fsB?.nextGoalCorrect === 1,
    `fsB=${JSON.stringify(fsB)}`,
  );
  assert("fan C: 1 resolved call ('home', correct) — never called again", fsC?.nextGoalCalls === 1 && fsC?.nextGoalCorrect === 1, `fsC=${JSON.stringify(fsC)}`);

  await closeAndWait(fanA);
  await closeAndWait(fanB);
  await closeAndWait(fanC);
}

/* ═════ scenario 2 — the REAL capture's disallowed + confirmed goals ══════ */
const CAPTURE_PATH = new URL('../../captures/premiere-fra-mar-18209181-919c9af.json', import.meta.url);
const CAPTURE_MATCH = '18209181';
const DISALLOWED_GOAL_ID = '18209181:495'; // min 48, away — confirmed:false once, never confirmed, excluded from the final score
const LEGIT_GOAL_ID = '18209181:683'; // min 59, home — real unconfirmed→confirmed pair (~105s lag)

type CaptureLedgerGoal = Extract<FeedMsg, { type: 'ledger' }> & { msg: { type: 'event'; ev: { id: string; kind: string; side: string | null; confirmed?: boolean; tMs: number } } };

function loadCaptureGoals(): Map<string, CaptureLedgerGoal[]> {
  const raw = JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) as { messages: Array<Record<string, unknown>> };
  const byId = new Map<string, CaptureLedgerGoal[]>();
  for (const m of raw.messages) {
    if (m.type !== 'ledger') continue;
    const lm = m as unknown as CaptureLedgerGoal;
    if (lm.msg?.type !== 'event' || lm.msg.ev?.kind !== 'goal') continue;
    const list = byId.get(lm.msg.ev.id) ?? [];
    list.push(lm);
    byId.set(lm.msg.ev.id, list);
  }
  return byId;
}

async function scenarioRealCaptureConfirmGate(ctx: InProcessCtx): Promise<void> {
  const { url, registry, broadcastToMatch, dataDir } = ctx;
  const goals = loadCaptureGoals();
  const disallowed = goals.get(DISALLOWED_GOAL_ID) ?? [];
  const legit = goals.get(LEGIT_GOAL_ID) ?? [];
  const legitUnconfirmed = legit.filter((g) => g.msg.ev.confirmed !== true);
  const legitConfirmed = legit.filter((g) => g.msg.ev.confirmed === true);

  /* preconditions — the capture really is what the review says it is */
  assert(
    `precondition: the real capture's ${DISALLOWED_GOAL_ID} was emitted and NEVER confirmed (a disallowed goal — FRA 2-0 MAR excludes it)`,
    disallowed.length >= 1 && disallowed.every((g) => g.msg.ev.confirmed !== true),
    `emissions=${disallowed.length} confirmedFlags=${JSON.stringify(disallowed.map((g) => g.msg.ev.confirmed))}`,
  );
  const lagMs = legitConfirmed.length > 0 && legitUnconfirmed.length > 0 ? legitConfirmed[0]!.msg.ev.tMs - legitUnconfirmed[0]!.msg.ev.tMs : NaN;
  assert(
    `precondition: ${LEGIT_GOAL_ID} carries a real unconfirmed→confirmed pair, confirmation later (the §7 "resolves when the goal confirms" lag)`,
    legitUnconfirmed.length >= 1 && legitConfirmed.length >= 2 && lagMs > 0,
    `unconfirmed=${legitUnconfirmed.length} confirmed=${legitConfirmed.length} confirmLagMs=${lagMs} (~${Math.round(lagMs / 1000)}s)`,
  );

  /* one fan, live play, calls 'away' — the EXACT call the disallowed away
   * goal would have wrongly graded CORRECT before the fix */
  const fan = await connect(url);
  const cap = attachNextGoalCapture(fan, CAPTURE_MATCH, 'ng-cap-fan');
  send(fan, { type: 'hello', matchId: CAPTURE_MATCH, anonId: 'ng-cap-fan', side: 'away' });
  await sleep(120);
  broadcastToMatch(CAPTURE_MATCH, { type: 'status', ev: { tMs: Date.now(), phase: 'FIRST_HALF', minute: 40, source: 'replay' } });
  await sleep(60);
  send(fan, { type: 'nextGoalCall', matchId: CAPTURE_MATCH, anonId: 'ng-cap-fan', call: 'away', atMs: Date.now() });
  await sleep(150);

  // the disallowed goal's VERBATIM envelope(s), through the real dispatch
  for (const g of disallowed) broadcastToMatch(CAPTURE_MATCH, g);
  await sleep(150);
  assert(
    `the disallowed goal (${DISALLOWED_GOAL_ID}, verbatim from the capture) resolves NOTHING — no verdict (it would have been a false CORRECT for this 'away' call), book intact`,
    cap.verdicts.length === 0 && (registry.get(CAPTURE_MATCH)?.nextGoalOpenCount() ?? -1) === 1,
    `verdicts=${JSON.stringify(cap.verdicts)} openCount=${registry.get(CAPTURE_MATCH)?.nextGoalOpenCount()}`,
  );

  // the legit goal's real UNCONFIRMED emission — still nothing
  broadcastToMatch(CAPTURE_MATCH, legitUnconfirmed[0]!);
  await sleep(150);
  assert(
    `${LEGIT_GOAL_ID}'s real UNCONFIRMED emission resolves nothing either — the held breath is never graded`,
    cap.verdicts.length === 0 && (registry.get(CAPTURE_MATCH)?.nextGoalOpenCount() ?? -1) === 1,
    `verdicts=${JSON.stringify(cap.verdicts)}`,
  );

  // the real CONFIRMATION — resolves exactly once, on this emission
  broadcastToMatch(CAPTURE_MATCH, legitConfirmed[0]!);
  await sleep(200);
  assert(
    `${LEGIT_GOAL_ID}'s real CONFIRMED emission resolves the call exactly once — 'away' vs the home goal = WRONG, happened:'home'`,
    cap.verdicts.length === 1 && cap.verdicts[0]?.outcome === 'wrong' && cap.verdicts[0]?.happened === 'home',
    `verdicts=${JSON.stringify(cap.verdicts)}`,
  );

  // a fresh cycle-2 call, then the goal's SECOND real confirmed re-emission
  send(fan, { type: 'nextGoalCall', matchId: CAPTURE_MATCH, anonId: 'ng-cap-fan', call: 'home', atMs: Date.now() });
  await sleep(120);
  broadcastToMatch(CAPTURE_MATCH, legitConfirmed[1]!);
  await sleep(150);
  assert(
    `${LEGIT_GOAL_ID}'s second real confirmed re-emission resolves nothing further — cycle 2 stays open`,
    cap.verdicts.length === 1 && (registry.get(CAPTURE_MATCH)?.nextGoalOpenCount() ?? -1) === 1,
    `verdicts=${cap.verdicts.length} openCount=${registry.get(CAPTURE_MATCH)?.nextGoalOpenCount()}`,
  );

  /* white-box: the persisted dedup Set + record row */
  registry.snapshotNow();
  const onDisk = snapshotMatchOn(dataDir, CAPTURE_MATCH);
  assert(
    `the persisted nextGoalResolvedIds carries ${LEGIT_GOAL_ID} and NOT ${DISALLOWED_GOAL_ID} — the disallowed goal never consumed a cycle`,
    !!onDisk?.nextGoalResolvedIds?.includes(LEGIT_GOAL_ID) && !onDisk?.nextGoalResolvedIds?.includes(DISALLOWED_GOAL_ID),
    `nextGoalResolvedIds=${JSON.stringify(onDisk?.nextGoalResolvedIds)}`,
  );
  assert(
    `the persisted record row carries confirmedGoalId ${LEGIT_GOAL_ID}, happened:'home', crowd n:1 — §1.4's substrate, real counts only`,
    onDisk?.nextGoalRows?.length === 1 && onDisk.nextGoalRows[0]?.confirmedGoalId === LEGIT_GOAL_ID && onDisk.nextGoalRows[0]?.happened === 'home' && onDisk.nextGoalRows[0]?.crowd.n === 1,
    `nextGoalRows=${JSON.stringify(onDisk?.nextGoalRows)}`,
  );

  await closeAndWait(fan);
}

/* ═════ scenario 3 — the crystallized record carries the nextGoal rows ════ */
/** A REAL fixture id (sentiment/teams.ts) — getOrCreateAccumulator returns
 * null for anything else, so rows/crystallize would silently no-op (the same
 * reason restart-persistence-check.ts's anchor-guard scenario uses it). */
const RECORD_FIXTURE_ID = '18175918'; // ARG–CPV — identity only; everything below is fabricated in an isolated dataDir

async function scenarioSentimentRecordRows(ctx: InProcessCtx): Promise<void> {
  const { url, broadcastToMatch, dataDir } = ctx;
  const fanX = await connect(url);
  const fanY = await connect(url);
  const capX = attachNextGoalCapture(fanX, RECORD_FIXTURE_ID, 'ng-rec-x');
  send(fanX, { type: 'hello', matchId: RECORD_FIXTURE_ID, anonId: 'ng-rec-x', side: 'home' });
  send(fanY, { type: 'hello', matchId: RECORD_FIXTURE_ID, anonId: 'ng-rec-y', side: 'away' });
  await sleep(120);

  broadcastToMatch(RECORD_FIXTURE_ID, { type: 'status', ev: { tMs: Date.now(), phase: 'FIRST_HALF', minute: 0, source: 'replay' } });
  broadcastToMatch(RECORD_FIXTURE_ID, { type: 'odds', tick: { tMs: Date.now(), minute: 5, pHome: 0.6, pDraw: 0.25, pAway: 0.15, source: 'replay' } });
  await sleep(80);
  send(fanX, { type: 'nextGoalCall', matchId: RECORD_FIXTURE_ID, anonId: 'ng-rec-x', call: 'home', atMs: Date.now() });
  send(fanY, { type: 'nextGoalCall', matchId: RECORD_FIXTURE_ID, anonId: 'ng-rec-y', call: 'none', atMs: Date.now() });
  await sleep(150);

  // cycle 1: a CONFIRMED home goal
  broadcastToMatch(RECORD_FIXTURE_ID, {
    type: 'ledger',
    msg: { type: 'event', ev: { id: `${RECORD_FIXTURE_ID}:rec-goal-1`, kind: 'goal', side: 'home', minute: 23, tMs: Date.now(), major: true, headline: 'Goal — Home', score: { home: 1, away: 0 }, confirmed: true } },
  });
  await sleep(150);

  // cycle 2: a fresh call, a moved market, then score + FULL_TIME
  send(fanX, { type: 'nextGoalCall', matchId: RECORD_FIXTURE_ID, anonId: 'ng-rec-x', call: 'away', atMs: Date.now() });
  await sleep(120);
  broadcastToMatch(RECORD_FIXTURE_ID, { type: 'odds', tick: { tMs: Date.now(), minute: 88, pHome: 0.8, pDraw: 0.15, pAway: 0.05, source: 'replay' } });
  broadcastToMatch(RECORD_FIXTURE_ID, { type: 'score', ev: { tMs: Date.now(), minute: 90, home: 1, away: 0, source: 'replay' } });
  await sleep(80);
  broadcastToMatch(RECORD_FIXTURE_ID, { type: 'status', ev: { tMs: Date.now(), phase: 'FULL_TIME', minute: 90, source: 'replay' } });
  await sleep(400); // crystallizeSentiment's write is synchronous inside the FT dispatch; margin for the ws deliveries

  assert(
    "record scenario: fan X's two personal verdicts arrived (cycle 1 'home' correct at the confirmed goal; cycle 2 'away' wrong at FULL_TIME)",
    capX.verdicts.length === 2 && capX.verdicts[0]?.outcome === 'correct' && capX.verdicts[1]?.outcome === 'wrong' && capX.verdicts[1]?.happened === 'none',
    `verdicts=${JSON.stringify(capX.verdicts)}`,
  );

  // the crystallized record on disk — the ONE artifact Important 3 is about.
  // THE SEAL is deferred (Codex pre-match review, findings 1+3): crystallize
  // now fires once the full-time reaction window closes (REACT_WINDOW_MS 25s),
  // so the record lands ~28s after the whistle, not inside its dispatch tick.
  // Wait for the artifact rather than assuming the old synchronous write.
  const sentimentDir = path.join(dataDir, 'sentiment');
  const listRecords = (): string[] =>
    existsSync(sentimentDir) ? readdirSync(sentimentDir).filter((f) => f.startsWith(`${RECORD_FIXTURE_ID}-`) && f.endsWith('.json')) : [];
  const sealDeadline = Date.now() + 60_000;
  while (listRecords().length === 0 && Date.now() < sealDeadline) await sleep(500);
  const recordFiles = listRecords();
  assert('record scenario: exactly ONE crystallized SentimentRecord file on disk', recordFiles.length === 1, `files=${JSON.stringify(recordFiles)}`);
  const record = recordFiles.length === 1 ? (JSON.parse(readFileSync(path.join(sentimentDir, recordFiles[0]!), 'utf8')) as SentimentRecord) : null;
  const rows = record?.nextGoal ?? [];
  const r1 = rows[0];
  const r2 = rows[1];
  assert(
    'the record carries BOTH nextGoal rows — including the FULL_TIME cycle (proves nextGoalLifecycle runs BEFORE predictLifecycle crystallizes)',
    rows.length === 2,
    `nextGoal=${JSON.stringify(rows)}`,
  );
  assert(
    "row 1 (the confirmed goal): cycle 1, happened:'home', confirmedGoalId set, crowd {n:2,home:1,away:0,none:1}, market stamped at resolution (0.6 line)",
    r1?.cycle === 1 && r1?.happened === 'home' && r1?.confirmedGoalId === `${RECORD_FIXTURE_ID}:rec-goal-1` && r1?.crowd.n === 2 && r1?.crowd.home === 1 && r1?.crowd.none === 1 && r1?.marketAtResolution?.home === 0.6 && r1.openedAtMs > 0 && r1.openedAtMs <= r1.resolvedAtMs,
    `row1=${JSON.stringify(r1)}`,
  );
  assert(
    "row 2 (FULL_TIME): cycle 2, happened:'none', confirmedGoalId null, crowd {n:1,away:1}, market stamped from the LATER tick (0.8 line — resolution-time truth, not call-time)",
    r2?.cycle === 2 && r2?.happened === 'none' && r2?.confirmedGoalId === null && r2?.crowd.n === 1 && r2?.crowd.away === 1 && r2?.marketAtResolution?.home === 0.8,
    `row2=${JSON.stringify(r2)}`,
  );
  assert(
    'the record still hashes + carries provenance (the additive field broke nothing in assembly), and anchorTxSig stayed null (no keypair — no devnet tx attempted)',
    !!record?.provenance.recordHash && record.provenance.anchorTxSig === null,
    `hash=${record?.provenance.recordHash?.slice(0, 12)} anchorTxSig=${String(record?.provenance.anchorTxSig)}`,
  );

  await closeAndWait(fanX);
  await closeAndWait(fanY);
}

/* ═════ scenario 4 — converted in-play penalties resolve; shootouts never ═ */
const PARFRA_REPLAY_PATH = new URL('../../../../apps/web/public/replay/par-fra-20260704.jsonl', import.meta.url);
const PARFRA_MATCH = '18188721'; // PAR home, FRA away (Participant1IsHome:true; France's pen = Participant 2 → side 'away')
const PARFRA_PEN_ID = `${PARFRA_MATCH}:609`; // France's only goal — penalty_outcome, zero Action:'goal' envelopes all match

/** The real Id-609 penalty_outcome lines, parsed through the REAL parser
 * (contracts/normalize.ts parseLedgerMessage — exactly what live/replay
 * ingest run), in captured order. Also returns the raw envelope JSON strings
 * so the Missed/shootout variants below can be built by mutating a REAL
 * envelope (Id + Outcome only) instead of hand-crafting a synthetic shape. */
function loadParFraPenaltyEmissions(): Array<{ ledger: LedgerMsg; rawData: string; confirmed: boolean }> {
  // NOTE: each line's `data` field is a JSON-ENCODED STRING, so the envelope's
  // quotes appear escaped in the raw line (\"Action\":\"penalty_outcome\") —
  // match the bare token, not a quoted form that never occurs.
  const lines = readFileSync(PARFRA_REPLAY_PATH, 'utf8').split('\n').filter((l) => l.includes('penalty_outcome'));
  const out: Array<{ ledger: LedgerMsg; rawData: string; confirmed: boolean }> = [];
  for (const line of lines) {
    const rec = JSON.parse(line) as { receivedAtMs: number; data: string };
    const env = JSON.parse(rec.data) as { Id?: number; Confirmed?: boolean };
    if (env.Id !== 609) continue;
    const ledger = parseLedgerMessage(rec.data, rec.receivedAtMs, 'replay');
    if (ledger) out.push({ ledger, rawData: rec.data, confirmed: env.Confirmed === true });
  }
  return out;
}

/** A variant of a REAL penalty envelope with only Id/Outcome changed —
 * re-parsed through the real parser, so every other field stays wire-true. */
function penaltyVariant(rawData: string, newId: number, outcome: string): LedgerMsg | null {
  const env = JSON.parse(rawData) as { Id?: number; Data?: { Outcome?: string } };
  env.Id = newId;
  if (env.Data) env.Data.Outcome = outcome;
  return parseLedgerMessage(JSON.stringify(env), Date.now(), 'replay');
}

async function scenarioInPlayPenalty(ctx: InProcessCtx): Promise<void> {
  const { url, registry, broadcastToMatch, dataDir } = ctx;
  const emissions = loadParFraPenaltyEmissions();
  const unconfirmed = emissions.filter((e) => !e.confirmed);
  const confirmed = emissions.filter((e) => e.confirmed);

  /* preconditions — the capture + parser really are what the review says */
  const firstEv = emissions[0]?.ledger.type === 'event' ? emissions[0].ledger.ev : null;
  assert(
    'precondition: PAR–FRA Id-609 = three real penalty_outcome emissions (Confirmed false→true→true), parsed by the REAL parser to ledger kind penalty-kick, detail Scored, side away — and normalize does NOT stamp ev.confirmed for this kind (why isWireConfirmed reads the raw envelope)',
    emissions.length === 3 && unconfirmed.length === 1 && confirmed.length === 2
      && firstEv?.kind === 'penalty-kick' && firstEv?.detail === 'Scored' && firstEv?.side === 'away' && firstEv?.id === PARFRA_PEN_ID && firstEv?.confirmed === undefined,
    `emissions=${emissions.length} flags=${JSON.stringify(emissions.map((e) => e.confirmed))} ev=${JSON.stringify(firstEv && { kind: firstEv.kind, detail: firstEv.detail, side: firstEv.side, id: firstEv.id, confirmed: firstEv.confirmed })}`,
  );
  const goalEnvelopeCount = readFileSync(PARFRA_REPLAY_PATH, 'utf8').split('\n').filter((l) => l.includes('\\"Action\\":\\"goal\\"')).length;
  assert(
    "precondition: the whole PAR–FRA capture carries ZERO Action:'goal' envelopes — the penalty IS France's only goal (kind==='goal' alone can never resolve it)",
    goalEnvelopeCount === 0,
    `goalEnvelopes=${goalEnvelopeCount}`,
  );

  /* a fan correctly calls the penalty side ('away' = FRA), in live play */
  const fan = await connect(url);
  const cap = attachNextGoalCapture(fan, PARFRA_MATCH, 'ng-pen-fan');
  send(fan, { type: 'hello', matchId: PARFRA_MATCH, anonId: 'ng-pen-fan', side: 'away' });
  await sleep(120);
  broadcastToMatch(PARFRA_MATCH, { type: 'status', ev: { tMs: Date.now(), phase: 'SECOND_HALF', minute: 68, source: 'replay' } }); // the real pen fell at 69'
  await sleep(60);
  send(fan, { type: 'nextGoalCall', matchId: PARFRA_MATCH, anonId: 'ng-pen-fan', call: 'away', atMs: Date.now() });
  await sleep(150);

  // (a) the real sequence, verbatim order: unconfirmed → confirmed → confirmed
  broadcastToMatch(PARFRA_MATCH, { type: 'ledger', msg: unconfirmed[0]!.ledger });
  await sleep(150);
  assert(
    'the UNCONFIRMED penalty emission resolves nothing — the spot-kick award is a held breath, not a goal',
    cap.verdicts.length === 0 && (registry.get(PARFRA_MATCH)?.nextGoalOpenCount() ?? -1) === 1,
    `verdicts=${JSON.stringify(cap.verdicts)}`,
  );
  broadcastToMatch(PARFRA_MATCH, { type: 'ledger', msg: confirmed[0]!.ledger });
  await sleep(200);
  assert(
    "the CONFIRMED Scored in-play penalty resolves the book exactly once — the fan who called 'away' (FRA, the penalty side) grades CORRECT, happened:'away' (before the fix: stayed open, graded permanently WRONG at FT)",
    cap.verdicts.length === 1 && cap.verdicts[0]?.outcome === 'correct' && cap.verdicts[0]?.happened === 'away',
    `verdicts=${JSON.stringify(cap.verdicts)}`,
  );
  send(fan, { type: 'nextGoalCall', matchId: PARFRA_MATCH, anonId: 'ng-pen-fan', call: 'home', atMs: Date.now() }); // fresh cycle-2 call
  await sleep(120);
  broadcastToMatch(PARFRA_MATCH, { type: 'ledger', msg: confirmed[1]!.ledger });
  await sleep(150);
  assert(
    "the penalty's second real confirmed re-emission resolves nothing further — dedup by ev.id, cycle 2 stays open",
    cap.verdicts.length === 1 && (registry.get(PARFRA_MATCH)?.nextGoalOpenCount() ?? -1) === 1,
    `verdicts=${cap.verdicts.length} openCount=${registry.get(PARFRA_MATCH)?.nextGoalOpenCount()}`,
  );

  // (c) a confirmed MISSED in-play penalty (real envelope, Outcome mutated) — no goal, no resolution
  const missed = penaltyVariant(confirmed[0]!.rawData, 9610, 'Missed');
  assert('precondition: the Missed variant re-parses as penalty-kick detail Missed', missed?.type === 'event' && missed.ev.kind === 'penalty-kick' && missed.ev.detail === 'Missed', `ev=${JSON.stringify(missed?.type === 'event' ? { kind: missed.ev.kind, detail: missed.ev.detail } : missed)}`);
  broadcastToMatch(PARFRA_MATCH, { type: 'ledger', msg: missed! });
  await sleep(150);
  assert(
    'a confirmed MISSED in-play penalty resolves nothing — no goal happened',
    cap.verdicts.length === 1 && (registry.get(PARFRA_MATCH)?.nextGoalOpenCount() ?? -1) === 1,
    `verdicts=${cap.verdicts.length} openCount=${registry.get(PARFRA_MATCH)?.nextGoalOpenCount()}`,
  );

  // (b) a SHOOTOUT kick: phase PENALTIES + a confirmed Scored penalty_outcome
  // (the dangerous shape — same kind, same outcome, same confirm) → NOTHING
  broadcastToMatch(PARFRA_MATCH, { type: 'status', ev: { tMs: Date.now(), phase: 'PENALTIES', minute: null, source: 'replay' } });
  await sleep(60);
  const shootout = penaltyVariant(confirmed[0]!.rawData, 9611, 'Scored');
  broadcastToMatch(PARFRA_MATCH, { type: 'ledger', msg: shootout! });
  await sleep(150);
  assert(
    'a shootout-phase (PENALTIES) confirmed Scored kick resolves NOTHING — shootout goals live in PE.Goals, Total.Goals unchanged; not "the next goal"',
    cap.verdicts.length === 1 && (registry.get(PARFRA_MATCH)?.nextGoalOpenCount() ?? -1) === 1,
    `verdicts=${cap.verdicts.length} openCount=${registry.get(PARFRA_MATCH)?.nextGoalOpenCount()}`,
  );

  // shootout semantics unregressed: the surviving side call resolves at FULL_TIME against 'none'
  broadcastToMatch(PARFRA_MATCH, { type: 'status', ev: { tMs: Date.now(), phase: 'FULL_TIME', minute: 120, source: 'replay' } });
  await sleep(200);
  assert(
    "FULL_TIME after the shootout still resolves the open call against 'none' (side call wrong) — today's shootout semantic, unregressed",
    cap.verdicts.length === 2 && cap.verdicts[1]?.outcome === 'wrong' && cap.verdicts[1]?.happened === 'none',
    `verdicts=${JSON.stringify(cap.verdicts)}`,
  );

  /* white-box: dedup Set + record rows on disk */
  registry.snapshotNow();
  const onDisk = snapshotMatchOn(dataDir, PARFRA_MATCH);
  assert(
    'the persisted dedup Set carries ONLY the real pen id + the FT id — the missed and shootout kicks never consumed a cycle',
    onDisk?.nextGoalResolvedIds?.length === 2 && onDisk.nextGoalResolvedIds.includes(PARFRA_PEN_ID) && onDisk.nextGoalResolvedIds.includes(`${PARFRA_MATCH}:nextgoal:ft`),
    `nextGoalResolvedIds=${JSON.stringify(onDisk?.nextGoalResolvedIds)}`,
  );
  assert(
    "the record rows match: row 1 confirmedGoalId = the penalty's ledger id, happened:'away'; row 2 the FT cycle, happened:'none'",
    onDisk?.nextGoalRows?.length === 2 && onDisk.nextGoalRows[0]?.confirmedGoalId === PARFRA_PEN_ID && onDisk.nextGoalRows[0]?.happened === 'away' && onDisk.nextGoalRows[1]?.happened === 'none',
    `nextGoalRows=${JSON.stringify(onDisk?.nextGoalRows)}`,
  );

  await closeAndWait(fan);
}

/* ═══════════ scenario 5 — restart mid-cycle + re-dispatch (children) ═════ */
const STANDS_ROOT = fileURLToPath(new URL('../../', import.meta.url)); // services/stands/
const TSX_BIN = path.join(STANDS_ROOT, 'node_modules', '.bin', 'tsx');

interface BootedServer {
  proc: ChildProcessByStdio<null, Readable, Readable>;
  port: number;
  getOutput(): string;
}
function bootServer(overrides: Record<string, string | undefined>): Promise<BootedServer> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: '0', TXLINE_ENABLE: '', REPLAY_FILE: '' };
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
    // detached: the child becomes its own process-group leader so killHard can
    // SIGKILL the whole group — the tsx .bin shim spawns the real node server
    // as ITS OWN child; killing only the shim pid orphans the server (see
    // restart-persistence-check.ts's identical, empirically-motivated note).
    const proc = spawn(TSX_BIN, ['src/index.ts'], { cwd: STANDS_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const chunks: string[] = [];
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`server did not report a listening port within 10s; output so far:\n${chunks.join('')}`));
    }, 10_000);
    const onData = (chunk: Buffer) => {
      chunks.push(chunk.toString());
      if (settled) return;
      const m = /\[stands\] listening on :(\d+)/.exec(chunks.join(''));
      if (m?.[1]) {
        settled = true;
        clearTimeout(timeout);
        resolve({ proc, port: Number(m[1]), getOutput: () => chunks.join('') });
      }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.once('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });
  });
}
function killHard(proc: ChildProcessByStdio<null, Readable, Readable>): Promise<void> {
  return new Promise((resolve) => {
    if (proc.exitCode !== null || proc.signalCode !== null) { resolve(); return; }
    proc.once('exit', () => resolve());
    try {
      process.kill(-proc.pid!, 'SIGKILL'); // the whole process group (detached:true above)
    } catch {
      proc.kill('SIGKILL'); // group already gone — fall back to the shim pid
    }
  });
}

/**
 * A minimal REPLAY_FILE fixture (live-wire envelope shapes per
 * contracts/normalize.ts, same hand-built pattern as restart-persistence-
 * check.ts's): PRE → FIRST_HALF (live play begins) → a CONFIRMED AWAY goal
 * (Confirmed:true — the confirm gate would honestly ignore it otherwise).
 * No FULL_TIME — the match stays live so a SECOND, unresolved call survives
 * into the restart. `receivedAtMs` is baked in ONCE at build time, so
 * re-playing the SAME file from line 0 (boot2 — the Critical 2 bug shape)
 * re-produces the IDENTICAL ledger event id both times: the precondition for
 * the persisted dedup to have anything to prove.
 */
function buildRestartReplayFixture(matchId: string): string {
  const base = Date.now();
  const fid = Number(matchId);
  const lines = [
    { at: base, env: { FixtureId: fid, Participant1IsHome: true, Action: 'status', StatusId: 1, Data: { StatusId: 1 } } }, // PRE
    { at: base + 1500, env: { FixtureId: fid, Participant1IsHome: true, Action: 'status', StatusId: 2, Data: { StatusId: 2 }, Clock: { Running: true, Seconds: 0 } } }, // FIRST_HALF
    { at: base + 3000, env: { FixtureId: fid, Participant1IsHome: true, Action: 'goal', Participant: 2, Confirmed: true, Score: { Participant1: { Total: { Goals: 0 } }, Participant2: { Total: { Goals: 1 } } }, Clock: { Running: true, Seconds: 600 } } }, // AWAY scores, CONFIRMED
  ];
  return lines.map(({ at, env }) => JSON.stringify({ receivedAtMs: at, event: 'message', data: JSON.stringify(env) })).join('\n') + '\n';
}

async function scenarioRestart(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-nextgoal-restart-'));
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rooot-nextgoal-restart-fixture-'));
  // a real teams.ts fixture id so the accumulator exists → the record ROW's
  // restart survival is provable too (own isolated dataDir; identity only).
  const matchId = RECORD_FIXTURE_ID;
  const anonId = 'nextgoal-restart-fan';
  log('restart', `dataDir=${dataDir} matchId=${matchId}`);

  try {
    const replayFile = path.join(fixtureDir, 'nextgoal-restart.jsonl');
    writeFileSync(replayFile, buildRestartReplayFixture(matchId));

    // 1200ms: snapshot.ts floors STANDS_SNAPSHOT_INTERVAL_MS at 1000ms (review
    // M1's clamp) — anything below that silently falls back to the 30s
    // production default, which would starve every wait below.
    const boot1 = await bootServer({ STANDS_DATA_DIR: dataDir, STANDS_SNAPSHOT_INTERVAL_MS: '1200', REPLAY_FILE: replayFile, REPLAY_FIXTURE: matchId, RELAYER_KEYPAIR: undefined, RELAYER_KEYPAIR_FILE: undefined });
    log('boot1', `up on port ${boot1.port} (replaying ${replayFile})`);

    const url1 = `ws://127.0.0.1:${boot1.port}`;
    const fan = await connect(url1);
    const cap = attachNextGoalCapture(fan, matchId, anonId);
    const sawFirstHalf = { yes: false };
    fan.on('message', (raw) => {
      try {
        const m = JSON.parse(raw.toString()) as { type?: string; matchId?: string; ev?: { phase?: string } };
        if (m.type === 'status' && m.matchId === matchId && m.ev?.phase === 'FIRST_HALF') sawFirstHalf.yes = true;
      } catch {
        /* not JSON-relevant — ignore */
      }
    });
    send(fan, { type: 'hello', matchId, anonId, side: 'home' });

    const gotFirstHalf = await waitFor(() => sawFirstHalf.yes, 4000);
    assert('boot1: the replay reaches FIRST_HALF (live play) before the goal', gotFirstHalf, `sawFirstHalf=${sawFirstHalf.yes}`);

    // cycle 1: called BEFORE the away goal — resolves WRONG pre-restart.
    send(fan, { type: 'nextGoalCall', matchId, anonId, call: 'home', atMs: Date.now() });
    const gotFirstVerdict = await waitFor(() => cap.verdicts.length >= 1, 4000);
    assert(
      "boot1: the CONFIRMED away goal resolves cycle 1's call WRONG (called home, away scored)",
      gotFirstVerdict && cap.verdicts[0]?.outcome === 'wrong' && cap.verdicts[0]?.happened === 'away',
      `verdicts=${JSON.stringify(cap.verdicts)}`,
    );

    // cycle 2: a FRESH open call placed AFTER cycle 1 resolved, deliberately
    // left UNRESOLVED — the "mid-cycle" state the restart must restore.
    send(fan, { type: 'nextGoalCall', matchId, anonId, call: 'home', atMs: Date.now() });
    await sleep(150);

    const gotSeededSnapshot = await waitFor(() => {
      const m = snapshotMatchOn(dataDir, matchId);
      return (m?.nextGoalOpen?.length ?? 0) > 0
        && (m?.fanStats?.some(([id, fs]) => id === anonId && (fs.nextGoalCalls ?? 0) >= 1) ?? false)
        && (m?.nextGoalResolvedIds?.length ?? 0) >= 1
        && (m?.nextGoalRows?.length ?? 0) === 1;
    }, 4000);
    const seededMatch = snapshotMatchOn(dataDir, matchId);
    assert(
      "boot1: a periodic snapshot lands with cycle 1's counters + record row + resolved-id AND cycle 2's open call, before the kill",
      gotSeededSnapshot,
      `match=${JSON.stringify(seededMatch)}`,
    );
    const resolvedGoalId = seededMatch?.nextGoalResolvedIds?.[0] ?? '(missing)';
    assert(
      "boot1: the persisted record row is cycle 1, happened:'away', confirmedGoalId === the persisted resolved id, marketAtResolution null (no odds in this fixture — honest absence)",
      seededMatch?.nextGoalRows?.[0]?.cycle === 1 && seededMatch?.nextGoalRows?.[0]?.happened === 'away' && seededMatch?.nextGoalRows?.[0]?.confirmedGoalId === resolvedGoalId && seededMatch?.nextGoalRows?.[0]?.marketAtResolution === null,
      `row=${JSON.stringify(seededMatch?.nextGoalRows?.[0])} resolvedIds=${JSON.stringify(seededMatch?.nextGoalResolvedIds)}`,
    );

    await closeAndWait(fan);
    await killHard(boot1.proc); // SIGKILL — no graceful shutdown, exactly the "mid-cycle" scenario
    log('boot1', 'hard-killed (SIGKILL) mid cycle-2 (open, unresolved)');
    const savedAtBeforeBoot2 = readSnapshotFileAt(dataDir)?.savedAtMs ?? 0;

    // ── boot2: a FRESH child process, SAME dataDir, SAME REPLAY FILE — the
    // review Critical 2 bug shape made real: REPLAY mode always plays from
    // line 0 (the same re-dispatch mechanism as TxLINE's seedSnapshot on a
    // live boot), so the identical, ALREADY-RESOLVED goal event re-delivers
    // through the real dispatch at ~+3s. The persisted nextGoalResolvedIds
    // (restored BEFORE ingest starts) must make it a no-op against the
    // restored cycle-2 open call. ───────────────────────────────────────────
    const boot2 = await bootServer({ STANDS_DATA_DIR: dataDir, STANDS_SNAPSHOT_INTERVAL_MS: '1200', REPLAY_FILE: replayFile, REPLAY_FIXTURE: matchId, RELAYER_KEYPAIR: undefined, RELAYER_KEYPAIR_FILE: undefined });
    log('boot2', `up on port ${boot2.port} (re-replaying the SAME fixture from line 0 — the Critical 2 scenario)`);
    const restoredLine = boot2.getOutput().split('\n').find((l) => l.includes('[stands:registry] restored'));
    assert('boot2 logs a restored-snapshot line', !!restoredLine, restoredLine ?? '(no matching line)');

    const url2 = `ws://127.0.0.1:${boot2.port}`;
    // seeded via ?matchId= so replaySnapshot's join-catch-up fires on connect
    // — this is where the restored open call's nextGoalState replay lives.
    // Connected BEFORE the re-replayed goal lands (~+3s), so a wrongful
    // re-resolution would be VISIBLE here (an n:0 state broadcast + a live
    // verdict), not just absent from a later poll.
    const observer = await connect(`${url2}/?matchId=${encodeURIComponent(matchId)}`);
    const obsCap = attachNextGoalCapture(observer, matchId, anonId);
    const fan2 = await connect(url2);
    const cap2 = attachNextGoalCapture(fan2, matchId, anonId);
    send(fan2, { type: 'hello', matchId, anonId, side: 'home' });
    await sleep(250);
    assert(
      'boot2: the join-time replay includes the restored OPEN call (cycle 2, home:1, n:1) — survived the restart untouched',
      obsCap.states.length >= 1 && obsCap.states[0]?.open.n === 1 && obsCap.states[0]?.open.home === 1,
      `states=${JSON.stringify(obsCap.states)}`,
    );
    assert(
      "boot2: re-hello (same anonId) replays cycle 1's verdict (wrong, happened=away) — sourced from the snapshot, not memory",
      cap2.verdicts.length === 1 && cap2.verdicts[0]?.outcome === 'wrong' && cap2.verdicts[0]?.happened === 'away',
      `verdicts=${JSON.stringify(cap2.verdicts)}`,
    );

    // let boot2's replay fully re-run (PRE → FH → goal lands ~+3s) + margin.
    await sleep(4200);
    assert(
      'boot2: the re-delivered, already-resolved goal resolves NOTHING against the restored cycle-2 call — no new verdict (still exactly the 1 replayed), no n:0 state ever broadcast',
      cap2.verdicts.length === 1 && obsCap.states.every((s) => s.open.n === 1),
      `verdicts=${cap2.verdicts.length} states=${JSON.stringify(obsCap.states.map((s) => s.open))}`,
    );

    // fanStats + row + dedup id, proven via a FRESH periodic write post-boot2
    // (not a stale leftover file).
    const gotFreshWrite = await waitFor(() => (readSnapshotFileAt(dataDir)?.savedAtMs ?? 0) > savedAtBeforeBoot2, 4000);
    assert("boot2: a fresh periodic write lands (proves boot2's OWN restored in-memory state, not a stale file)", gotFreshWrite, `savedAtBeforeBoot2=${savedAtBeforeBoot2}`);
    const matchAfterBoot2 = snapshotMatchOn(dataDir, matchId);
    const rowAfterBoot2 = matchAfterBoot2?.fanStats?.find(([id]) => id === anonId)?.[1];
    assert(
      'boot2: fanStats counters (nextGoalCalls:1, nextGoalCorrect:0 — cycle 1 only; cycle 2 still open, uncounted), the single record row, the single resolved id, and the open call ALL survive the restart + re-dispatch unchanged',
      rowAfterBoot2?.nextGoalCalls === 1 && rowAfterBoot2?.nextGoalCorrect === 0
        && matchAfterBoot2?.nextGoalRows?.length === 1
        && matchAfterBoot2?.nextGoalResolvedIds?.length === 1
        && matchAfterBoot2?.nextGoalOpen?.length === 1,
      `fanStats=${JSON.stringify(rowAfterBoot2)} rows=${matchAfterBoot2?.nextGoalRows?.length} resolvedIds=${matchAfterBoot2?.nextGoalResolvedIds?.length} open=${matchAfterBoot2?.nextGoalOpen?.length}`,
    );

    await closeAndWait(observer);
    await closeAndWait(fan2);
    await killHard(boot2.proc);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

/* ══════════════════════════════════════════════════════════════════════ */
const watchdog = setTimeout(() => {
  console.error('[next-goal-check] watchdog: hung for 90s, forcing exit');
  process.exit(1);
}, 90_000);

async function main(): Promise<void> {
  const ctx = await bootInProcess();
  try {
    await scenarioLiveFlow(ctx);
    await scenarioRealCaptureConfirmGate(ctx);
    await scenarioSentimentRecordRows(ctx);
    await scenarioInPlayPenalty(ctx);
  } finally {
    ctx.registry.stop();
    // force-drop any ws socket a FAILED scenario left open — without this,
    // httpServer.close waits on live connections forever and the watchdog,
    // not the summary, ends the run (observed when a mid-scenario throw
    // skipped a closeAndWait). No-op on the happy path (all fans closed).
    ctx.httpServer.closeAllConnections?.();
    await new Promise<void>((resolve) => ctx.httpServer.close(() => resolve()));
    rmSync(ctx.dataDir, { recursive: true, force: true });
  }
  await scenarioRestart();
}

main()
  .then(() => {
    clearTimeout(watchdog);
    console.log('\n──────────── SUMMARY ────────────');
    const failed = assertions.filter((x) => !x.pass);
    console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
    if (failed.length > 0) {
      console.log('FAILED:');
      for (const f of failed) console.log(`  - ${f.desc} (${f.detail})`);
      process.exitCode = 1;
    }
    process.exit(process.exitCode ?? 0);
  })
  .catch((err) => {
    clearTimeout(watchdog);
    console.error('[next-goal-check] fatal:', err);
    process.exit(1);
  });
