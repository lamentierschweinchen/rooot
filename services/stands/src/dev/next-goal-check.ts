/**
 * NEXT GOAL (in-game) dev check (tonight-gate) — docs/BACKLOG-full-version-
 * and-deferred-ideas.md §2. Proves the mechanism end-to-end with a REAL
 * server and real ws clients (same discipline as verdict-replay-check.ts /
 * restart-persistence-check.ts):
 *
 * scenarioLiveFlow (in-process, driving broadcastToMatch directly — the
 * SAME function TXLINE/REPLAY ingest calls for every live message):
 *   1. a call sent before kickoff (phase PRE) is rejected — no state
 *      broadcast, nothing open, silently dropped.
 *   2. call-replace semantics: a fan's second call REPLACES the first —
 *      only the latest is counted in the crowd's open tally.
 *   3. state broadcasts carry an honest n (=== home+away+none) and a market
 *      stamp once odds exist.
 *   4. a real goal ledger event resolves every open call against the
 *      scoring side (correct/wrong), delivers each verdict PERSONALLY, and
 *      every verdict carries the market stamped at CALL time. The book is
 *      empty (n:0) immediately after.
 *   5. re-emitting the SAME goal id (a Confirmed:false→true upgrade, or a
 *      replay re-delivery) does NOT resolve a fresh cycle's open call again
 *      — dedup by ev.id holds.
 *   6. FULL_TIME resolves the book against 'none': 'none' calls go
 *      correct, side calls go wrong. A re-delivered FULL_TIME doesn't
 *      double-resolve either.
 *   7. fanStats.nextGoalCalls/nextGoalCorrect accumulate at RESOLUTION, not
 *      at call time — a call replaced before it resolves is never counted.
 *
 * scenarioRestart (a REAL child-process boot/kill/reboot, zero shared
 * memory — same discipline as restart-persistence-check.ts): a fan's call
 * resolves once (cycle 1, wrong) via a real REPLAY_FILE goal, then opens a
 * FRESH call (cycle 2) that's deliberately left OPEN — SIGKILLed mid-cycle.
 * A fresh child process, same dataDir, NO replay file (a plain restart,
 * never re-processing the feed): the join-time replay shows the restored
 * OPEN call; a re-hello replays cycle 1's verdict; fanStats counters
 * (nextGoalCalls/nextGoalCorrect) survive, read off the on-disk snapshot
 * (write-only substrate, no wire message — same honest approach
 * restart-persistence-check.ts uses for fanStats).
 *
 * Usage: tsx src/dev/next-goal-check.ts (or: npm run check:next-goal)
 */
