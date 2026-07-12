/**
 * MEMORY-EVICTION SOAK (the test that would have caught the OOM) — src/dev/,
 * NEVER imported by index.ts.
 *
 * Post-mortem: the stands service OOM-killed (exit 137, oom_killed) across a
 * 3-game/3-day live run on its 256 MB Fly guest because a finished match's
 * in-memory state was NEVER freed — the registry had no eviction and ~11
 * module-level per-match maps in server.ts each kept their entry forever, so a
 * long-lived process holding several finished matches climbed until the kernel
 * killed it. This soak is the regression proof that was missing: it drives
 * MULTIPLE matches through the REAL server (createStandsServer's
 * broadcastToMatch — the exact path both TXLINE and REPLAY ingest call) over
 * SIMULATED time (registry.sweepEvictions(nowMs) advanced past the grace
 * windows, no real sleeps) and asserts hard bounds on memory + state.
 *
 * Six parts:
 *   1. EVICTION CLEARS ALL STATE — 3 real-fixture matches fed to FULL_TIME in
 *      sequence; after the FT grace each is gone from the registry AND from
 *      EVERY per-match map (enumerated via server.ts's perMatchStateFootprint,
 *      the SAME list onEvict clears — so the check can't drift from the code).
 *      Also proves the grace is respected: a sweep BEFORE the window evicts
 *      nothing.
 *   2. A WATCHED MATCH IS NEVER EVICTED — a match with a real connected ws
 *      client survives a sweep run far past every grace window (the hard
 *      zero-clients gate).
 *   3. THE TWO-TIER RULE — a never-resolved but idle match is NOT evicted at
 *      the FT window, only at the (longer) idle window.
 *   4. JOIN BUFFERS STAY BOUNDED — thousands of odds/spells/pressure/events
 *      pumped into one match leave each ring buffer exactly at its cap.
 *   5. HEAP RETURNS NEAR BASELINE — the actual regression proof: eviction
 *      reclaims a round's per-match growth, and heapUsed does NOT climb
 *      monotonically across repeated feed→evict rounds (forced GC via v8).
 *   6. HONEST LATE JOIN — a join/claim against an EVICTED match never crashes
 *      and never fabricates live state: the registry entry is gone, the score
 *      snapshot is honestly undecided, and a real ws re-hello gets a fresh
 *      EMPTY room (no resurrected verdict), not a fabricated one.
 *
 * Hermetic: STANDS_DATA_DIR → a fresh temp dir, and the periodic snapshot +
 * auto-eviction timers are pushed out of the way (env below) BEFORE the server
 * module loads (snapshot.ts/registry.ts resolve their env at import time —
 * hence the dynamic import), so nothing races the explicit sweeps.
 *
 * Usage: npm run check:mem-evict  (runs under node --expose-gc via the script;
 * falls back to a v8 gc shim if the flag is absent).
 */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import v8 from 'node:v8';
import vm from 'node:vm';
import { WebSocket } from 'ws';

const CHECK_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rooot-mem-evict-check-'));
process.env.STANDS_DATA_DIR = CHECK_DATA_DIR;
// keep the auto timers out of the way — the check drives every sweep explicitly
// with an advanced clock, and doesn't want a 30 s periodic snapshot churning.
process.env.STANDS_EVICT_SWEEP_MS = String(60 * 60_000);
process.env.STANDS_SNAPSHOT_INTERVAL_MS = String(60 * 60_000);

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? '✓' : '✗ FAIL';
  if (!cond) failures++;
  console.log(`  ${mark}  ${label}${detail ? `  — ${detail}` : ''}`);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ── forced GC (so the heap assertion measures RETAINED memory, not
 * uncollected garbage). Prefer the real --expose-gc global; else a v8 shim. ── */
function resolveGc(): () => void {
  if (typeof (globalThis as { gc?: () => void }).gc === 'function') {
    return () => {
      (globalThis as { gc: () => void }).gc();
      (globalThis as { gc: () => void }).gc();
    };
  }
  try {
    v8.setFlagsFromString('--expose_gc');
    const g = vm.runInNewContext('gc') as () => void;
    return () => {
      g();
      g();
    };
  } catch {
    return () => {
      /* no gc available — the heap assertion uses generous slack */
    };
  }
}
const gc = resolveGc();
const heapMB = (): number => process.memoryUsage().heapUsed / 1048576;

/* ── message templates cloned from the REAL FRA-MAR capture (guaranteed-valid
 * wire shapes: real odds carry pHome/pDraw/pAway, real ledger events carry a
 * kind + id, real spells carry a possession side) — mutated for volume. ───── */
