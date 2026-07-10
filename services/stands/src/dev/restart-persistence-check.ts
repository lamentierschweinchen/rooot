/**
 * Dev-only verification script (NOT part of the service — never imported by
 * src/index.ts). Proves Task 3 (durable persistence) end-to-end across a REAL
 * process boundary — not an in-process import trick, an actual child process
 * boot/kill/reboot, so nothing can be "persisted" by accident via shared
 * module memory:
 *
 *   1. boot the REAL entrypoint (index.ts's main(), via tsx) as a child
 *      process, pointed at a fresh temp dir via STANDS_DATA_DIR, with a short
 *      STANDS_SNAPSHOT_INTERVAL_MS so a real periodic snapshot write lands in
 *      well under a second instead of the production 30s.
 *   2. two ws fans root (home/away) and one predicts.
 *   3. wait for a real snapshot write, then SIGKILL the child — no graceful
 *      shutdown, no flush-on-exit hook. Whatever's on disk is only there
 *      because the periodic writer put it there.
 *   4. boot a SECOND, completely fresh child process pointed at the SAME dir
 *      (a genuine reboot — zero shared memory with step 1's process) and prove:
 *        - the boot log carries the "restored N match(es)" line
 *        - rooted counts (home+away) survive into a live `stands` tick
 *        - the restored prediction shows up in the join-time replay AND
 *          participates in a live consensus REBROADCAST triggered by a brand
 *          new predict from a third fan (n=2, not just n=1 — proves it's
 *          live state, not a cached echo)
 *   5. separately, boot a THIRD child with STANDS_DATA_DIR unset (no /data on
 *      a dev laptop) and confirm the /tmp fallback log line appears and the
 *      server still boots cleanly.
 *   6. tolerant v1 loader: hand-write a snapshot file shaped exactly like the
 *      PRE-Task-3 format (no version/predictions/predictLocked/verdicts/
 *      moments keys) and confirm a FOURTH child boots on it without crashing,
 *      restores rooted state, and fabricates nothing for the absent fields.
 *
 * Usage: tsx src/dev/restart-persistence-check.ts (or: npm run check:restart-persistence)
 */
