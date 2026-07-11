/**
 * Dev-only verification script (NOT part of the service — never imported by
 * src/index.ts) for the YOUR SEAT reconciliation (docs/HANDOFF-2026-07-10-
 * coordinator-session.md §5) + its review fixes (session-bound claim tokens,
 * mint idempotency, restart-safe final scores). Five parts, each independently
 * gated so a missing optional dependency (a DAS RPC) SKIPs honestly rather
 * than failing:
 *
 *   1. /seat/claim + /seat/me round-trip — through the REAL token ceremony
 *      (WS hello → seatToken → grant → HTTP claim) — and profile persistence
 *      ACROSS A REAL PROCESS RESTART on the DATA_DIR volume path (two spawned
 *      child processes pointed at the same STANDS_DATA_DIR — mirrors
 *      restart-persistence-check.ts's convention exactly). The claimed match
 *      has no fixture identity and never reaches FULL_TIME, so the mint path
 *      is never approached.
 *   2. CLAIM-TOKEN SECURITY (review fix, risk 2) + the mint HONESTY GATE +
 *      MINT IDEMPOTENCY (review fix, risk 3) + POST-RESTART TRUE SCORE
 *      (review merge-gate), one data dir:
 *      - a session can only obtain a token for its OWN adopted anonId+matchId
 *        (mismatched requests get silence, like a cheer for the wrong match);
 *      - a claim with a forged / reused / expired / absent token is rejected
 *        401 (expiry driven by a real SEAT_TOKEN_TTL_MS-shortened TTL wait);
 *      - the harvest attack is dead: another session's token + a smuggled
 *        body anonId still binds the TOKEN's fan, never the named one;
 *      - a legit claim for a real but NOT-YET-FULL_TIME match returns
 *        mint:null fast (the gate short-circuits before any network) while
 *        still resolving profile.sides to the team TRICODE;
 *      - after the match REALLY reaches FULL_TIME (driven through the same
 *        broadcastToMatch path the live ingest uses), a fan holding a durable
 *        minted marker gets the EXISTING asset back on every claim — checked
 *        BEFORE getMintRuntime() (proven by timing: no RPC/Irys latency) —
 *        two sequential claims, one asset, zero new mints;
 *      - the immediate post-FT snapshot carries the resolution-time
 *        finalScore (v6) and currentScoreSnapshot serves it live; a CHILD
 *        process restarted on the SAME data dir restores it, and a fresh
 *        fan's FIRST claim (no marker) reaches the real mint path carrying
 *        the TRUE final score — proven by the pre-mint score log line, with
 *        EVERY mint endpoint (RPC + Irys) aimed at an unroutable localhost
 *        port so the attempt can never become a real transaction (the claim
 *        honestly returns mint:null when that attempt fails — the assertion
 *        is the score it attempted with, never 0–0).
 *   3. REFUSE-DON'T-FABRICATE (review merge-gate, the belt): a DOCTORED v5
 *      snapshot (resolved flag hand-crafted, NO finalScore — exactly the
 *      shape of a pre-v6 production snapshot) boots a child whose claim gets
 *      200 + mint:null + a plain retryable mintNote, and the logs prove the
 *      mint path was NEVER entered — a "Full-time 0–0" scarf cannot exist.
 *   4. mint ATTRIBUTE SHAPING — pure, no server, no network: scarfFactsFor +
 *      buildScarfAttributes against a REAL 3-state verdict computed by
 *      MatchState.resolvePredictions (exact / outcome / wrong), plus the
 *      never-predicted case (call/result genuinely absent, never invented).
 *   5. /seat/album's DAS path, gated on HELIUS_RPC_URL — SKIPPED with a named
 *      reason when unset (the public devnet RPC has no DAS getAssetsByOwner
 *      index); when set, one real READ (not a transaction) against a
 *      never-used pubkey.
 *
 * What this deliberately does NOT do: complete a real mint. The idempotency
 * scenario SEEDS the durable marker through the real seat/minted-store.ts
 * writer, and the post-restart scenario aims the mint runtime at unroutable
 * localhost endpoints — an unguarded post-FULL_TIME claim against real
 * endpoints would exercise a real devnet RPC/Irys/mint-transaction path,
 * which the reconciliation plan explicitly forbids from an automated check
 * ("NO real transactions from dev checks"). The REAL first-mint path
 * (unseeded → one on-chain mint → second claim returns the same asset →
 * album shows ONE scarf) is covered by the manual devnet proof,
 * src/dev/prove-claim-mint.ts (npm run prove:claim-mint).
 *
 * Usage: tsx src/dev/seat-check.ts (or: npm run check:seat)
 */