const CAPTURE_PATH = new URL('../../captures/premiere-fra-mar-18209181-919c9af.json', import.meta.url);
type AnyMsg = Record<string, any>;
const captureMsgs = (JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) as { messages: AnyMsg[] }).messages;
const findType = (t: string): AnyMsg | undefined => captureMsgs.find((m) => m && m.type === t);
const oddsT = findType('odds');
const spellT = findType('spell');
const ledgerT = captureMsgs.find((m) => m && m.type === 'ledger' && m.msg && m.msg.type === 'event');
const clone = <T>(o: T): T => structuredClone(o);

/** Real fixture ids from src/sentiment/teams.ts — each resolves a team identity
 * so the SentimentAccumulator actually materializes (and thus is a real entry
 * eviction has to clear). */
const FT_MATCHES = ['18175918', '18176123', '18179549'];
const LIVE_MATCH = '18185036';
const IDLE_MATCH = '18188721';
const BUFFER_MATCH = '18187298';
const HEAP_MATCHES = ['18192996', '18198205', '18193785'];

type Broadcast = (matchId: string, msg: unknown) => void;

function feedOdds(broadcast: Broadcast, matchId: string, n: number, gapMs = 1000): void {
  const base = 1_783_600_000_000;
  for (let i = 0; i < n; i++) {
    const o = clone(oddsT) as AnyMsg;
    o.tick.tMs = base + i * gapMs;
    o.tick.minute = Math.min(120, Math.floor((i * gapMs) / 60_000));
    broadcast(matchId, o);
  }
}
function feedLedger(broadcast: Broadcast, matchId: string, n: number, kind: string): void {
  for (let i = 0; i < n; i++) {
    const l = clone(ledgerT) as AnyMsg;
    l.msg.ev.id = `${matchId}:${kind}:${i}`;
    l.msg.ev.kind = kind;
    l.msg.ev.minute = Math.min(120, Math.floor(i / 30));
    broadcast(matchId, l);
  }
}
function feedSpells(broadcast: Broadcast, matchId: string, n: number): void {
  for (let i = 0; i < n; i++) {
    const s = clone(spellT) as AnyMsg;
    s.spell.tMs = 1_783_600_000_000 + i * 1000;
    broadcast(matchId, s);
  }
}
/** Score first (so predictLifecycle's FT branch has a real final score to grade
 * against), then odds volume, then the FULL_TIME status that resolves it. */
function driveToFullTime(broadcast: Broadcast, registry: any, matchId: string, oddsN: number): void {
  registry.getOrCreate(matchId); // ensure a MatchState — predictLifecycle bails without one
  broadcast(matchId, { type: 'score', ev: { home: 2, away: 1, minute: 90 } });
  feedOdds(broadcast, matchId, oddsN);
  broadcast(matchId, { type: 'status', ev: { phase: 'FULL_TIME', minute: 90 } });
}

