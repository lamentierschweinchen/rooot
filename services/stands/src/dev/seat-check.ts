/**
 * Dev-only verification script (NOT part of the service — never imported by
 * src/index.ts) for the YOUR SEAT reconciliation (docs/HANDOFF-2026-07-10-
 * coordinator-session.md §5). Four parts, each independently gated so a
 * missing optional dependency (a DAS RPC) SKIPs honestly rather than failing:
 *
 *   1. /seat/claim + /seat/me round-trip, profile persistence ACROSS A REAL
 *      PROCESS RESTART on the DATA_DIR volume path (two spawned child
 *      processes pointed at the same STANDS_DATA_DIR — mirrors
 *      restart-persistence-check.ts's convention exactly). Identity-only
 *      claim (no matchId) throughout, so this never approaches the mint path.
 *   2. the mint HONESTY GATE — a claim for a real, registry-known match that
 *      has NOT reached FULL_TIME must return mint:null, fast (no network
 *      reached), while still correctly resolving profile.sides to the team
 *      TRICODE. In-process server, real WS hello + real HTTP claim.
 *   3. mint ATTRIBUTE SHAPING — pure, no server, no network: scarfFactsFor +
 *      buildScarfAttributes against a REAL 3-state verdict computed by
 *      MatchState.resolvePredictions (exact / outcome / wrong), plus the
 *      never-predicted case (call/result genuinely absent, never invented).
 *   4. /seat/album's DAS path, gated on HELIUS_RPC_URL — SKIPPED with a named
 *      reason when unset (the public devnet RPC has no DAS getAssetsByOwner
 *      index); when set, one real READ (not a transaction) against a
 *      never-used pubkey.
 *
 * What this deliberately does NOT do: complete a real mint. Reaching
 * FULL_TIME and then actually calling POST /seat/claim would exercise
 * mint-scarf.ts's getMintRuntime() — a real devnet RPC/Irys/mint-transaction
 * path — which the reconciliation plan explicitly forbids from an automated
 * check ("NO real transactions from dev checks — reuse the existing
 * relayer-stub pattern"). Part 2 proves the gate that PREVENTS that path from
 * ever being reached before full time; Part 3 proves what that path WOULD
 * write, at the pure-function level, without ever running it.
 *
 * Usage: tsx src/dev/seat-check.ts (or: npm run check:seat)
 */
import { type ChildProcessByStdio, spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { Keypair } from '@solana/web3.js';
import { WebSocket } from 'ws';
import type { ClientMsg } from '@contracts/crowd';

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

/* ── part 1: /seat/claim + /seat/me, profile persists across a real restart ── */
async function partPersistence(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-seat-check-'));
  const pubkey = freshPubkey();
  const anonId = 'seat-check-persistence-fan';
  log('persistence', `dataDir=${dataDir} pubkey=${pubkey.slice(0, 8)}…`);
  try {
    const boot1 = await bootServer({ STANDS_DATA_DIR: dataDir, ROOOT_SEAT_DIR: undefined });
    log('boot1', `up on port ${boot1.port}`);
    const base1 = `http://127.0.0.1:${boot1.port}`;

    // identity-only claim (no matchId) — guarantees the mint path is never approached here.
    const claimRes = await fetch(`${base1}/seat/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ anonId, pubkey, method: 'passkey' }),
    });
    const claimBody = (await claimRes.json()) as { profile?: { pubkey?: string; sides?: string[] }; mint?: unknown };
    assert('identity-only claim -> 200', claimRes.status === 200, `status=${claimRes.status} body=${JSON.stringify(claimBody)}`);
    assert('identity-only claim never attempts a mint', claimBody.mint === null, `mint=${JSON.stringify(claimBody.mint)}`);
    assert('claim response profile carries the claimed pubkey', claimBody.profile?.pubkey === pubkey, `profile=${JSON.stringify(claimBody.profile)}`);
    assert('identity-only claim invents no side/tricode', Array.isArray(claimBody.profile?.sides) && claimBody.profile!.sides!.length === 0, `sides=${JSON.stringify(claimBody.profile?.sides)}`);

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

    await killHard(boot2.proc);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

/* ── part 2: the mint honesty gate — no FULL_TIME, no mint, fast, no network ── */
async function partHonestyGate(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-seat-check-gate-'));
  process.env.STANDS_DATA_DIR = dataDir;
  process.env.ROOOT_SEAT_DIR = path.join(dataDir, 'seat');
  const { createStandsServer } = await import('../server');
  const MATCH_ID = '18202783'; // SUI v COL — a real sentiment/teams.ts FIXTURE_INFO entry
  const anonId = 'seat-check-gate-fan';
  const pubkey = freshPubkey();

  const { httpServer, registry } = createStandsServer();
  try {
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const addr = httpServer.address();
    if (addr === null || typeof addr === 'string') throw new Error('failed to bind an ephemeral port');
    const base = `http://127.0.0.1:${addr.port}`;
    const ws = await connect(`ws://127.0.0.1:${addr.port}`);
    send(ws, { type: 'hello', matchId: MATCH_ID, anonId, side: 'home' });
    await sleep(120);
    send(ws, { type: 'predict', matchId: MATCH_ID, anonId, home: 2, away: 1, atMs: Date.now() });
    await sleep(120);

    // the match is now registry-known (getOrCreate ran inside handleHello above), rooted, and
    // predicted — but NEVER told FULL_TIME. This is exactly the "mid-match claim" case.
    const startMs = Date.now();
    const claimRes = await fetch(`${base}/seat/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ anonId, pubkey, method: 'passkey', matchId: MATCH_ID }),
    });
    const elapsedMs = Date.now() - startMs;
    const claimBody = (await claimRes.json()) as { profile?: { sides?: string[] }; mint?: unknown };
    assert('a claim for a real but NOT-YET-FULL_TIME match -> 200', claimRes.status === 200, `status=${claimRes.status}`);
    assert('…and mint:null (the honesty gate — no mint before full time)', claimBody.mint === null, `mint=${JSON.stringify(claimBody.mint)}`);
    assert(
      '…resolved fast (well under a real RPC/Irys/mint round-trip) — proves the gate short-circuited BEFORE any network call',
      elapsedMs < 2000,
      `${elapsedMs}ms`,
    );
    assert(
      '…yet still resolves profile.sides to the real team TRICODE (SUI), not "home"',
      Array.isArray(claimBody.profile?.sides) && claimBody.profile!.sides![0] === 'SUI',
      `sides=${JSON.stringify(claimBody.profile?.sides)}`,
    );

    await closeAndWait(ws);
  } finally {
    registry.stop();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    rmSync(dataDir, { recursive: true, force: true });
  }
}

/* ── part 3: mint attribute shaping — pure, no server, no network ───────────── */
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

/* ── part 4: /seat/album's DAS path — env-gated, one real READ if present ───── */
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
  console.error('[seat-check] watchdog: hung for 60s, forcing exit');
  process.exit(1);
}, 60_000);

async function main(): Promise<void> {
  await partPersistence();
  await partHonestyGate();
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
