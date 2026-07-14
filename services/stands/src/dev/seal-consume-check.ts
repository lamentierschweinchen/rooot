/**
 * SEAL CONSUME CHECK (fix-forward gate) — proves the server HALF of tonight's
 * delta-review Bug E: a late Collect after eviction must not be refused.
 *
 * The bug (scratchpad/sdd/delta-review.md, finding E): `/seat/claim`'s FULL-TIME
 * gate reads `currentScoreSnapshot(matchId)` (server.ts) — memory-only:
 * `resolvedMatches`/`finalScores`/the join-snapshot score cache. `onEvict`
 * (registry.ts's eviction seam) clears all three together, so a match that
 * finished, then sat with zero watchers past the FT grace, looks in-memory
 * EXACTLY like one that never started. A fan who opens a share link after that
 * point sends a fresh `hello`, which resurrects an EMPTY, unresolved MatchState
 * (registry.ts's getOrCreate — review risk A3), so `currentScoreSnapshot` returns
 * `decided:false` and `mintScarfForClaim` refuses at its honesty gate
 * (seat/mint-scarf.ts:105) BEFORE the idempotency check (seat/mint-scarf.ts:111)
 * even runs. Two casualties: a legit late Collect never mints, AND a fan who
 * ALREADY minted earlier gets `mint:null` back instead of their existing scarf
 * (the marker is real, on disk — the gate never lets the code reach it).
 *
 * The fix: `currentScoreSnapshot` falls back to `latestSentimentRecordOnDisk`
 * (the SAME durable record the seal-on-join path already trusts — crystallized
 * once at FULL_TIME, outliving both eviction and a restart) before reporting
 * undecided. The honesty gate stays intact: no disk record + no memory ⇒ still
 * `decided:false` — a genuinely live or never-seen match is never fabricated.
 *
 * Cases:
 *   1. RED→GREEN — a match reaches FULL_TIME (crystallizes one sentiment record
 *      on disk, real score 2–1), a fan's mint marker is SEEDED directly through
 *      the real store writer (seat/minted-store.ts — stands in for "already
 *      minted in an earlier claim/process", the same stub convention
 *      src/dev/seat-check.ts uses for its idempotency case; no real mint is ever
 *      attempted by this check — AGENTS.md forbids real transactions from dev
 *      checks). The match is then evicted (registry.sweepEvictions, forced past
 *      the FT grace — mem-evict-check.ts's proven mechanism) with zero clients
 *      ever having watched it, so nothing blocks the sweep. Assert (a) the unit
 *      fix directly: currentScoreSnapshot reports the REAL decided score, read
 *      off disk, memory being genuinely cold; (b) the full HTTP path: a FRESH
 *      socket joins (hello resurrects the match — the exact repro), requests a
 *      claim token, and POSTs /seat/claim — the response carries the fan's
 *      EXISTING scarf (mint.asset === the seeded marker), not null. RED on main
 *      (mint:null despite the marker sitting right there on disk); GREEN with
 *      the fix. Never touches the network either way (proven by wall-clock
 *      timing) — the idempotency marker short-circuits before getMintRuntime().
 *   2. NEGATIVE — a genuinely unresolved (live) match is NEVER fabricated a
 *      score, before OR after an eviction-grade sweep past every grace window:
 *      no sentiment record was ever crystallized (no FULL_TIME reached), so the
 *      disk fallback correctly finds nothing and currentScoreSnapshot keeps
 *      reporting decided:false — a live-match claim stays mint:null throughout,
 *      exactly as it did before this fix (the fix only ADDS a disk fallback, it
 *      never loosens the "genuinely resolved" requirement).
 *
 * Usage: tsx src/dev/seal-consume-check.ts (or: npm run check:seal-consume)
 */
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Keypair } from '@solana/web3.js';
import { WebSocket } from 'ws';
import type { FeedMsg } from '@contracts/feed';
import type { SeatTokenGrantMsg, ServerMsg } from '@contracts/crowd';