async function main(): Promise<void> {
  check('capture sanity: odds + spell + ledger-event templates present', !!oddsT && !!spellT && !!ledgerT);
  if (!oddsT || !spellT || !ledgerT) {
    console.log('\n1 CHECK(S) FAILED — capture templates missing\n');
    process.exit(1);
  }

  // dynamic import so STANDS_DATA_DIR + the timer env are set before the server
  // (and its snapshot.ts / registry.ts) resolve them at module load.
  const server = await import('../server');
  const { createStandsServer, perMatchStateFootprint, joinBufferSizes, JOIN_BUFFER_CAPS, currentScoreSnapshot } = server;
  const { FT_EVICT_GRACE_MS, IDLE_EVICT_GRACE_MS } = await import('../registry');
  const { httpServer, registry, broadcastToMatch } = createStandsServer() as any;
  const broadcast = broadcastToMatch as Broadcast;
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const addr = httpServer.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  console.log(`[mem-evict-check] server up on :${port}, dataDir=${CHECK_DATA_DIR}`);
  console.log(`[mem-evict-check] grace: FT=${FT_EVICT_GRACE_MS / 1000}s idle=${IDLE_EVICT_GRACE_MS / 1000}s`);

  const openSockets: WebSocket[] = [];
  async function connectAndHello(matchId: string, anonId: string): Promise<WebSocket> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    openSockets.push(ws);
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    ws.send(JSON.stringify({ type: 'hello', matchId, anonId, side: 'home' }));
    await sleep(120);
    return ws;
  }

  const footprintAllFalse = (matchId: string): { ok: boolean; live: string[] } => {
    const fp = perMatchStateFootprint(matchId);
    const live = Object.entries(fp).filter(([, v]) => v).map(([k]) => k);
    return { ok: live.length === 0, live };
  };

  try {
    /* ═══ PART 1 — eviction clears ALL per-match state ═══════════════════ */
    console.log('\n── PART 1: three matches → FULL_TIME → evicted, every map cleared');
    for (const m of FT_MATCHES) driveToFullTime(broadcast, registry, m, 600);
    // all three resolved + populated
    for (const m of FT_MATCHES) {
      const fp = perMatchStateFootprint(m);
      check(`${m} resolved + populated before eviction`, fp.resolvedMatches && fp.finalScores && fp.accumulators && fp.joinSnapshots, JSON.stringify(fp));
    }
    const sizeBefore = registry.size();

    // a sweep BEFORE the FT grace elapses evicts NOTHING (grace respected)
    registry.sweepEvictions(Date.now() + FT_EVICT_GRACE_MS - 60_000);
    check('sweep just BEFORE the FT grace evicts nothing', registry.size() === sizeBefore, `size=${registry.size()} (was ${sizeBefore})`);

    // a sweep PAST the FT grace evicts all three
    registry.sweepEvictions(Date.now() + FT_EVICT_GRACE_MS + 60_000);
    check('registry match count dropped by 3 after the FT grace', registry.size() === sizeBefore - 3, `size=${registry.size()} (was ${sizeBefore})`);
    for (const m of FT_MATCHES) {
      check(`${m} gone from the registry`, registry.get(m) === undefined);
      const { ok, live } = footprintAllFalse(m);
      check(`${m} cleared from EVERY per-match map`, ok, live.length ? `still holding: ${live.join(', ')}` : 'all 11 empty');
    }

    /* ═══ PART 2 — a watched match is never evicted ═════════════════════ */
    console.log('\n── PART 2: a match with a connected client survives any sweep');
    driveToFullTime(broadcast, registry, LIVE_MATCH, 300); // even resolved…
    await connectAndHello(LIVE_MATCH, 'watcher-1'); // …but a real client is watching
    check('live match has a client', registry.get(LIVE_MATCH)?.presenceCount() === 1, `presence=${registry.get(LIVE_MATCH)?.presenceCount()}`);
    registry.sweepEvictions(Date.now() + IDLE_EVICT_GRACE_MS + 60_000); // far past every window
    check('watched match NOT evicted despite a far-future sweep (zero-clients gate)', registry.get(LIVE_MATCH) !== undefined && perMatchStateFootprint(LIVE_MATCH).joinSnapshots);

    /* ═══ PART 3 — the two-tier rule (resolved vs idle) ═════════════════ */
    console.log('\n── PART 3: a never-resolved idle match evicts only at the idle window');
    registry.getOrCreate(IDLE_MATCH);
    feedOdds(broadcast, IDLE_MATCH, 50); // some feed, never a FULL_TIME
    check('idle match is unresolved but present', !perMatchStateFootprint(IDLE_MATCH).resolvedMatches && registry.get(IDLE_MATCH) !== undefined);
    registry.sweepEvictions(Date.now() + FT_EVICT_GRACE_MS + 60_000); // past FT grace, under idle grace
    check('unresolved match NOT evicted at the FT window (only resolved matches evict that early)', registry.get(IDLE_MATCH) !== undefined);
    registry.sweepEvictions(Date.now() + IDLE_EVICT_GRACE_MS + 60_000); // past the idle window
    check('unresolved match evicted at the idle window', registry.get(IDLE_MATCH) === undefined && footprintAllFalse(IDLE_MATCH).ok);

    /* ═══ PART 4 — join buffers stay bounded ═══════════════════════════ */
    console.log('\n── PART 4: join-replay ring buffers stay at their caps under a flood');
    registry.getOrCreate(BUFFER_MATCH);
    feedOdds(broadcast, BUFFER_MATCH, 3000, 13_000); // >12 s gap → every tick kept → hits the odds cap
    feedSpells(broadcast, BUFFER_MATCH, 3000);
    feedLedger(broadcast, BUFFER_MATCH, 3000, 'danger'); // → pressureHistory
    feedLedger(broadcast, BUFFER_MATCH, 2000, 'substitution'); // → eventHistory
    const sizes = joinBufferSizes(BUFFER_MATCH)!;
    check(`oddsHistory bounded (${sizes.odds} ≤ ${JOIN_BUFFER_CAPS.odds})`, sizes.odds <= JOIN_BUFFER_CAPS.odds && sizes.odds === JOIN_BUFFER_CAPS.odds, `len=${sizes.odds}`);
    check(`spellHistory bounded (${sizes.spells} ≤ ${JOIN_BUFFER_CAPS.spells})`, sizes.spells <= JOIN_BUFFER_CAPS.spells && sizes.spells === JOIN_BUFFER_CAPS.spells, `len=${sizes.spells}`);
    check(`pressureHistory bounded (${sizes.pressure} ≤ ${JOIN_BUFFER_CAPS.pressure})`, sizes.pressure <= JOIN_BUFFER_CAPS.pressure && sizes.pressure === JOIN_BUFFER_CAPS.pressure, `len=${sizes.pressure}`);
    check(`eventHistory bounded (${sizes.events} ≤ ${JOIN_BUFFER_CAPS.events})`, sizes.events <= JOIN_BUFFER_CAPS.events && sizes.events === JOIN_BUFFER_CAPS.events, `len=${sizes.events}`);
    // clean it up so it doesn't skew the heap baseline
    registry.sweepEvictions(Date.now() + IDLE_EVICT_GRACE_MS + 60_000);

    /* ═══ PART 5 — heap returns near baseline (the regression proof) ════ */
    console.log('\n── PART 5: heapUsed reclaimed on eviction + flat across rounds');
    const ODDS_PER = 5000;
    const ROUNDS = 5;
    // warm-up round (JIT + lazy allocs settle) then baseline
    for (const m of HEAP_MATCHES) driveToFullTime(broadcast, registry, m, ODDS_PER);
    registry.sweepEvictions(Date.now() + FT_EVICT_GRACE_MS + 60_000);
    await sleep(50);
    gc();
    const baseline = heapMB();

    // one round watched closely: grow (before evict) then reclaim (after evict)
    for (const m of HEAP_MATCHES) driveToFullTime(broadcast, registry, m, ODDS_PER);
    gc();
    const peak = heapMB();
    registry.sweepEvictions(Date.now() + FT_EVICT_GRACE_MS + 60_000);
    gc();
    const afterEvict = heapMB();
    const grew = peak - baseline;
    const retained = afterEvict - baseline;
    check('feeding 3 heavy matches grew the heap meaningfully', grew > 1, `+${grew.toFixed(1)} MB before eviction`);
    check('eviction reclaimed the bulk of that growth (retained < 50% of peak growth)', retained < grew * 0.5 + 0.5, `retained=${retained.toFixed(1)} MB of ${grew.toFixed(1)} MB`);

    // many rounds: heap must NOT climb monotonically (the OOM signature)
    const series: number[] = [];
    for (let r = 0; r < ROUNDS; r++) {
      for (const m of HEAP_MATCHES) driveToFullTime(broadcast, registry, m, ODDS_PER);
      registry.sweepEvictions(Date.now() + FT_EVICT_GRACE_MS + 60_000);
      gc();
      series.push(heapMB());
    }
    check('registry empty of heap matches after each round', HEAP_MATCHES.every((m) => registry.get(m) === undefined));
    const climb = (series[series.length - 1] ?? 0) - (series[0] ?? 0);
    // With eviction the series is flat (± GC noise); a per-round leak of ~3
    // matches × ~5000 odds would climb several MB PER ROUND. 5 MB across 5
    // rounds is comfortably below a real leak and above GC jitter.
    check(
      `heap did NOT climb across ${ROUNDS} feed→evict rounds (Δ ${climb.toFixed(1)} MB)`,
      climb < 5,
      `series MB=[${series.map((x) => x.toFixed(1)).join(', ')}] baseline=${baseline.toFixed(1)}`,
    );
    console.log(`[mem-evict-check] heap MB: baseline=${baseline.toFixed(1)} peak=${peak.toFixed(1)} afterEvict=${afterEvict.toFixed(1)} rounds=[${series.map((x) => x.toFixed(1)).join(', ')}]`);

    /* ═══ PART 6 — honest late join to an evicted match ════════════════ */
    console.log('\n── PART 6: a join/claim against an evicted match is honest, never a crash');
    const dead = FT_MATCHES[0]!; // evicted back in PART 1
    check('evicted match: registry entry gone', registry.get(dead) === undefined);
    check('evicted match: every per-match map still empty', footprintAllFalse(dead).ok);
    const snap = currentScoreSnapshot(dead);
    check('evicted match: score snapshot is honestly UNDECIDED (no fabricated 0–0 decided)', snap.decided === false, JSON.stringify(snap));
    // a real re-hello must not crash and must give a FRESH EMPTY room — no
    // resurrected verdict, no decided score fabricated from thin air.
    const rejoin = await connectAndHello(dead, 'late-returner');
    check('evicted match: a real re-hello round-trips without crashing the server', rejoin.readyState === WebSocket.OPEN);
    const reborn = registry.get(dead);
    check('evicted match: re-hello yields a fresh EMPTY room (honest, not fabricated)', !!reborn && reborn.presenceCount() === 1 && reborn.verdictFor('late-returner') === undefined && currentScoreSnapshot(dead).decided === false);
  } finally {
    for (const ws of openSockets) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    registry.stop?.();
    httpServer.close();
    rmSync(CHECK_DATA_DIR, { recursive: true, force: true });
  }

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[mem-evict-check] FATAL', err);
  process.exit(1);
});