import { type ChildProcessByStdio, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@solana/web3.js';
import { WebSocket } from 'ws';
import type { ClientMsg, SeatTokenGrantMsg, ServerMsg } from '@contracts/crowd';

function log(tag: string, msg: string): void {
  console.log(`[seat-check:${tag}] ${msg}`);
}

interface Assertion { desc: string; pass: boolean; detail: string; }
const assertions: Assertion[] = [];
function assert(desc: string, pass: boolean, detail: string): void {
  assertions.push({ desc, pass, detail });
  log(pass ? 'PASS' : 'FAIL', `${desc} — ${detail}`);
}
function skip(desc: string, reason: string): void {
  log('SKIP', `${desc} — ${reason}`);
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
    if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
    ws.once('close', () => resolve());
    ws.close();
  });
}
function freshPubkey(): string {
  return Keypair.generate().publicKey.toBase58();
}

/** Request a claim token on an ALREADY-OPEN, already-helloed socket, for
 * whatever matchId/anonId the request names (deliberately not forced to match
 * the session — the mismatch tests depend on being able to ask wrongly).
 * Resolves the granted token, or null if no grant arrives within waitMs
 * (the server's silent-drop path for requests outside the session identity). */
function requestToken(ws: WebSocket, matchId: string, anonId: string, waitMs = 700): Promise<string | null> {
  return new Promise((resolve) => {
    const onMessage = (raw: Buffer | ArrayBuffer | Buffer[]) => {
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

/** The full legit ceremony against a server URL: fresh socket → hello (adopt
 * the session identity, optional side) → seatToken → grant → close. This is
 * exactly what apps/web/public/seat-adapter.js's requestSeatToken does. */
async function getSeatToken(wsUrl: string, matchId: string, anonId: string, side?: 'home' | 'away'): Promise<string> {
  const ws = await connect(wsUrl);
  try {
    send(ws, { type: 'hello', matchId, anonId, ...(side ? { side } : {}) });
    const token = await requestToken(ws, matchId, anonId, 2000);
    if (!token) throw new Error(`no seatTokenGrant within 2s for ${anonId}@${matchId}`);
    return token;
  } finally {
    await closeAndWait(ws);
  }
}

async function postClaim(base: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}/seat/claim`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

/* ── spawn a real child process (mirrors verdict-replay-check.ts's bootServer) ── */
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
    const proc = spawn(TSX_BIN, ['src/index.ts'], { cwd: STANDS_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
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
    proc.kill('SIGKILL');
  });
}

/* ── part 1: token-ceremony claim + /seat/me, profile persists across a real restart ── */
async function partPersistence(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-seat-check-'));
  const pubkey = freshPubkey();
  const anonId = 'seat-check-persistence-fan';
  // Not in FIXTURE_INFO and never driven to FULL_TIME — the mint path stops at its gates
  // (no decided flag, no fixture identity) without ever reaching the network.
  const MATCH_ID = 'seat-check-persist-match';
  log('persistence', `dataDir=${dataDir} pubkey=${pubkey.slice(0, 8)}…`);
  try {
    const boot1 = await bootServer({ STANDS_DATA_DIR: dataDir, ROOOT_SEAT_DIR: undefined });
    log('boot1', `up on port ${boot1.port}`);
    const base1 = `http://127.0.0.1:${boot1.port}`;

    // the REAL ceremony, exactly as seat-adapter.js runs it: hello → seatToken → grant → claim.
    const token = await getSeatToken(`ws://127.0.0.1:${boot1.port}`, MATCH_ID, anonId);
    const claim = await postClaim(base1, { token, pubkey, method: 'passkey' });
    assert('token-ceremony claim -> 200', claim.status === 200, `status=${claim.status} body=${JSON.stringify(claim.body)}`);
    assert('a claim on a never-finished, fixtureless match attempts no mint', claim.body.mint === null, `mint=${JSON.stringify(claim.body.mint)}`);
    assert('claim response profile carries the claimed pubkey', claim.body.profile?.pubkey === pubkey, `profile=${JSON.stringify(claim.body.profile)}`);
    assert('an unrooted fan gets no side/tricode invented', Array.isArray(claim.body.profile?.sides) && claim.body.profile.sides.length === 0, `sides=${JSON.stringify(claim.body.profile?.sides)}`);

    const meRes1 = await fetch(`${base1}/seat/me?pubkey=${pubkey}`);
    const meBody1 = (await meRes1.json()) as { profile?: { pubkey?: string } };
    assert('/seat/me on boot1 reads back the just-claimed profile', meBody1.profile?.pubkey === pubkey, `profile=${JSON.stringify(meBody1.profile)}`);

    await killHard(boot1.proc);
    log('boot1', 'killed (SIGKILL — a hard restart, not a clean shutdown)');

    // Prove the profile actually landed on the DATA_DIR volume path (services/stands/src/
    // snapshot.ts's DATA_DIR, seat/profile-store.ts's DIR = path.join(DATA_DIR,'seat')) —
    // not an ephemeral/process-local location — BEFORE booting the second process, so this
    // assertion can only be explained by the file genuinely being on disk.
    let onDisk: string[] = [];
    try { onDisk = readdirSync(path.join(dataDir, 'seat')); } catch { /* asserted below */ }
    assert('the profile file lives under STANDS_DATA_DIR/seat (the volume path, not /tmp)', onDisk.some((f) => f === `${pubkey}.json`), `dataDir/seat entries=${JSON.stringify(onDisk)}`);

    const boot2 = await bootServer({ STANDS_DATA_DIR: dataDir, ROOOT_SEAT_DIR: undefined });
    log('boot2', `up on port ${boot2.port} (fresh process, same dataDir, zero shared memory with boot1)`);
    const base2 = `http://127.0.0.1:${boot2.port}`;

    const meRes2 = await fetch(`${base2}/seat/me?pubkey=${pubkey}`);
    const meBody2 = (await meRes2.json()) as { profile?: { pubkey?: string; since?: number } };
    assert(
      'after a full process restart, /seat/me STILL returns the profile — sourced from disk, not memory',
      meBody2.profile?.pubkey === pubkey,
      `profile=${JSON.stringify(meBody2.profile)}`,
    );
    assert('the restored profile matches the pre-restart one exactly', JSON.stringify(meBody2.profile) === JSON.stringify(meBody1.profile), `before=${JSON.stringify(meBody1.profile)} after=${JSON.stringify(meBody2.profile)}`);

    // tokens are in-memory session credentials — a restart must invalidate any pending one.
    const claimAcrossRestart = await postClaim(base2, { token, pubkey, method: 'passkey' });
    assert('a token issued by the PRE-restart process is dead after the restart (session credential, not durable state)', claimAcrossRestart.status === 401, `status=${claimAcrossRestart.status} body=${JSON.stringify(claimAcrossRestart.body)}`);

    await killHard(boot2.proc);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

/* ── part 2: claim-token security + the mint honesty gate + mint idempotency ── */
async function partTokenGateIdempotency(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-seat-check-gate-'));
  process.env.STANDS_DATA_DIR = dataDir;
  process.env.ROOOT_SEAT_DIR = path.join(dataDir, 'seat');
  // Short REAL TTL so the expiry test waits ~2s, not ~2min — the env-tunable
  // knob exists for exactly this (server.ts's seatTokenTtlMs, floored at 1s).
  // Set BEFORE the first dynamic import of ../server: the TTL (and the two
  // seat stores' dirs) are resolved at module load.
  process.env.SEAT_TOKEN_TTL_MS = '1500';
  const { createStandsServer } = await import('../server');
  const { loadMintMarker, saveMintMarker } = await import('../seat/minted-store');
  const MATCH_ID = '18202783'; // SUI v COL — a real sentiment/teams.ts FIXTURE_INFO entry
  const fanA = 'seat-check-fan-a';
  const fanB = 'seat-check-fan-b';
  const fanC = 'seat-check-fan-c';
  const pubkeyA = freshPubkey();
  const pubkeyE = freshPubkey(); // the would-be harvester's key
  const pubkeyC = freshPubkey();

  const { httpServer, registry, broadcastToMatch } = createStandsServer();
  try {
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const addr = httpServer.address();
    if (addr === null || typeof addr === 'string') throw new Error('failed to bind an ephemeral port');
    const base = `http://127.0.0.1:${addr.port}`;
    const wsUrl = `ws://127.0.0.1:${addr.port}`;

    // fan A: the real thing — rooted home, locked call 2–1.
    const wsA = await connect(wsUrl);
    send(wsA, { type: 'hello', matchId: MATCH_ID, anonId: fanA, side: 'home' });
    await sleep(120);
    send(wsA, { type: 'predict', matchId: MATCH_ID, anonId: fanA, home: 2, away: 1, atMs: Date.now() });
    await sleep(120);

    /* ── token security: the request side ── */
    const wrongAnon = await requestToken(wsA, MATCH_ID, 'someone-else');
    assert('a session cannot obtain a token for a DIFFERENT anonId (silent drop, like a cheer for the wrong match)', wrongAnon === null, `granted=${JSON.stringify(wrongAnon)}`);
    const wrongMatch = await requestToken(wsA, 'some-other-match', fanA);
    assert('a session cannot obtain a token for a DIFFERENT matchId', wrongMatch === null, `granted=${JSON.stringify(wrongMatch)}`);
    const wsNoHello = await connect(wsUrl);
    const noSession = await requestToken(wsNoHello, MATCH_ID, fanA);
    assert('a socket that never helloed (no adopted identity) gets no token at all', noSession === null, `granted=${JSON.stringify(noSession)}`);
    await closeAndWait(wsNoHello);

    /* ── token security: the claim side ── */
    const forged = await postClaim(base, { token: 'forged-tokens-never-work-111111', pubkey: pubkeyA, method: 'passkey' });
    assert('a FORGED token is rejected 401', forged.status === 401, `status=${forged.status} body=${JSON.stringify(forged.body)}`);
    const absent = await postClaim(base, { pubkey: pubkeyA, method: 'passkey' });
    assert('a claim with NO token at all is rejected 401', absent.status === 401, `status=${absent.status} body=${JSON.stringify(absent.body)}`);

    // the legit ceremony + the honesty gate, in one: fan A claims mid-match.
    const tokenA = await requestToken(wsA, MATCH_ID, fanA, 2000);
    assert('the session\'s OWN token request is granted', typeof tokenA === 'string' && tokenA.length > 0, `token=${tokenA ? tokenA.slice(0, 8) + '…' : String(tokenA)}`);
    const startMs = Date.now();
    const claimA = await postClaim(base, { token: tokenA, pubkey: pubkeyA, method: 'passkey' });
    const elapsedMs = Date.now() - startMs;
    assert('a legit token claim for a real but NOT-YET-FULL_TIME match -> 200', claimA.status === 200, `status=${claimA.status}`);
    assert('…and mint:null (the honesty gate — no mint before full time)', claimA.body.mint === null, `mint=${JSON.stringify(claimA.body.mint)}`);
    assert(
      '…resolved fast (well under a real RPC/Irys/mint round-trip) — the gate short-circuited BEFORE any network call',
      elapsedMs < 2000,
      `${elapsedMs}ms`,
    );
    assert(
      '…yet still resolves profile.sides to the real team TRICODE (SUI), not "home"',
      Array.isArray(claimA.body.profile?.sides) && claimA.body.profile.sides[0] === 'SUI',
      `sides=${JSON.stringify(claimA.body.profile?.sides)}`,
    );

    const reused = await postClaim(base, { token: tokenA, pubkey: pubkeyA, method: 'passkey' });
    assert('REUSING an already-redeemed token is rejected 401 (single-use)', reused.status === 401, `status=${reused.status} body=${JSON.stringify(reused.body)}`);

    // THE HARVEST ATTACK, dead: a different session's token + a smuggled body anonId/matchId
    // naming fan A still binds the TOKEN's fan (B: never rooted, never predicted) — fan A's
    // side/call are not reachable by naming them, because the body identity is never read.
    const wsB = await connect(wsUrl);
    send(wsB, { type: 'hello', matchId: MATCH_ID, anonId: fanB });
    await sleep(120);
    const tokenB = await requestToken(wsB, MATCH_ID, fanB, 2000);
    const harvest = await postClaim(base, { token: tokenB, pubkey: pubkeyE, method: 'passkey', anonId: fanA, matchId: MATCH_ID });
    assert('harvest attempt: pubkey E + fan B\'s token + a smuggled body anonId naming fan A -> 200 but binds B', harvest.status === 200, `status=${harvest.status}`);
    assert(
      '…profile.sides is EMPTY (fan B\'s truth) — fan A\'s side/call were NOT harvested despite being named in the body',
      Array.isArray(harvest.body.profile?.sides) && harvest.body.profile.sides.length === 0,
      `sides=${JSON.stringify(harvest.body.profile?.sides)}`,
    );
    await closeAndWait(wsB);

    // expiry: a real wait past the (shortened) TTL — the token dies on the clock.
    const expiring = await requestToken(wsA, MATCH_ID, fanA, 2000);
    await sleep(1900); // TTL is 1500ms here (SEAT_TOKEN_TTL_MS above)
    const expired = await postClaim(base, { token: expiring, pubkey: pubkeyA, method: 'passkey' });
    assert('an EXPIRED token (real 1.9s wait past a real 1.5s TTL) is rejected 401', expired.status === 401, `status=${expired.status} body=${JSON.stringify(expired.body)}`);

    /* ── mint idempotency (review fix, risk 3) — post-FULL_TIME, seeded marker ── */
    // Drive the match to FULL_TIME through the REAL feed path (same call the live
    // TXLINE/replay ingest makes) — resolvedMatches flips, the mint gate opens.
    broadcastToMatch(MATCH_ID, { type: 'score', ev: { tMs: Date.now(), minute: 90, home: 2, away: 1, source: 'replay' } });
    broadcastToMatch(MATCH_ID, { type: 'status', ev: { tMs: Date.now(), phase: 'FULL_TIME', minute: 90, source: 'replay' } });
    await sleep(150);

    // Seed the durable marker through the REAL store writer — this stands in for "fan C already
    // minted this scarf in some earlier claim/process" WITHOUT performing a real devnet mint
    // (forbidden from an automated check; the unseeded first-mint path is prove-claim-mint.ts's).
    const seeded = { asset: 'SeededScarfAsset111111111111111111111111111', txUrl: 'https://explorer.solana.com/tx/seeded?cluster=devnet', mintedAtMs: Date.now() };
    saveMintMarker(pubkeyC, MATCH_ID, seeded);
    const roundTrip = loadMintMarker(pubkeyC, MATCH_ID);
    assert('the minted marker round-trips through the real store (save -> load)', roundTrip?.asset === seeded.asset && roundTrip?.txUrl === seeded.txUrl, `loaded=${JSON.stringify(roundTrip)}`);
    const markerFile = path.join(dataDir, 'seat', 'mints', `${pubkeyC}--${MATCH_ID}.json`);
    assert('the marker is a real file on the durable seat dir (survives restarts the same way profiles do)', existsSync(markerFile), markerFile);

    const wsC = await connect(wsUrl);
    send(wsC, { type: 'hello', matchId: MATCH_ID, anonId: fanC, side: 'away' });
    await sleep(120);
    const tokenC1 = await requestToken(wsC, MATCH_ID, fanC, 2000);
    const t1 = Date.now();
    const claimC1 = await postClaim(base, { token: tokenC1, pubkey: pubkeyC, method: 'passkey' });
    const c1Ms = Date.now() - t1;
    assert('post-FULL_TIME claim with an existing marker -> 200 with the EXISTING asset (no new mint)', claimC1.status === 200 && claimC1.body.mint?.asset === seeded.asset, `mint=${JSON.stringify(claimC1.body.mint)}`);
    assert('…and fast (no RPC/Irys latency) — the marker was checked BEFORE getMintRuntime()', c1Ms < 2000, `${c1Ms}ms`);

    const tokenC2 = await requestToken(wsC, MATCH_ID, fanC, 2000);
    const claimC2 = await postClaim(base, { token: tokenC2, pubkey: pubkeyC, method: 'passkey' });
    assert(
      'a SECOND sequential post-FT claim returns the SAME asset id — one scarf per match per fan, zero new mints across both claims',
      claimC2.status === 200 && claimC2.body.mint?.asset === seeded.asset && claimC2.body.mint?.asset === claimC1.body.mint?.asset,
      `first=${JSON.stringify(claimC1.body.mint)} second=${JSON.stringify(claimC2.body.mint)}`,
    );

    /* ── post-restart TRUE score (review merge-gate) ── */
    // Live path first: currentScoreSnapshot is the EXACT value handleSeatClaim hands to
    // mintScarfForClaim (one line apart) — resolved in this process, it must carry the real 2–1.
    const { currentScoreSnapshot } = await import('../server');
    const liveScore = currentScoreSnapshot(MATCH_ID);
    assert('live path: currentScoreSnapshot serves the resolution-time score {2,1,decided:true}', liveScore.home === 2 && liveScore.away === 1 && liveScore.decided === true, JSON.stringify(liveScore));

    // The immediate post-FT snapshot (predictLifecycle -> registry.snapshotNow) must already
    // carry finalScore — that write happened synchronously inside the FULL_TIME broadcast above.
    const snapOnDisk = JSON.parse(readFileSync(path.join(dataDir, 'rooot-stands-snapshot.json'), 'utf8')) as {
      version?: number;
      matches: Array<{ matchId: string; finalScore?: { home: number; away: number } }>;
    };
    const snapMatch = snapOnDisk.matches.find((m) => m.matchId === MATCH_ID);
    assert('the on-disk snapshot is v6 and carries finalScore {2,1} for the resolved match', snapOnDisk.version === 6 && snapMatch?.finalScore?.home === 2 && snapMatch?.finalScore?.away === 1, `version=${snapOnDisk.version} finalScore=${JSON.stringify(snapMatch?.finalScore)}`);

    // Now the restart: a CHILD process on the SAME data dir (fresh memory — the exact bug
    // scenario: resolvedMatches restores, the join-snapshot score cache does NOT). A fresh fan
    // with NO minted marker claims; the mint path must be entered with the TRUE restored score.
    // Every mint endpoint (RPC + Irys + collection cache) is aimed at unroutable/throwaway local
    // targets so this attempt CANNOT become a real transaction — the claim then honestly returns
    // mint:null when the attempt fails, and the assertion is the pre-mint score log line.
    const bootR = await bootServer({
      STANDS_DATA_DIR: dataDir,
      MINT_DEVNET_RPC: 'http://127.0.0.1:9',
      MINT_IRYS_DEVNET: 'http://127.0.0.1:9',
      MINT_DEVNET_KEYPAIR: path.join(dataDir, 'mint-throwaway.json'),
      ROOOT_SCARF_COLLECTION_CACHE: path.join(dataDir, 'scarf-collection-throwaway.json'),
    });
    log('restart-score', `child up on port ${bootR.port} (same dataDir, fresh memory)`);
    try {
      assert('the restarted child logs a restored-snapshot line (v6)', bootR.getOutput().includes('restored') && bootR.getOutput().includes('(v6)'), bootR.getOutput().split('\n').find((l) => l.includes('restored')) ?? '(no restore line)');
      const fanD = 'seat-check-fan-d';
      const pubkeyD = freshPubkey();
      const tokenD = await getSeatToken(`ws://127.0.0.1:${bootR.port}`, MATCH_ID, fanD, 'away');
      const claimD = await postClaim(`http://127.0.0.1:${bootR.port}`, { token: tokenD, pubkey: pubkeyD, method: 'passkey' });
      const outR = bootR.getOutput();
      assert('post-restart first claim (no marker) -> 200, and the refuse path did NOT trigger (score was restored, so no mintNote)', claimD.status === 200 && claimD.body.mintNote === undefined, `status=${claimD.status} mintNote=${JSON.stringify(claimD.body.mintNote)}`);
      assert(
        'the mint path was entered with the TRUE restored final score (pre-mint log carries full-time 2–1, sourced from the v6 snapshot, not the empty live cache)',
        outR.includes('full-time 2–1'),
        outR.split('\n').find((l) => l.includes('[seat:mint] minting')) ?? '(no pre-mint line)',
      );
      assert('…and never a fabricated 0–0 anywhere in the child log', !outR.includes('0–0'), 'no 0–0 in output');
      assert(
        '…the attempt then failed on the deliberately unroutable endpoints -> mint:null (no real transaction is possible from this check; the REAL unrouted mint is prove-claim-mint.ts, manual)',
        claimD.body.mint === null && outR.includes('[seat:mint] mint failed'),
        `mint=${JSON.stringify(claimD.body.mint)} failLine=${outR.split('\n').find((l) => l.includes('mint failed')) ?? '(none)'}`,
      );
    } finally {
      await killHard(bootR.proc);
    }

    await closeAndWait(wsA);
    await closeAndWait(wsC);
  } finally {
    registry.stop();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  }
}

/* ── part 3: refuse-don't-fabricate — resolved WITHOUT a known score (doctored v5) ── */
async function partRefuseUnknownScore(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-seat-check-refuse-'));
  const MATCH_ID = '18202783'; // a real fixture id, so ONLY the missing score can explain a refusal
  // Hand-craft the exact shape a PRE-v6 production snapshot has for a resolved match: the
  // resolved flag present, verdicts present, but NO finalScore field at all. This is the
  // reviewer's scenario verbatim — restore it and claim.
  const doctored = {
    version: 5,
    savedAtMs: Date.now(),
    matches: [{
      matchId: MATCH_ID,
      rooted: [['doctored-fan', 'home']],
      rooms: [],
      predictions: [['doctored-fan', { home: 2, away: 1, atMs: 1 }]],
      predictLocked: true,
      verdicts: [['doctored-fan', { type: 'predictVerdict', matchId: MATCH_ID, anonId: 'doctored-fan', predicted: { home: 2, away: 1 }, final: { home: 2, away: 1 }, verdict: 'exact' }]],
      resolved: true,
      fanStats: [],
      openedTriggerIds: [],
    }],
  };
  writeFileSync(path.join(dataDir, 'rooot-stands-snapshot.json'), JSON.stringify(doctored));
  const boot = await bootServer({
    STANDS_DATA_DIR: dataDir,
    ROOOT_SEAT_DIR: path.join(dataDir, 'seat'),
    MINT_DEVNET_RPC: 'http://127.0.0.1:9',
    MINT_IRYS_DEVNET: 'http://127.0.0.1:9',
    MINT_DEVNET_KEYPAIR: path.join(dataDir, 'mint-throwaway.json'),
    ROOOT_SCARF_COLLECTION_CACHE: path.join(dataDir, 'scarf-collection-throwaway.json'),
  });
  log('refuse', `child up on port ${boot.port} (doctored v5 snapshot: resolved, NO finalScore)`);
  try {
    const fanE = 'seat-check-fan-e';
    const pubkeyE2 = freshPubkey();
    const token = await getSeatToken(`ws://127.0.0.1:${boot.port}`, MATCH_ID, fanE, 'home');
    const start = Date.now();
    const claim = await postClaim(`http://127.0.0.1:${boot.port}`, { token, pubkey: pubkeyE2, method: 'passkey' });
    const elapsed = Date.now() - start;
    const out = boot.getOutput();
    assert('a claim on a resolved match with NO known score -> 200 with mint:null — NEVER a 0–0 scarf', claim.status === 200 && claim.body.mint === null, `status=${claim.status} mint=${JSON.stringify(claim.body.mint)}`);
    assert('…with a plain retryable mintNote in the response', typeof claim.body.mintNote === 'string' && claim.body.mintNote.length > 0, `mintNote=${JSON.stringify(claim.body.mintNote)}`);
    assert('…the server logged the refuse reason plainly', out.includes('refusing to mint rather than fabricate'), out.split('\n').find((l) => l.includes('refusing to mint')) ?? '(no refuse line)');
    assert('…and the mint path was NEVER entered (no pre-mint score line, no mint attempt/failure at all)', !out.includes('[seat:mint] minting') && !out.includes('[seat:mint] mint failed'), 'no [seat:mint] minting/failed lines');
    assert('…resolved fast (no network path was ever reached)', elapsed < 2000, `${elapsed}ms`);
    assert('…the profile bind itself still saved normally (refusal costs the fan nothing)', claim.body.profile?.pubkey === pubkeyE2, `profile=${JSON.stringify(claim.body.profile)}`);
  } finally {
    await killHard(boot.proc);
    rmSync(dataDir, { recursive: true, force: true });
  }
}

/* ── part 4: mint attribute shaping — pure, no server, no network ───────────── */
async function partAttributeShaping(): Promise<void> {
  const { MatchState } = await import('../match-state');
  const { scarfFactsFor } = await import('../seat/mint-scarf');
  const { buildScarfAttributes } = await import('../mint/metadata');
  const { fixtureInfo } = await import('../sentiment/teams');
  type ClaimRecordT = import('../seat/claim').ClaimRecord;

  const MATCH_ID = '18202783'; // SUI v COL
  const fx = fixtureInfo(MATCH_ID)!;
  const FINAL = { home: 2, away: 1 }; // SUI 2–1 COL
  const fanNo = 7;

  /** Real 3-state verdict off the REAL resolvePredictions pipeline — not hand-asserted. */
  function realVerdict(predicted: { home: number; away: number }): 'exact' | 'outcome' | 'wrong' {
    const m = new MatchState(MATCH_ID);
    m.root('fan', 'home');
    m.predict('fan', predicted.home, predicted.away, Date.now());
    m.lockPredictions();
    const [v] = m.resolvePredictions(FINAL.home, FINAL.away);
    return v!.verdict;
  }

  function attrMap(attrs: Array<{ trait_type: string; value: string | number }>): Record<string, string | number> {
    return Object.fromEntries(attrs.map((a) => [a.trait_type, a.value]));
  }

  const cases: Array<{ label: string; predicted: { home: number; away: number }; want: 'exact' | 'outcome' | 'wrong' }> = [
    { label: 'exact scoreline', predicted: { home: 2, away: 1 }, want: 'exact' },
    { label: 'right outcome, wrong score', predicted: { home: 3, away: 0 }, want: 'outcome' },
    { label: 'wrong (picked the other side to win)', predicted: { home: 1, away: 2 }, want: 'wrong' },
  ];

  for (const c of cases) {
    const verdict = realVerdict(c.predicted);
    assert(`resolvePredictions maps "${c.label}" -> ${c.want}`, verdict === c.want, `got=${verdict}`);

    const record: ClaimRecordT = { pubkey: 'FakeFan11111111111111111111111111111111111', method: 'passkey', side: 'home', call: c.predicted, matchId: MATCH_ID, boundAtMs: Date.now() };
    const facts = scarfFactsFor(record, FINAL, fx, { result: verdict, fanNo });
    const attrs = attrMap(buildScarfAttributes(facts));

    assert(`[${c.label}] scarf carries the real tricodes (home=SUI, away=COL)`, attrs.home === 'SUI' && attrs.away === 'COL', JSON.stringify(attrs));
    assert(`[${c.label}] scarf carries the real final score (2–1)`, attrs.score === '2–1', `score=${attrs.score}`);
    assert(`[${c.label}] scarf carries matchId/comp/date/serial (all seven structural facts present)`, attrs.matchId === MATCH_ID && attrs.comp === 'WORLD CUP' && typeof attrs.date === 'string' && attrs.date.length > 0 && attrs.serial === '007', JSON.stringify(attrs));
    assert(`[${c.label}] call is home-perspective tricode-prefixed`, attrs.call === `SUI ${c.predicted.home}–${c.predicted.away}`, `call=${attrs.call}`);
    assert(`[${c.label}] result attribute matches the real verdict exactly`, attrs.result === c.want, `result=${attrs.result}`);
  }

  // the never-predicted case: call/result must be genuinely ABSENT (never a fabricated 'wrong'
  // or a null placed on-chain) — bindClaim never invents a call, so this must round-trip clean.
  const noCallRecord: ClaimRecordT = { pubkey: 'FakeFan11111111111111111111111111111111111', method: 'passkey', side: 'home', call: null, matchId: MATCH_ID, boundAtMs: Date.now() };
  const noCallFacts = scarfFactsFor(noCallRecord, FINAL, fx, { result: null, fanNo });
  assert('a fan who never predicted: facts.call is null, never invented', noCallFacts.call === null, `call=${noCallFacts.call}`);
  assert('…facts.result is null (nothing to grade)', noCallFacts.result === null, `result=${noCallFacts.result}`);
  const noCallAttrs = buildScarfAttributes(noCallFacts);
  const noCallTypes = new Set(noCallAttrs.map((a) => a.trait_type));
  assert('…the on-chain attribute array OMITS call/result entirely (not a null value — omitted)', !noCallTypes.has('call') && !noCallTypes.has('result'), JSON.stringify(noCallAttrs));
  assert('…but still carries every structural fact (matchId/home/away/score/comp/date/serial)', ['matchId', 'home', 'away', 'score', 'comp', 'date', 'serial'].every((k) => noCallTypes.has(k)), JSON.stringify(noCallAttrs));
}

/* ── part 5: /seat/album's DAS path — env-gated, one real READ if present ───── */
async function partAlbumDas(): Promise<void> {
  if (!process.env.HELIUS_RPC_URL) {
    skip('/seat/album DAS path', 'HELIUS_RPC_URL is not set — the public devnet RPC has no DAS getAssetsByOwner index, so this check has no honest way to exercise the live route. Set HELIUS_RPC_URL (a Helius or other DAS-capable devnet RPC) to run it.');
    return;
  }
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-seat-check-album-'));
  process.env.STANDS_DATA_DIR = dataDir;
  const { createStandsServer } = await import('../server');
  const { httpServer, registry } = createStandsServer();
  try {
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const addr = httpServer.address();
    if (addr === null || typeof addr === 'string') throw new Error('failed to bind an ephemeral port');
    const base = `http://127.0.0.1:${addr.port}`;
    const pubkey = freshPubkey(); // never used on-chain — expect an honestly empty album, not an error
    const res = await fetch(`${base}/seat/album?pubkey=${pubkey}`);
    const body = (await res.json()) as { scarves?: unknown[] };
    assert('/seat/album with HELIUS_RPC_URL set -> 200 (a real DAS read succeeds)', res.status === 200, `status=${res.status} body=${JSON.stringify(body)}`);
    assert('a never-used pubkey has an honestly empty album, not an error', Array.isArray(body.scarves) && body.scarves.length === 0, `scarves=${JSON.stringify(body.scarves)}`);
  } finally {
    registry.stop();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  }
}

const watchdog = setTimeout(() => {
  console.error('[seat-check] watchdog: hung for 90s, forcing exit');
  process.exit(1);
}, 90_000);

async function main(): Promise<void> {
  await partPersistence();
  await partTokenGateIdempotency();
  await partRefuseUnknownScore();
  await partAttributeShaping();
  await partAlbumDas();
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
    console.error('[seat-check] fatal:', err);
    process.exit(1);
  });