// ── env FIRST, before any dynamic import of the server (snapshot.ts / minted-
// store.ts resolve DATA_DIR / ROOOT_SEAT_DIR at import time — same idiom as
// seal-on-join-check.ts / seat-check.ts). ──────────────────────────────────
const CHECK_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'rooot-seal-consume-'));
process.env.STANDS_DATA_DIR = CHECK_DATA_DIR;
process.env.STANDS_SNAPSHOT_PATH = path.join(CHECK_DATA_DIR, 'snapshot.json');
process.env.STANDS_SNAPSHOT_INTERVAL_MS = String(60 * 60_000); // no periodic churn
process.env.STANDS_EVICT_SWEEP_MS = String(60 * 60_000); // the check drives sweeps explicitly
process.env.ROOOT_SEAT_DIR = path.join(CHECK_DATA_DIR, 'seat');
// Devnet isolation (same convention as seat-check.ts / mem-evict-check.ts):
// strip RELAYER_KEYPAIR + point RELAYER_KEYPAIR_FILE at a nonexistent path so
// crystallize's fire-and-forget anchor can NEVER attempt a real devnet tx.
delete process.env.RELAYER_KEYPAIR;
process.env.RELAYER_KEYPAIR_FILE = path.join(CHECK_DATA_DIR, 'no-such-keypair.json');
process.env.SELF_PROBE_DISABLE = '1';

const SENTIMENT_DIR = path.join(CHECK_DATA_DIR, 'sentiment');

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? '✓' : '✗ FAIL';
  if (!cond) failures++;
  console.log(`  ${mark}  ${label}${detail ? `  — ${detail}` : ''}`);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function recordFilesFor(matchId: string): string[] {
  try {
    return readdirSync(SENTIMENT_DIR).filter((f) => f.startsWith(`${matchId}-`) && f.endsWith('.json'));
  } catch {
    return [];
  }
}
function freshPubkey(): string {
  return Keypair.generate().publicKey.toBase58();
}

