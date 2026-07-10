/**
 * Dev-only verification script (NOT part of the service — never imported by
 * src/index.ts). Proves Task 4 (verdict replay to late joiners/reconnects)
 * end-to-end:
 *
 *   1. boots the REAL stands server in-process (the `ws` client, over real
 *      WebSocket connections — same pattern as presence-cheer-check.ts).
 *   2. fan A roots + predicts; fan B roots and deliberately does NOT predict.
 *   3. drives the match to FULL_TIME through the REAL feed path: calls the
 *      SAME `broadcastToMatch(matchId, feedMsg)` function index.ts's ingest
 *      routing (TXLINE + replay, both go through `routeFeedMsg`) calls for
 *      every live message — no synthetic shortcut around match-state.ts /
 *      server.ts's predictLifecycle.
 *   4. asserts fan A receives their own (personal, exact) verdict; fan B
 *      receives NONE (honesty — a fan with no prediction gets no verdict,
 *      never synthesized).
 *   5. disconnects fan A, reconnects with the SAME anonId, sends a plain
 *      hello (no `?matchId=`, so this exercises the hello-replay path
 *      specifically) — asserts the verdict is replayed.
 *   6. forces a snapshot write, cleanly stops the in-process server, then
 *      boots a completely FRESH server as a CHILD PROCESS pointed at the same
 *      STANDS_DATA_DIR (zero shared memory with step 1-5's process) —
 *      reconnects as fan A and asserts the verdict is STILL replayed, proving
 *      it survived via the snapshot, not via any in-memory carry-over.
 *
 * Usage: tsx src/dev/verdict-replay-check.ts (or: npm run check:verdict-replay)
 */
import { type ChildProcessByStdio, spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import type { ClientMsg, PredictVerdictMsg, ServerMsg } from '@contracts/crowd';

function log(tag: string, msg: string): void {
  console.log(`[verdict-replay-check:${tag}] ${msg}`);
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
function attachVerdictCapture(ws: WebSocket, matchId: string): { verdicts: PredictVerdictMsg[] } {
  const state = { verdicts: [] as PredictVerdictMsg[] };
  ws.on('message', (raw) => {
    let m: ServerMsg;
    try {
      m = JSON.parse(raw.toString()) as ServerMsg;
    } catch {
      return;
    }
    if (m.type === 'predictVerdict' && m.matchId === matchId) state.verdicts.push(m);
  });
  return state;
}

const MATCH_ID = `verdict-check-${Date.now()}`;

/* ── phase 2 helper: spawn the real entrypoint as a child process ───────── */
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
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve();
      return;
    }
    proc.once('exit', () => resolve());
    proc.kill('SIGKILL');
  });
}