import { type ChildProcessByStdio, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import type { ClientMsg, NextGoalStateMsg, NextGoalVerdictMsg, ServerMsg } from '@contracts/crowd';

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

/* ═══════════════════════ scenario 1 — live flow (in-process) ═══════════ */
async function scenarioLiveFlow(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-nextgoal-live-'));
  // Set BEFORE the dynamic import — module-level constants in snapshot.ts
  // read these at import time (verdict-replay-check.ts's identical pattern).
  process.env.STANDS_DATA_DIR = dataDir;
  process.env.STANDS_SNAPSHOT_INTERVAL_MS = '20000'; // far longer than this scenario's runtime
  const { createStandsServer } = await import('../server');
  const { httpServer, registry, broadcastToMatch } = createStandsServer();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const addr = httpServer.address();
  if (addr === null || typeof addr === 'string') throw new Error('failed to bind an ephemeral port');
  const url = `ws://127.0.0.1:${addr.port}`;
  const MATCH_ID = `nextgoal-live-${Date.now()}`;
  log('live', `up on ephemeral port ${addr.port}, matchId=${MATCH_ID}`);

  try {
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

    /* ── a real goal resolves the book ── */
    broadcastToMatch(MATCH_ID, {
      type: 'ledger',
      msg: { type: 'event', ev: { id: 'ng-goal-1', kind: 'goal', side: 'home', minute: 10, tMs: Date.now(), major: true, headline: 'Goal — Home', score: { home: 1, away: 0 } } },
    });
    await sleep(200);

    assert(
      "fan A (last called 'away') gets a WRONG verdict — home scored",
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

    /* ── re-emission of the SAME goal id doesn't double-resolve ── */
    send(fanA, { type: 'nextGoalCall', matchId: MATCH_ID, anonId: 'ng-fan-a', call: 'away', atMs: Date.now() }); // a fresh cycle-2 call
    await sleep(100);
    broadcastToMatch(MATCH_ID, {
      type: 'ledger',
      msg: { type: 'event', ev: { id: 'ng-goal-1', kind: 'goal', side: 'home', minute: 10, tMs: Date.now(), major: true, headline: 'Goal — Home (Confirmed upgrade)', score: { home: 1, away: 0 }, confirmed: true } },
    });
    await sleep(150);
    assert("re-emitting the SAME goal id (ev.id 'ng-goal-1') does not resolve fan A's fresh cycle-2 call again", capA.verdicts.length === 1, `capA.verdicts=${JSON.stringify(capA.verdicts)}`);
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
  } finally {
    registry.stop();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  }
}

/* ═══════════════════ scenario 2 — restart mid-cycle (child process) ═══════ */
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
 * check.ts's buildAnchorCheckReplayFixture): PRE → FIRST_HALF (live play
 * begins) → an AWAY goal (resolves whatever's open at that point). No
 * FULL_TIME — the match stays live so a SECOND, unresolved call survives
 * into the restart.
 */
function buildRestartReplayFixture(matchId: string): string {
  const base = Date.now();
  const fid = Number(matchId);
  const lines = [
    { at: base, env: { FixtureId: fid, Participant1IsHome: true, Action: 'status', StatusId: 1, Data: { StatusId: 1 } } }, // PRE
    { at: base + 1500, env: { FixtureId: fid, Participant1IsHome: true, Action: 'status', StatusId: 2, Data: { StatusId: 2 }, Clock: { Running: true, Seconds: 0 } } }, // FIRST_HALF
    { at: base + 3000, env: { FixtureId: fid, Participant1IsHome: true, Action: 'goal', Participant: 2, Score: { Participant1: { Total: { Goals: 0 } }, Participant2: { Total: { Goals: 1 } } }, Clock: { Running: true, Seconds: 600 } } }, // AWAY scores (Participant1IsHome:true, Participant:2 → away)
  ];
  return lines.map(({ at, env }) => JSON.stringify({ receivedAtMs: at, event: 'message', data: JSON.stringify(env) })).join('\n') + '\n';
}

/** fanStats is write-only (no wire message) — read the on-disk snapshot
 * directly, the same honest approach restart-persistence-check.ts uses. */
interface SnapshotFileOnDisk {
  savedAtMs: number;
  matches: Array<{
    matchId: string;
    fanStats?: Array<[string, { nextGoalCalls?: number; nextGoalCorrect?: number }]>;
    nextGoalOpen?: Array<[string, { call: string }]>;
  }>;
}
function readSnapshotFileOn(dataDir: string): SnapshotFileOnDisk | null {
  const p = path.join(dataDir, 'rooot-stands-snapshot.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as SnapshotFileOnDisk;
  } catch {
    return null; // mid-rename read — treat as not-yet-readable
  }
}

async function scenarioRestart(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-nextgoal-restart-'));
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rooot-nextgoal-restart-fixture-'));
  const matchId = String(Date.now());
  const anonId = 'nextgoal-restart-fan';
  log('restart', `dataDir=${dataDir} matchId=${matchId}`);

  try {
    const replayFile = path.join(fixtureDir, 'nextgoal-restart.jsonl');
    writeFileSync(replayFile, buildRestartReplayFixture(matchId));

    // 1200ms: snapshot.ts floors STANDS_SNAPSHOT_INTERVAL_MS at 1000ms (review
    // M1's clamp) — anything below that silently falls back to the 30s
    // production default, which would starve every wait below.
    const boot1 = await bootServer({ STANDS_DATA_DIR: dataDir, STANDS_SNAPSHOT_INTERVAL_MS: '1200', REPLAY_FILE: replayFile, REPLAY_FIXTURE: matchId });
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
      "boot1: the away goal resolves cycle 1's call WRONG (called home, away scored)",
      gotFirstVerdict && cap.verdicts[0]?.outcome === 'wrong' && cap.verdicts[0]?.happened === 'away',
      `verdicts=${JSON.stringify(cap.verdicts)}`,
    );

    // cycle 2: a FRESH open call placed AFTER cycle 1 resolved, deliberately
    // left UNRESOLVED — the "mid-cycle" state the restart must restore.
    send(fan, { type: 'nextGoalCall', matchId, anonId, call: 'home', atMs: Date.now() });
    await sleep(150);

    const gotSeededSnapshot = await waitFor(() => {
      const f = readSnapshotFileOn(dataDir);
      const m = f?.matches.find((x) => x.matchId === matchId);
      return (m?.nextGoalOpen?.length ?? 0) > 0 && (m?.fanStats?.some(([id, fs]) => id === anonId && (fs.nextGoalCalls ?? 0) >= 1) ?? false);
    }, 4000);
    assert("boot1: a periodic snapshot lands with cycle 1's resolved counters AND cycle 2's open call, before the kill", gotSeededSnapshot, `file=${JSON.stringify(readSnapshotFileOn(dataDir))}`);

    await closeAndWait(fan);
    await killHard(boot1.proc); // SIGKILL — no graceful shutdown, exactly the "mid-cycle" scenario
    log('boot1', "hard-killed (SIGKILL) mid cycle-2 (open, unresolved)");
    const savedAtBeforeBoot2 = readSnapshotFileOn(dataDir)?.savedAtMs ?? 0;

    // ── boot2: a FRESH child process, SAME dataDir, NO replay file — a plain
    // restart that never re-processes the feed (so it can't re-trigger the
    // away goal against the restored cycle-2 call; nextGoalResolvedIds' dedup
    // horizon is deliberately in-memory-only, see server.ts's doc comment) —
    // restores purely from the snapshot. ────────────────────────────────────
    const boot2 = await bootServer({ STANDS_DATA_DIR: dataDir, STANDS_SNAPSHOT_INTERVAL_MS: '1200' });
    log('boot2', `up on port ${boot2.port}`);
    const restoredLine = boot2.getOutput().split('\n').find((l) => l.includes('[stands:registry] restored'));
    assert('boot2 logs a restored-snapshot line', !!restoredLine, restoredLine ?? '(no matching line)');

    const url2 = `ws://127.0.0.1:${boot2.port}`;
    // seeded via ?matchId= so replaySnapshot's join-catch-up fires on connect
    // — this is where the restored open call's nextGoalState replay lives.
    const observer = await connect(`${url2}/?matchId=${encodeURIComponent(matchId)}`);
    const obsCap = attachNextGoalCapture(observer, matchId, anonId);
    await sleep(250);
    assert(
      "boot2: the join-time replay includes the restored OPEN call (cycle 2, home:1, n:1) — survived the restart untouched",
      obsCap.states.length >= 1 && obsCap.states[0]?.open.n === 1 && obsCap.states[0]?.open.home === 1,
      `states=${JSON.stringify(obsCap.states)}`,
    );

    // re-hello with the SAME anonId replays the LAST verdict (cycle 1, wrong)
    // — the "CURRENT cycle" verdict-replay pattern, mirrors predictVerdict.
    const fan2 = await connect(url2);
    const cap2 = attachNextGoalCapture(fan2, matchId, anonId);
    send(fan2, { type: 'hello', matchId, anonId, side: 'home' });
    await sleep(250);
    assert(
      "boot2: re-hello (same anonId) replays cycle 1's verdict (wrong, happened=away) — sourced from the snapshot, not memory",
      cap2.verdicts.length === 1 && cap2.verdicts[0]?.outcome === 'wrong' && cap2.verdicts[0]?.happened === 'away',
      `verdicts=${JSON.stringify(cap2.verdicts)}`,
    );

    // fanStats counters, proven via a FRESH periodic write post-boot2 (not a
    // stale leftover file) — same rigor as restart-persistence-check.ts's
    // scenarioFanStatsRestart.
    const gotFreshWrite = await waitFor(() => (readSnapshotFileOn(dataDir)?.savedAtMs ?? 0) > savedAtBeforeBoot2, 3000);
    assert("boot2: a fresh periodic write lands (proves boot2's OWN restored in-memory state, not a stale file)", gotFreshWrite, `savedAtBeforeBoot2=${savedAtBeforeBoot2}`);
    const rowAfterBoot2 = readSnapshotFileOn(dataDir)?.matches.find((m) => m.matchId === matchId)?.fanStats?.find(([id]) => id === anonId)?.[1];
    assert(
      "boot2: fanStats counters (nextGoalCalls:1, nextGoalCorrect:0 — cycle 1 only; cycle 2 is still open, uncounted) survive the restart",
      rowAfterBoot2?.nextGoalCalls === 1 && rowAfterBoot2?.nextGoalCorrect === 0,
      `row=${JSON.stringify(rowAfterBoot2)}`,
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
  console.error('[next-goal-check] watchdog: hung for 45s, forcing exit');
  process.exit(1);
}, 45_000);

async function main(): Promise<void> {
  await scenarioLiveFlow();
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