import { type ChildProcessByStdio, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '@contracts/crowd';

function log(tag: string, msg: string): void {
  console.log(`[restart-persistence-check:${tag}] ${msg}`);
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

/* ── spawn the REAL server as a child process ────────────────────────────── */
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

type StandsMsg = Extract<ServerMsg, { type: 'stands' }>;
type ConsensusMsg = Extract<ServerMsg, { type: 'consensus' }>;

/* ── the scenario ─────────────────────────────────────────────────────── */
async function scenarioRestartPersistence(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-restart-check-'));
  const matchId = `restart-check-${Date.now()}`;
  log('setup', `dataDir=${dataDir} matchId=${matchId}`);

  try {
    // ── boot 1: seed state, force a fast snapshot, then hard-kill ──────────
    const boot1 = await bootServer({ STANDS_DATA_DIR: dataDir, STANDS_SNAPSHOT_INTERVAL_MS: '400' });
    log('boot1', `up on port ${boot1.port}`);

    const url1 = `ws://127.0.0.1:${boot1.port}`;
    const fanA = await connect(url1);
    const fanB = await connect(url1);
    send(fanA, { type: 'hello', matchId, anonId: 'restart-fan-a', side: 'home' });
    send(fanB, { type: 'hello', matchId, anonId: 'restart-fan-b', side: 'away' });
    await sleep(150);
    send(fanA, { type: 'predict', matchId, anonId: 'restart-fan-a', home: 2, away: 1, atMs: Date.now() });
    await sleep(150);

    // let at least one real periodic snapshot (interval 400ms above) land.
    await sleep(900);

    await closeAndWait(fanA);
    await closeAndWait(fanB);
    await killHard(boot1.proc); // hard kill — no graceful shutdown, no flush-on-exit
    log('boot1', 'hard-killed (SIGKILL)');

    // ── boot 2: fresh process, same dir — the real reboot ──────────────────
    const boot2 = await bootServer({ STANDS_DATA_DIR: dataDir, STANDS_SNAPSHOT_INTERVAL_MS: '30000' });
    log('boot2', `up on port ${boot2.port}`);
    await sleep(200); // let loadSnapshot()'s log line land before we grep it
    const out2 = boot2.getOutput();
    const restoredLine = out2.split('\n').find((l) => l.includes('[stands:registry] restored'));
    assert('boot2 logs a restored-snapshot line naming this match', !!restoredLine && restoredLine.includes('1 match'), restoredLine ?? '(no matching line in output)');
    const datadirLine = out2.split('\n').find((l) => l.includes('[stands:datadir]'));
    assert('boot2 logged which data dir it used (the STANDS_DATA_DIR env override)', !!datadirLine && datadirLine.includes(dataDir), datadirLine ?? '(no datadir line)');

    const url2 = `ws://127.0.0.1:${boot2.port}`;

    // join-replay: an observer seeded via ?matchId= gets replaySnapshot() on
    // connect, which includes the consensus IF predictionCount()>0 — proves
    // the restored prediction is visible immediately to a fresh joiner.
    const observer = await connect(`${url2}/?matchId=${encodeURIComponent(matchId)}`);
    const seen: { consensus: ConsensusMsg | null; stands: StandsMsg | null; consensusHistory: ConsensusMsg[] } = {
      consensus: null,
      stands: null,
      consensusHistory: [],
    };
    observer.on('message', (raw) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(raw.toString()) as ServerMsg;
      } catch {
        return;
      }
      if (m.type === 'consensus' && m.matchId === matchId) {
        seen.consensus = m;
        seen.consensusHistory.push(m);
      }
      if (m.type === 'stands' && m.matchId === matchId) seen.stands = m;
    });
    await sleep(250); // let the join-time replay (sent synchronously on connect) arrive
    assert(
      "the join-time replay includes the restored prediction (consensus.all.n >= 1)",
      (seen.consensus?.all.n ?? 0) >= 1,
      `consensus=${JSON.stringify(seen.consensus)}`,
    );

    // observer hellos WITHOUT a side, so it doesn't perturb the rooted counts
    // we're about to check — it only needs to become "present" so the match is
    // active and the 4Hz tick starts broadcasting `stands`.
    send(observer, { type: 'hello', matchId, anonId: 'restart-observer' });
    await sleep(350);
    assert(
      'rooted counts survive the restart (home:1 from restart-fan-a, away:1 from restart-fan-b)',
      seen.stands?.counts.home === 1 && seen.stands?.counts.away === 1,
      `counts=${JSON.stringify(seen.stands?.counts)}`,
    );

    // live rebroadcast: a NEW fan predicts post-reboot — the resulting
    // broadcastToMatch(consensus) must include BOTH the restored prediction
    // and the new one (n=2), proving restored state is live, not a cached echo.
    const fanE = await connect(url2);
    send(fanE, { type: 'hello', matchId, anonId: 'restart-fan-e', side: 'home' });
    await sleep(100);
    send(fanE, { type: 'predict', matchId, anonId: 'restart-fan-e', home: 0, away: 0, atMs: Date.now() });
    const gotSecondPredict = await waitFor(() => (seen.consensus?.all.n ?? 0) >= 2, 2000);
    assert(
      'a post-reboot predict rebroadcasts a consensus that INCLUDES the restored prediction (n=2)',
      gotSecondPredict && seen.consensus?.all.n === 2,
      `all.n=${seen.consensus?.all.n}`,
    );
    assert(
      'byRoot.home aggregates both the restored (2-1) and the new (0-0) home-rooted predictions',
      seen.consensus?.byRoot.home.n === 2 && approx(seen.consensus.byRoot.home.mean.home, 1) && approx(seen.consensus.byRoot.home.mean.away, 0.5),
      `byRoot.home=${JSON.stringify(seen.consensus?.byRoot.home)}`,
    );

    await closeAndWait(observer);
    await closeAndWait(fanE);
    await killHard(boot2.proc);

    // ── boot 3: STANDS_DATA_DIR unset — confirm the /tmp fallback line ─────
    const boot3 = await bootServer({ STANDS_DATA_DIR: undefined, STANDS_SNAPSHOT_INTERVAL_MS: '30000' });
    log('boot3', `up on port ${boot3.port} (no STANDS_DATA_DIR)`);
    const out3 = boot3.getOutput();
    const fallbackLine = out3.split('\n').find((l) => l.includes('[stands:datadir]'));
    assert(
      'boot WITHOUT STANDS_DATA_DIR set falls back to /tmp and logs why (no /data volume on this machine)',
      !!fallbackLine && fallbackLine.includes('/tmp'),
      fallbackLine ?? '(no datadir line)',
    );
    assert('boot WITHOUT the dir still comes up healthy (server reported a listening port)', boot3.port > 0, `port=${boot3.port}`);
    await killHard(boot3.proc);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

/**
 * Tolerant v1 loader: hand-craft a snapshot file shaped exactly like the
 * PRE-Task-3 format (no `version`, no predictions/predictLocked/verdicts/
 * moments keys at all — a real file this old genuinely looks like this) and
 * confirm boot doesn't crash, rooted state still restores, and every v2+
 * field defaults to its honest empty state rather than being fabricated.
 */
async function scenarioV1Tolerance(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-restart-check-v1-'));
  const matchId = 'v1-legacy-match';
  try {
    const legacySnapshot = {
      savedAtMs: Date.now(),
      matches: [{ matchId, rooted: [['legacy-fan', 'home']], rooms: [] }],
      // deliberately no: version, predictions, predictLocked, verdicts, moments
    };
    writeFileSync(path.join(dataDir, 'rooot-stands-snapshot.json'), JSON.stringify(legacySnapshot));
    log('v1', `hand-wrote a v1-shaped snapshot at ${dataDir}`);

    const boot = await bootServer({ STANDS_DATA_DIR: dataDir, STANDS_SNAPSHOT_INTERVAL_MS: '30000' });
    await sleep(200);
    const out = boot.getOutput();
    const restoredLine = out.split('\n').find((l) => l.includes('[stands:registry] restored'));
    assert('a v1 file (no version field) boots without crashing and logs it as v1', !!restoredLine && restoredLine.includes('(v1)'), restoredLine ?? '(no matching line)');

    const url = `ws://127.0.0.1:${boot.port}`;
    const observer = await connect(`${url}/?matchId=${encodeURIComponent(matchId)}`);
    const seen: { sawConsensus: boolean; stands: StandsMsg | null } = { sawConsensus: false, stands: null };
    observer.on('message', (raw) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(raw.toString()) as ServerMsg;
      } catch {
        return;
      }
      if (m.type === 'consensus' && m.matchId === matchId) seen.sawConsensus = true;
      if (m.type === 'stands' && m.matchId === matchId) seen.stands = m;
    });
    send(observer, { type: 'hello', matchId, anonId: 'v1-observer' });
    await sleep(400);
    assert('rooted state from the v1 file still restores (home:1)', seen.stands?.counts.home === 1, `counts=${JSON.stringify(seen.stands?.counts)}`);
    assert('absent predictions on a v1 file default to none — no consensus replay is fabricated', !seen.sawConsensus, `sawConsensus=${seen.sawConsensus}`);

    await closeAndWait(observer);
    await killHard(boot.proc);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) < eps;
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

async function main(): Promise<void> {
  await scenarioRestartPersistence();
  await scenarioV1Tolerance();

  console.log('\n──────────── SUMMARY ────────────');
  const failed = assertions.filter((x) => !x.pass);
  console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
  if (failed.length > 0) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.desc} (${f.detail})`);
    process.exitCode = 1;
  }
}

const watchdog = setTimeout(() => {
  console.error('[restart-persistence-check] watchdog: hung for 40s, forcing exit');
  process.exit(1);
}, 40_000);

main()
  .then(() => {
    clearTimeout(watchdog);
    process.exit(process.exitCode ?? 0);
  })
  .catch((err) => {
    clearTimeout(watchdog);
    console.error('[restart-persistence-check] fatal:', err);
    process.exit(1);
  });