async function main(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-verdict-replay-check-'));
  log('setup', `dataDir=${dataDir} matchId=${MATCH_ID}`);

  try {
    /* ── phase 1: in-process, drive to FULL_TIME through the real feed path ── */
    // Set BEFORE the dynamic import (module-level constants in snapshot.ts read
    // these at import time — see presence-cheer-check.ts's identical pattern)
    // so this check never touches a real local snapshot file, and so phase 2's
    // fresh child process can find the SAME on-disk state afterward.
    process.env.STANDS_DATA_DIR = dataDir;
    process.env.STANDS_SNAPSHOT_INTERVAL_MS = '400';
    const { createStandsServer } = await import('../server');

    const { httpServer, registry, broadcastToMatch } = createStandsServer();
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const addr = httpServer.address();
    if (addr === null || typeof addr === 'string') throw new Error('failed to bind an ephemeral port');
    const url = `ws://127.0.0.1:${addr.port}`;
    log('boot1', `in-process stands server up on ephemeral port ${addr.port}`);

    const fanA = await connect(url);
    const fanB = await connect(url);
    const capA = attachVerdictCapture(fanA, MATCH_ID);
    const capB = attachVerdictCapture(fanB, MATCH_ID);
    send(fanA, { type: 'hello', matchId: MATCH_ID, anonId: 'verdict-fan-a', side: 'home' });
    send(fanB, { type: 'hello', matchId: MATCH_ID, anonId: 'verdict-fan-b', side: 'away' }); // never predicts
    await sleep(150);
    send(fanA, { type: 'predict', matchId: MATCH_ID, anonId: 'verdict-fan-a', home: 2, away: 1, atMs: Date.now() });
    await sleep(150);

    // drive to FULL_TIME the same way TXLINE/replay ingest do — calling
    // broadcastToMatch directly (routeFeedMsg in index.ts is exactly this).
    const now = Date.now();
    broadcastToMatch(MATCH_ID, { type: 'status', ev: { tMs: now, phase: 'FIRST_HALF', minute: 0, source: 'replay' } });
    broadcastToMatch(MATCH_ID, { type: 'score', ev: { tMs: now, minute: 90, home: 2, away: 1, source: 'replay' } });
    broadcastToMatch(MATCH_ID, { type: 'status', ev: { tMs: now, phase: 'FULL_TIME', minute: 90, source: 'replay' } });
    await sleep(250);

    assert('fan A (predicted 2-1, final 2-1) receives their own EXACT verdict', capA.verdicts.length === 1 && capA.verdicts[0]?.verdict === 'exact', `capA.verdicts=${JSON.stringify(capA.verdicts)}`);
    assert('fan B (never predicted) receives NO verdict — never synthesized', capB.verdicts.length === 0, `capB.verdicts=${JSON.stringify(capB.verdicts)}`);

    const storedA = registry.get(MATCH_ID)?.verdictFor('verdict-fan-a');
    assert('MatchState.verdictFor stores the same verdict server-side', storedA?.verdict === 'exact' && storedA.predicted.home === 2 && storedA.predicted.away === 1, `verdictFor=${JSON.stringify(storedA)}`);
    const storedB = registry.get(MATCH_ID)?.verdictFor('verdict-fan-b');
    assert('MatchState.verdictFor has nothing for a fan who never predicted', storedB === undefined, `verdictFor(b)=${JSON.stringify(storedB)}`);

    // ── disconnect A, reconnect with the SAME anonId, plain hello (no
    // ?matchId=) — exercise the hello-replay path specifically ──────────────
    await closeAndWait(fanA);
    const fanA2 = await connect(url);
    const capA2 = attachVerdictCapture(fanA2, MATCH_ID);
    send(fanA2, { type: 'hello', matchId: MATCH_ID, anonId: 'verdict-fan-a', side: 'home' });
    await sleep(200);
    assert('reconnect + re-hello (same anonId) replays the verdict', capA2.verdicts.length === 1 && capA2.verdicts[0]?.verdict === 'exact', `capA2.verdicts=${JSON.stringify(capA2.verdicts)}`);

    // a DIFFERENT never-predicted fan hello-ing in must still get nothing.
    const fanC = await connect(url);
    const capC = attachVerdictCapture(fanC, MATCH_ID);
    send(fanC, { type: 'hello', matchId: MATCH_ID, anonId: 'verdict-fan-c', side: 'away' });
    await sleep(200);
    assert('a fresh never-predicted fan hello-ing in gets no verdict either', capC.verdicts.length === 0, `capC.verdicts=${JSON.stringify(capC.verdicts)}`);

    // let a real (fast, 400ms) periodic snapshot write land, capturing the
    // resolved verdict, before we tear this instance down.
    await sleep(900);

    await closeAndWait(fanA2);
    await closeAndWait(fanB);
    await closeAndWait(fanC);
    registry.stop();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    log('boot1', 'stopped cleanly (no special flush-on-exit — the periodic snapshot is what persisted)');

    /* ── phase 2: fresh CHILD PROCESS, same dataDir — the real reboot ────── */
    const boot2 = await bootServer({ STANDS_DATA_DIR: dataDir, STANDS_SNAPSHOT_INTERVAL_MS: '30000' });
    log('boot2', `up on port ${boot2.port}`);
    await sleep(200);
    const out2 = boot2.getOutput();
    const restoredLine = out2.split('\n').find((l) => l.includes('[stands:registry] restored'));
    assert('reboot logs a restored-snapshot line', !!restoredLine, restoredLine ?? '(no matching line)');

    const url2 = `ws://127.0.0.1:${boot2.port}`;
    const fanA3 = await connect(url2);
    const capA3 = attachVerdictCapture(fanA3, MATCH_ID);
    send(fanA3, { type: 'hello', matchId: MATCH_ID, anonId: 'verdict-fan-a', side: 'home' });
    await sleep(250);
    assert(
      'after a full process restart, re-hello STILL replays the verdict (sourced from the snapshot, not memory)',
      capA3.verdicts.length === 1 && capA3.verdicts[0]?.verdict === 'exact' && capA3.verdicts[0].predicted.home === 2 && capA3.verdicts[0].predicted.away === 1,
      `capA3.verdicts=${JSON.stringify(capA3.verdicts)}`,
    );

    await closeAndWait(fanA3);
    await killHard(boot2.proc);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

const watchdog = setTimeout(() => {
  console.error('[verdict-replay-check] watchdog: hung for 40s, forcing exit');
  process.exit(1);
}, 40_000);

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
    console.error('[verdict-replay-check] fatal:', err);
    process.exit(1);
  });
