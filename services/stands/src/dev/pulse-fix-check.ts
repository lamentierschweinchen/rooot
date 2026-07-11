/**
 * PULSE FIX CHECK (tonight-gate) — proves REACT drama-moment detection and
 * dispatch end-to-end against REAL captured wire data
 * (services/stands/captures/premiere-fra-mar-18209181-919c9af.json — the
 * FRA-MAR archive capture), driven through the REAL dispatch path
 * (createStandsServer's broadcastToMatch — the exact function routeFeedMsg
 * calls for both TXLINE and REPLAY ingest) into REAL connected ws clients.
 * Boots the REAL server in-process (no restart semantics needed here, so no
 * child-process spawn like restart-persistence-check.ts) — each scenario
 * uses its own matchId, so the module-scope per-match Maps
 * (openedTriggerIds/tripleWindow/accumulators/joinSnapshots/etc.) can never
 * leak state between scenarios despite sharing one process.
 *
 * Root-cause context: the volume's persisted openedTriggerIds showed ZERO
 * triggers across an entire live match with three goals — two nights running
 * (docs/POSTMORTEM-fra-mar-2026-07-09.md; the ESP-BEL Pulse recurrence in
 * docs/NOTES-esp-bel-2026-07-10.md, match 18218149). Exhaustive reproduction
 * against the real captured wire data — single messages, and the FULL real
 * 1722-message match sequence in original order — could not make
 * detectMoment/momentLifecycle fail; every scenario below already passes on
 * the current code. The fix landed defensively rather than leave a
 * theoretical gap unclosed: dispatch fan-out isolation (broadcastToMatch's
 * rememberForJoin/feedSentiment/predictLifecycle/momentLifecycle each get
 * their own try/catch, so a fault in ONE can never silently skip another —
 * previously only momentLifecycle was isolated), registry.getOrCreate (not
 * .get) in momentLifecycle so a trigger is never dropped for lack of crowd
 * presence, stack-trace error logging (errDetail) in place of bare
 * String(err), and an unconditional hard-trigger log line so a repeat is
 * instantly diagnosable from Fly logs. This file also covers the three
 * folded, independently-confirmed sub-fixes: windowed swing detection,
 * sentiment finalScore (crystallizeSentiment now takes the proven-reliable
 * score predictLifecycle already resolves verdicts with, rather than
 * trusting the accumulator's own separate tracking), and ledger event dedup
 * by wire id (last emission wins).
 *
 * Usage: tsx src/dev/pulse-fix-check.ts (or: npm run check:pulse-fix)
 */
import { readFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '@contracts/crowd';
import type { FeedMsg } from '@contracts/feed';
import { SWING_DELTA_MIN, SWING_WINDOW_MS } from '../decay';
import { createStandsServer } from '../server';
import { SentimentAccumulator } from '../sentiment/accumulator';
import { fixtureInfo } from '../sentiment/teams';

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? '✓' : '✗ FAIL';
  if (!cond) failures++;
  console.log(`  ${mark}  ${label}${detail ? `  — ${detail}` : ''}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.once('close', () => resolve());
    ws.close();
  });
}

/* ── real captured wire data (services/stands/captures/) ─────────────────
 * The SAME FRA-MAR archive capture the Step-1 decisive experiment used —
 * real ledger goal events + a real FULL_TIME status, exactly as the server
 * broadcast them live. */
const CAPTURE_PATH = new URL('../../captures/premiere-fra-mar-18209181-919c9af.json', import.meta.url);
const CAPTURE_MATCH = '18209181';
interface Capture {
  messages: Array<Record<string, unknown>>;
}
const capture = JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) as Capture;

function realGoalMessages(): Array<FeedMsg & { type: 'ledger' }> {
  const seen = new Set<string>();
  const out: Array<FeedMsg & { type: 'ledger' }> = [];
  for (const m of capture.messages) {
    if (m.type !== 'ledger') continue;
    const inner = (m as { msg?: { type?: string; ev?: { kind?: string; id?: string } } }).msg;
    if (inner?.type !== 'event' || inner.ev?.kind !== 'goal') continue;
    const id = inner.ev.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(m as FeedMsg & { type: 'ledger' });
  }
  return out;
}
function realFullTimeMessage(): FeedMsg & { type: 'status' } {
  const m = capture.messages.find((x) => x.type === 'status' && (x as { ev?: { phase?: string } }).ev?.phase === 'FULL_TIME');
  if (!m) throw new Error('capture has no FULL_TIME status message — fixture data changed?');
  return m as FeedMsg & { type: 'status' };
}
const REAL_GOALS = realGoalMessages();
const REAL_FULL_TIME = realFullTimeMessage();

/* ── boot the real server once, in-process ────────────────────────────── */
type Broadcast = (matchId: string, msg: ServerMsg | FeedMsg) => void;

async function bootServer(): Promise<{ port: number; broadcastToMatch: Broadcast; close: () => void }> {
  const { httpServer, broadcastToMatch } = createStandsServer();
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const addr = httpServer.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  return { port, broadcastToMatch, close: () => httpServer.close() };
}

/* ── Scenario 1: real goal ledger event → moment broadcast, and dedup on a
 * re-dispatch of the identical id (a real wire re-emission shape) ───────── */
async function scenarioGoalOpensAndDedupes(port: number, broadcastToMatch: Broadcast): Promise<void> {
  console.log('\nSCENARIO 1  real goal → moment broadcast; re-dispatch dedupes');
  const matchId = 'pulse-check-goal';
  const ws = await connect(`ws://127.0.0.1:${port}`);
  const received: Array<Record<string, unknown>> = [];
  ws.on('message', (raw) => {
    try {
      received.push(JSON.parse(raw.toString()) as Record<string, unknown>);
    } catch {
      /* ignore */
    }
  });
  send(ws, { type: 'hello', matchId, anonId: 'pc-goal-fan', side: 'home' });
  await sleep(150);

  const goal = REAL_GOALS[0]!;
  const ev = (goal as unknown as { msg: { ev: { id: string; side: string; minute: number } } }).msg.ev;
  received.length = 0;
  broadcastToMatch(matchId, goal);
  await sleep(150);
  const opens = received.filter((m) => m.type === 'moment');
  check('a real goal ledger event broadcasts exactly one moment', opens.length === 1, JSON.stringify(opens));
  const open = opens[0] as { kind?: string; side?: string; minute?: number; palette?: unknown } | undefined;
  check(
    'the moment carries kind=goal, the REAL side/minute off the wire, and a non-empty palette',
    open?.kind === 'goal' && open.side === ev.side && open.minute === ev.minute && Array.isArray(open.palette) && (open.palette as unknown[]).length > 0,
    JSON.stringify(open),
  );

  // a real wire re-emission carries the SAME event id (Confirmed:false → true,
  // scorer filled in) — dedup must produce NO second window.
  received.length = 0;
  broadcastToMatch(matchId, goal);
  await sleep(150);
  const second = received.filter((m) => m.type === 'moment');
  check('re-dispatching the identical goal id opens NO second moment (dedup)', second.length === 0, JSON.stringify(second));

  await closeAndWait(ws);
}

/* ── Scenario 2: real FULL_TIME status → full-time moment ────────────── */
async function scenarioFullTimeOpensMoment(port: number, broadcastToMatch: Broadcast): Promise<void> {
  console.log('\nSCENARIO 2  real FULL_TIME status → full-time moment');
  const matchId = 'pulse-check-fulltime';
  const ws = await connect(`ws://127.0.0.1:${port}`);
  const received: Array<Record<string, unknown>> = [];
  ws.on('message', (raw) => {
    try {
      received.push(JSON.parse(raw.toString()) as Record<string, unknown>);
    } catch {
      /* ignore */
    }
  });
  send(ws, { type: 'hello', matchId, anonId: 'pc-ft-fan', side: 'away' });
  await sleep(150);

  received.length = 0;
  broadcastToMatch(matchId, REAL_FULL_TIME);
  await sleep(150);
  const opens = received.filter((m) => m.type === 'moment');
  check('a real FULL_TIME status broadcasts exactly one full-time moment', opens.length === 1, JSON.stringify(opens));
  check('it carries kind=full-time', (opens[0] as { kind?: string } | undefined)?.kind === 'full-time', JSON.stringify(opens[0]));

  await closeAndWait(ws);
}

/* ── Scenario 3: momentResult reveal after close, real reacts tallied per
 * end — closed via a SECOND real goal superseding the first (deterministic,
 * no 25s wait for the natural timer). ──────────────────────────────────── */
async function scenarioRevealTalliesRealReacts(port: number, broadcastToMatch: Broadcast): Promise<void> {
  console.log('\nSCENARIO 3  momentResult reveal after close — real reacts tallied per end');
  const matchId = 'pulse-check-reveal';
  const wsHome = await connect(`ws://127.0.0.1:${port}`);
  const wsAway = await connect(`ws://127.0.0.1:${port}`);
  const received: Array<Record<string, unknown>> = [];
  wsHome.on('message', (raw) => {
    try {
      received.push(JSON.parse(raw.toString()) as Record<string, unknown>);
    } catch {
      /* ignore */
    }
  });
  send(wsHome, { type: 'hello', matchId, anonId: 'pc-reveal-home', side: 'home' });
  send(wsAway, { type: 'hello', matchId, anonId: 'pc-reveal-away', side: 'away' });
  await sleep(150);

  const [goalA, goalB] = REAL_GOALS;
  if (!goalA || !goalB) throw new Error('capture needs at least two distinct real goals for this scenario');

  received.length = 0;
  broadcastToMatch(matchId, goalA);
  await sleep(100);
  const open = received.find((m) => m.type === 'moment') as { momentId?: string } | undefined;
  check('goal A opened a moment to react to', !!open?.momentId, JSON.stringify(open));
  const momentId = open?.momentId as string;

  // real fans react through the REAL client message path (handleMomentReact).
  send(wsHome, { type: 'momentReact', matchId, momentId, anonId: 'pc-reveal-home', side: 'home', token: 'euphoria', atMs: Date.now() });
  send(wsAway, { type: 'momentReact', matchId, momentId, anonId: 'pc-reveal-away', side: 'away', token: 'anguish', atMs: Date.now() });
  await sleep(150);

  // force-close via supersede: a second real (different) goal event.
  received.length = 0;
  broadcastToMatch(matchId, goalB);
  await sleep(150);
  const result = received.find((m) => m.type === 'momentResult' && m.momentId === momentId) as
    | { byEnd?: { home: { top: string; n: number }; away: { top: string; n: number } } }
    | undefined;
  check(
    'the closed moment reveals the real reacts, tallied per end, exactly once each',
    result?.byEnd?.home.top === 'euphoria' && result.byEnd.home.n === 1 && result.byEnd.away.top === 'anguish' && result.byEnd.away.n === 1,
    JSON.stringify(result),
  );

  await closeAndWait(wsHome);
  await closeAndWait(wsAway);
}

/* ── odds tick builder — synthetic-but-realistic (real OddsTick shape,
 * fabricated triples), tMs-driven so the window math runs on simulated wire
 * time, not real wall-clock waits. ───────────────────────────────────────── */
function oddsMsg(pHome: number, pDraw: number, pAway: number, tMs: number): FeedMsg & { type: 'odds' } {
  return {
    type: 'odds',
    tick: { pHome, pDraw, pAway, minute: null, tMs, source: 'live', period: 'full' },
  } as unknown as FeedMsg & { type: 'odds' };
}

/* ── Scenario 4: windowed swing FIRES on a gradual drift — the actual bug
 * this sub-fix closes. Many consecutive ticks, each well under
 * SWING_DELTA_MIN on its own, that sum past it across SWING_WINDOW_MS —
 * shaped like the live incident (79 ticks/10s, 60%→97% over the match). ── */
async function scenarioWindowedSwingFiresOnDrift(port: number, broadcastToMatch: Broadcast): Promise<void> {
  console.log('\nSCENARIO 4  windowed swing FIRES on a gradual sub-threshold drift');
  const matchId = 'pulse-check-swing-drift';
  const ws = await connect(`ws://127.0.0.1:${port}`);
  const received: Array<Record<string, unknown>> = [];
  ws.on('message', (raw) => {
    try {
      received.push(JSON.parse(raw.toString()) as Record<string, unknown>);
    } catch {
      /* ignore */
    }
  });
  send(ws, { type: 'hello', matchId, anonId: 'pc-drift-fan', side: 'home' });
  await sleep(150);

  const base = 1_000_000;
  const STEP = 0.01; // each tick alone is 12x smaller than SWING_DELTA_MIN
  check('the step size stays well under the noise floor per-tick (proves this is NOT a single big jump)', STEP < SWING_DELTA_MIN / 4, `step=${STEP} floor=${SWING_DELTA_MIN}`);
  broadcastToMatch(matchId, oddsMsg(0.5, 0.3, 0.2, base)); // baseline tick — window start
  received.length = 0;
  const totalSteps = Math.ceil(SWING_DELTA_MIN / STEP) + 5; // enough steps to cross, with headroom
  for (let i = 1; i <= totalSteps; i++) {
    // pHome carries the FULL drift; pDraw/pAway each absorb only HALF of the
    // complementary decrease — deliberately asymmetric so dH is always ~2x
    // dD/dA with no floating-point tie, and the eventual trigger's `side` is
    // unambiguously 'home' (a tied delta — e.g. pAway absorbing the whole
    // complementary move — is a coin-flip between 'home'/'away' by
    // floating-point rounding alone, confusing to read even though harmless).
    const pHome = 0.5 + i * STEP;
    const pDraw = 0.3 - i * STEP * 0.5;
    const pAway = 0.2 - i * STEP * 0.5;
    // 1s of simulated wire time per tick (tick.tMs) — the whole drift stays
    // comfortably inside SWING_WINDOW_MS (75s), so the baseline tick never
    // ages out. A real yield (setImmediate) between dispatches, NOT a check
    // right after each one — broadcastToMatch's ws.send is synchronous on
    // the SERVER side, but the CLIENT's 'message' event needs a turn of the
    // event loop to actually fire; checking `received` with no yield at all
    // races the delivery and reads empty regardless of server behavior.
    broadcastToMatch(matchId, oddsMsg(pHome, pDraw, pAway, base + i * 1_000));
    await new Promise((r) => setImmediate(r));
  }
  await sleep(100); // settle: let every queued 'message' event actually land
  const opened = received.find((m) => m.type === 'moment');
  check(
    'a swing moment opens once the cumulative drift crosses SWING_DELTA_MIN, well before any single tick would have, toward the side actually drifting (home)',
    (opened as { kind?: string; side?: string } | undefined)?.kind === 'swing' && (opened as { side?: string } | undefined)?.side === 'home',
    JSON.stringify(opened),
  );

  await closeAndWait(ws);
}

/* ── Scenario 5: windowed swing does NOT fire on pure noise (small
 * oscillations that never net displace past the threshold from the window's
 * start) — proves the fix isn't just "trigger on any accumulated motion". ── */
async function scenarioWindowedSwingIgnoresNoise(port: number, broadcastToMatch: Broadcast): Promise<void> {
  console.log('\nSCENARIO 5  windowed swing does NOT fire on noise (bounded wiggle)');
  const matchId = 'pulse-check-swing-noise';
  const ws = await connect(`ws://127.0.0.1:${port}`);
  const received: Array<Record<string, unknown>> = [];
  ws.on('message', (raw) => {
    try {
      received.push(JSON.parse(raw.toString()) as Record<string, unknown>);
    } catch {
      /* ignore */
    }
  });
  send(ws, { type: 'hello', matchId, anonId: 'pc-noise-fan', side: 'home' });
  await sleep(150);

  const base = 2_000_000;
  broadcastToMatch(matchId, oddsMsg(0.5, 0.3, 0.2, base)); // baseline — window start
  received.length = 0;
  // oscillate ±0.03 around the baseline — comfortably under SWING_DELTA_MIN
  // (0.12) from the window start at every step, and the whole run stays well
  // inside SWING_WINDOW_MS so the baseline never ages out mid-test.
  const AMPLITUDE = 0.03;
  check('the noise amplitude stays under the threshold (this scenario is honestly noise, not a disguised swing)', AMPLITUDE < SWING_DELTA_MIN, `amplitude=${AMPLITUDE}`);
  for (let i = 1; i <= 30; i++) {
    const wiggle = AMPLITUDE * Math.sin(i); // bounded, non-monotonic — never accumulates
    const pHome = 0.5 + wiggle;
    const pAway = 0.7 - pHome;
    broadcastToMatch(matchId, oddsMsg(pHome, 0.3, pAway, base + i * 1_000));
  }
  await sleep(50);
  const swings = received.filter((m) => m.type === 'moment' && m.kind === 'swing');
  check('no swing moment opens across 30 bounded-noise ticks', swings.length === 0, JSON.stringify(swings));

  await closeAndWait(ws);
}

/* ── Scenario 6: sentiment — finalScore lands via the proven-reliable
 * override, and events dedupe by wire id — using the REAL capture. ─────── */
function scenarioSentimentFinalScoreAndDedup(): void {
  console.log('\nSCENARIO 6  sentiment: finalScore override + real-capture event dedup');
  const fx = fixtureInfo(CAPTURE_MATCH);
  if (!fx) throw new Error(`no fixtureInfo for ${CAPTURE_MATCH} — teams.ts changed?`);

  // 6a — dedup, fed the REAL capture (every message, real re-emissions included).
  const accReal = new SentimentAccumulator(CAPTURE_MATCH, fx);
  for (const m of capture.messages) accReal.onFeed(m as unknown as ServerMsg | FeedMsg);
  const recordReal = accReal.crystallize({ consensus: null, rooted: { home: 0, away: 0 } }, { serial: 1, editionSize: null, caption: CAPTURE_MATCH });
  const goalEvents = recordReal.events.filter((e) => e.kind === 'goal');
  const distinctGoalIds = new Set(goalEvents.map((e) => e.id));
  check(
    'real capture: each real goal id appears EXACTLY once in the crystallized events (no wire re-emission triplication)',
    goalEvents.length === distinctGoalIds.size && goalEvents.length === REAL_GOALS.length,
    `events=${goalEvents.length} distinct=${distinctGoalIds.size} expectedGoals=${REAL_GOALS.length}`,
  );

  // 6b — finalScore: reproduce the bug (no override, no 'score' message fed
  // at all → the accumulator's own tracker never lands the real final) then
  // prove the fix (override wins).
  const accNoScore = new SentimentAccumulator('pulse-check-sentiment', fx);
  accNoScore.onFeed({ type: 'ledger', msg: { type: 'event', ev: { id: 'x:1', kind: 'goal', side: 'home', minute: 10 } } } as unknown as ServerMsg | FeedMsg);
  const withoutOverride = accNoScore.crystallize({ consensus: null, rooted: { home: 0, away: 0 } }, { serial: 1, editionSize: null, caption: 'x' });
  check(
    'reproduced: with no score message fed and no override, finalScore stays at the untouched default (the bug)',
    withoutOverride.finalScore.home === 0 && withoutOverride.finalScore.away === 0,
    JSON.stringify(withoutOverride.finalScore),
  );
  const accWithOverride = new SentimentAccumulator('pulse-check-sentiment-2', fx);
  accWithOverride.onFeed({ type: 'ledger', msg: { type: 'event', ev: { id: 'x:1', kind: 'goal', side: 'home', minute: 10 } } } as unknown as ServerMsg | FeedMsg);
  const withOverride = accWithOverride.crystallize({ consensus: null, rooted: { home: 0, away: 0 } }, { serial: 1, editionSize: null, caption: 'x' }, { home: 2, away: 1 });
  check(
    'fixed: the finalScore override (predictLifecycle\'s proven-reliable score) lands the real final regardless of the accumulator\'s own tracking',
    withOverride.finalScore.home === 2 && withOverride.finalScore.away === 1,
    JSON.stringify(withOverride.finalScore),
  );
}

async function main(): Promise<void> {
  check('capture has at least 2 distinct real goal ledger events', REAL_GOALS.length >= 2, `found=${REAL_GOALS.length}`);
  check('capture has a real FULL_TIME status message', !!REAL_FULL_TIME, '');

  const { port, broadcastToMatch, close } = await bootServer();
  console.log(`[pulse-fix-check] server up on :${port}`);
  try {
    await scenarioGoalOpensAndDedupes(port, broadcastToMatch);
    await scenarioFullTimeOpensMoment(port, broadcastToMatch);
    await scenarioRevealTalliesRealReacts(port, broadcastToMatch);
    await scenarioWindowedSwingFiresOnDrift(port, broadcastToMatch);
    await scenarioWindowedSwingIgnoresNoise(port, broadcastToMatch);
    scenarioSentimentFinalScoreAndDedup();
  } finally {
    close();
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[pulse-fix-check] FATAL', err);
  process.exit(1);
});