async function main(): Promise<void> {
  const { createStandsServer, currentScoreSnapshot, perMatchStateFootprint } = await import('../server');
  const { FT_EVICT_GRACE_MS, IDLE_EVICT_GRACE_MS } = await import('../registry');
  const { loadMintMarker, saveMintMarker } = await import('../seat/minted-store');

  const srv = createStandsServer();
  const { httpServer, registry } = srv;
  const broadcast = srv.broadcastToMatch;
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const addr = httpServer.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;
  console.log(`[seal-consume] server up on :${port}, dataDir=${CHECK_DATA_DIR}`);

  const openSockets: WebSocket[] = [];

  function connect(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      openSockets.push(ws);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  }
  function send(ws: WebSocket, msg: unknown): void {
    ws.send(JSON.stringify(msg));
  }
  function closeAndWait(ws: WebSocket): Promise<void> {
    return new Promise((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
      ws.once('close', () => resolve());
      ws.close();
    });
  }
  /** The real token ceremony (contracts/crowd.ts): hello (adopt the session
   * identity — this is what resurrects an evicted match via registry.ts's
   * getOrCreate) → seatToken → grant. Mirrors seat-check.ts's helper exactly. */
  function requestToken(ws: WebSocket, matchId: string, anonId: string, waitMs = 2000): Promise<string | null> {
    return new Promise((resolve) => {
      const onMessage = (raw: Buffer) => {
        let m: ServerMsg;
        try {
          m = JSON.parse(raw.toString()) as ServerMsg;
        } catch {
          return;
        }
        if (m.type === 'seatTokenGrant') {
          const g = m as SeatTokenGrantMsg;
          cleanup();
          resolve(g.token);
        }
      };
      const timer = setTimeout(() => {
        cleanup();
        resolve(null);
      }, waitMs);
      function cleanup(): void {
        clearTimeout(timer);
        ws.off('message', onMessage);
      }
      ws.on('message', onMessage);
      send(ws, { type: 'seatToken', matchId, anonId });
    });
  }
  async function helloAndToken(matchId: string, anonId: string): Promise<string | null> {
    const ws = await connect();
    send(ws, { type: 'hello', matchId, anonId, side: 'home' });
    await sleep(150); // let the hello land (and, post-eviction, resurrect the match) before requesting a token
    return requestToken(ws, matchId, anonId);
  }
  async function postClaim(body: unknown): Promise<{ status: number; body: any }> {
    const res = await fetch(`${base}/seat/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  }

  try {
    /* ═════ case 1 — RED→GREEN: late Collect after eviction ═══════════════ */
    console.log('[seal-consume] case 1: a match finishes, evicts (zero watchers), then a late Collect must not be refused');
    const MATCH_E = '18175918'; // real fixture id (ARG–CPV), same convention as seal-on-join-check.ts
    registry.getOrCreate(MATCH_E); // predictLifecycle's FULL_TIME branch needs the match in the registry
    const now = Date.now();
    const feed: FeedMsg[] = [
      { type: 'status', ev: { tMs: now, phase: 'FIRST_HALF', minute: 0, source: 'replay' } },
      { type: 'score', ev: { tMs: now + 1, minute: 90, home: 2, away: 1, source: 'replay' } },
      { type: 'status', ev: { tMs: now + 2, phase: 'FULL_TIME', minute: 90, source: 'replay' } },
    ];
    for (const m of feed) broadcast(MATCH_E, m);
    await sleep(150); // let crystallize's synchronous disk write land

    const filesBefore = recordFilesFor(MATCH_E);
    check('setup: FULL_TIME crystallized exactly one sentiment record on disk', filesBefore.length === 1, `files=${JSON.stringify(filesBefore)}`);
    check('setup: currentScoreSnapshot is decided + real BEFORE eviction (sanity)', currentScoreSnapshot(MATCH_E).decided === true && currentScoreSnapshot(MATCH_E).home === 2 && currentScoreSnapshot(MATCH_E).away === 1);

    // Seed a mint marker through the REAL store writer — stands in for "this fan already
    // minted their scarf" WITHOUT a real devnet mint (forbidden from an automated check).
    const pubkeyE = freshPubkey();
    const seeded = { asset: 'SealConsumeSeededScarf1111111111111111111', txUrl: 'https://explorer.solana.com/tx/seal-consume-seeded?cluster=devnet', mintedAtMs: Date.now() };
    saveMintMarker(pubkeyE, MATCH_E, seeded);
    check('setup: the seeded marker round-trips through the real store', loadMintMarker(pubkeyE, MATCH_E)?.asset === seeded.asset);

    // Evict — nobody ever watched this match (broadcast() alone drove it to FULL_TIME),
    // so the zero-clients gate is already satisfied; sweep past the FT grace.
    registry.sweepEvictions(Date.now() + FT_EVICT_GRACE_MS + 60_000);
    check('evicted: registry entry gone', registry.get(MATCH_E) === undefined);
    const footprint = perMatchStateFootprint(MATCH_E);
    const stillLive = Object.entries(footprint).filter(([, v]) => v).map(([k]) => k);
    check('evicted: EVERY per-match map cleared (resolvedMatches/finalScores/joinSnapshots/…) — memory is genuinely cold', stillLive.length === 0, stillLive.length ? `still holding: ${stillLive.join(', ')}` : 'all clear');
    check('evicted: the sentiment record FILE survives untouched on disk', recordFilesFor(MATCH_E).length === 1, `files=${JSON.stringify(recordFilesFor(MATCH_E))}`);

    // THE UNIT FIX, directly: memory is cold, so this MUST come from the disk fallback.
    const postEvictSnap = currentScoreSnapshot(MATCH_E);
    check(
      'RED→GREEN (unit): currentScoreSnapshot is STILL decided with the REAL score after eviction (disk fallback)',
      postEvictSnap.decided === true && postEvictSnap.home === 2 && postEvictSnap.away === 1,
      `snapshot=${JSON.stringify(postEvictSnap)}`,
    );

    // THE FULL HTTP PATH: a fresh fan joins (hello resurrects the match — the exact repro),
    // gets a claim token, and claims. A returning fan (marker already seeded) must get their
    // EXISTING scarf back, not null.
    const token = await helloAndToken(MATCH_E, 'seal-consume-fan-e');
    check('setup: a fresh post-eviction hello + seatToken request succeeds', typeof token === 'string' && token.length > 0, `token=${token ? 'granted' : 'null'}`);
    check('a post-eviction hello resurrects the match in the registry (review risk A3 — the expected shape)', registry.get(MATCH_E) !== undefined);

    const t0 = Date.now();
    const claim = await postClaim({ token, pubkey: pubkeyE, method: 'passkey' });
    const claimMs = Date.now() - t0;
    check('late Collect after eviction -> 200', claim.status === 200, `status=${claim.status} body=${JSON.stringify(claim.body)}`);
    check(
      'RED→GREEN (end-to-end): the response carries the EXISTING scarf (mint.asset === the seeded marker), NOT null',
      claim.body?.mint?.asset === seeded.asset && claim.body?.mint?.txUrl === seeded.txUrl,
      `mint=${JSON.stringify(claim.body?.mint)}`,
    );
    check('…no mintNote fabricated alongside a successful mint', claim.body?.mintNote === undefined, `mintNote=${JSON.stringify(claim.body?.mintNote)}`);
    check('…and NO network was ever touched (idempotency marker short-circuits before getMintRuntime — well under a real RPC/Irys round-trip)', claimMs < 2000, `${claimMs}ms`);

    /* ═════ case 2 — negative: a genuinely unresolved match is never fabricated ═ */
    console.log('[seal-consume] case 2: a genuinely LIVE (unresolved) match stays refused, before AND after an eviction-grade sweep — never fabricated');
    const MATCH_LIVE = '18176123'; // a different real fixture id (AUS–EGY) — no FULL_TIME ever dispatched
    registry.getOrCreate(MATCH_LIVE);
    const liveFeed: FeedMsg[] = [
      { type: 'status', ev: { tMs: Date.now(), phase: 'SECOND_HALF', minute: 60, source: 'replay' } },
      { type: 'score', ev: { tMs: Date.now() + 1, minute: 60, home: 1, away: 0, source: 'replay' } },
    ];
    for (const m of liveFeed) broadcast(MATCH_LIVE, m);
    await sleep(80);
    check('setup: no sentiment record exists on disk for the unresolved match', recordFilesFor(MATCH_LIVE).length === 0, `files=${JSON.stringify(recordFilesFor(MATCH_LIVE))}`);
    check('a live match is honestly undecided BEFORE any eviction sweep', currentScoreSnapshot(MATCH_LIVE).decided === false, JSON.stringify(currentScoreSnapshot(MATCH_LIVE)));

    const liveToken = await helloAndToken(MATCH_LIVE, 'seal-consume-fan-live');
    const liveClaim = await postClaim({ token: liveToken, pubkey: freshPubkey(), method: 'passkey' });
    check('a mid-match claim -> 200 with mint:null (the honesty gate, unaffected by the fix)', liveClaim.status === 200 && liveClaim.body?.mint === null, `status=${liveClaim.status} mint=${JSON.stringify(liveClaim.body?.mint)}`);

    // Sweep past EVERY grace window (FT and idle) — this unresolved match must evict too, and
    // MUST NOT come back decided just because it now looks like the case-1 shape. First close
    // every open socket (case 1's resurrected fan + case 2's own hello above) — sweepEvictions'
    // hard zero-clients gate (registry.ts:338-341) would otherwise refuse to evict a watched match.
    for (const ws of openSockets) await closeAndWait(ws);
    await sleep(80);
    registry.sweepEvictions(Date.now() + IDLE_EVICT_GRACE_MS + 60_000);
    check('the unresolved match also evicts at the idle window', registry.get(MATCH_LIVE) === undefined);
    const postEvictLiveSnap = currentScoreSnapshot(MATCH_LIVE);
    check(
      'NEGATIVE: still decided:false after eviction — no disk record exists, so the fallback finds nothing and NEVER fabricates a score',
      postEvictLiveSnap.decided === false,
      `snapshot=${JSON.stringify(postEvictLiveSnap)}`,
    );
    const liveToken2 = await helloAndToken(MATCH_LIVE, 'seal-consume-fan-live-2');
    const liveClaim2 = await postClaim({ token: liveToken2, pubkey: freshPubkey(), method: 'passkey' });
    check('…and a fresh claim after that eviction stays mint:null too (never a fabricated scarf for an unfinished match)', liveClaim2.status === 200 && liveClaim2.body?.mint === null, `status=${liveClaim2.status} mint=${JSON.stringify(liveClaim2.body?.mint)}`);
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
  console.error('[seal-consume] FATAL', err);
  process.exit(1);
});
