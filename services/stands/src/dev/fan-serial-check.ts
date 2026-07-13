/**
 * Dev-only verification script (NOT part of the service — never imported by
 * src/index.ts). Proves THE FAN SERIAL (archive/design-docs-consumed/design/HANDOFF-2026-07-10-fan-serial.md,
 * the coordinator's accepted MARGIN amendment — "Nº 001 = the first fan
 * through the door") end-to-end:
 *
 *   A. scenarioMintOrderAndResend — in-process (createStandsServer, real ws
 *      clients over real WebSocket connections — same pattern as
 *      presence-cheer-check.ts / verdict-replay-check.ts's early phases): fan
 *      A hellos WITH a side first → welcome fanNo===1; fan B second →
 *      fanNo===2. A re-hellos on the SAME socket → welcome resent, STILL 1
 *      (never reassigned). A reconnects on a BRAND NEW socket (same anonId)
 *      → welcome resent again, still 1 — and a genuinely NEW third fan right
 *      after still gets Nº3, proving none of A's resends/reconnects ever
 *      advanced the counter.
 *   B. scenarioSideLessNeverMints — a side-less hello for a fresh anonId
 *      gets NO welcome at all and consumes NO number (proven by the very
 *      next side-carrying fan still getting the expected next serial, not
 *      one skipped); the SAME anonId re-helloing WITH a side later mints
 *      normally, right where the counter left off.
 *   C. scenarioRestartContinuity — a REAL child-process restart (spawn the
 *      actual src/index.ts entrypoint via tsx, SIGKILL, reboot from the same
 *      STANDS_DATA_DIR — same discipline as restart-persistence-check.ts):
 *      fan A (minted Nº1 pre-kill) reconnects post-restart with a side →
 *      still Nº1; a brand-new fan mints Nº3 (both 1 and 2 were already taken
 *      pre-kill) — proves nextFanNo itself survived, not just the map.
 *   D. scenarioV3Tolerance — a hand-written v3-shaped snapshot (real
 *      rooted/fanStats fields, but NO top-level `fans` key at all — the exact
 *      shape a genuine pre-this-task file has) boots clean, its v3 fields
 *      still restore, and a fresh fan mints Nº1 (numbering starts over,
 *      never fabricated from the absent field).
 *
 * Usage: tsx src/dev/fan-serial-check.ts (or: npm run check:fan-serial)
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
  console.log(`[fan-serial-check:${tag}] ${msg}`);
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
/** Comfortably more than one STANDS_TICK_MS broadcast period — after this,
 * any hello already sent has been processed AND its welcome (if any) has
 * arrived. Matches presence-cheer-check.ts's SETTLE_MS convention. */
const SETTLE_MS = 300;
function settle(): Promise<void> {
  return sleep(SETTLE_MS);
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

type WelcomeWireMsg = Extract<ServerMsg, { type: 'welcome' }>;

/** Mirrors the adapter's own guard (stands-adapter.js: `m.matchId === matchId
 * && m.anonId === me`) — only welcomes addressed to THIS anonId, in THIS
 * match, are captured. */
function attachWelcomeCapture(ws: WebSocket, matchId: string, anonId: string): { welcomes: WelcomeWireMsg[] } {
  const state = { welcomes: [] as WelcomeWireMsg[] };
  ws.on('message', (raw) => {
    let m: ServerMsg;
    try {
      m = JSON.parse(raw.toString()) as ServerMsg;
    } catch {
      return;
    }
    if (m.type === 'welcome' && m.matchId === matchId && m.anonId === anonId) state.welcomes.push(m);
  });
  return state;
}

/* ── A: mint order, never-reassigned resend, counter continuity ─────────── */
async function scenarioMintOrderAndResend(url: string): Promise<number> {
  const matchId = `fanserial-mint-${Date.now()}`;
  log('A', `matchId=${matchId}`);

  // Fan A: the first side-carrying hello EVER for this anonId -> mints Nº1.
  const a1 = await connect(url);
  const capA1 = attachWelcomeCapture(a1, matchId, 'fanserial-a');
  send(a1, { type: 'hello', matchId, anonId: 'fanserial-a', side: 'home' });
  await settle();
  assert('fan A (first side-carrying hello EVER) mints Nº1', capA1.welcomes.length === 1 && capA1.welcomes[0]?.fanNo === 1, `welcomes=${JSON.stringify(capA1.welcomes)}`);

  // Fan B: a second, distinct anonId -> mints Nº2.
  const b1 = await connect(url);
  const capB1 = attachWelcomeCapture(b1, matchId, 'fanserial-b');
  send(b1, { type: 'hello', matchId, anonId: 'fanserial-b', side: 'away' });
  await settle();
  assert('fan B (second distinct fan) mints Nº2', capB1.welcomes.length === 1 && capB1.welcomes[0]?.fanNo === 2, `welcomes=${JSON.stringify(capB1.welcomes)}`);

  // Fan A re-hellos on the SAME socket (e.g. a side re-pick) — welcome
  // resent, STILL Nº1 — never reassigned.
  send(a1, { type: 'hello', matchId, anonId: 'fanserial-a', side: 'home' });
  await settle();
  assert(
    "fan A's re-hello (same socket) resends the welcome — still Nº1, not a new number",
    capA1.welcomes.length === 2 && capA1.welcomes[1]?.fanNo === 1,
    `welcomes=${JSON.stringify(capA1.welcomes)}`,
  );

  // Fan A reconnects on a BRAND NEW socket, same anonId — welcome resent
  // again on THIS socket, still Nº1.
  const a2 = await connect(url);
  const capA2 = attachWelcomeCapture(a2, matchId, 'fanserial-a');
  send(a2, { type: 'hello', matchId, anonId: 'fanserial-a', side: 'home' });
  await settle();
  assert(
    'fan A reconnecting on a BRAND NEW socket (same anonId) is welcomed again with the SAME Nº1',
    capA2.welcomes.length === 1 && capA2.welcomes[0]?.fanNo === 1,
    `welcomes=${JSON.stringify(capA2.welcomes)}`,
  );

  // A third, genuinely NEW fan proves none of A's resends/reconnects ever
  // consumed a number: the counter is still exactly where B left it (2) —
  // this fan gets Nº3, not 4 or 5.
  const c1 = await connect(url);
  const capC1 = attachWelcomeCapture(c1, matchId, 'fanserial-c');
  send(c1, { type: 'hello', matchId, anonId: 'fanserial-c', side: 'home' });
  await settle();
  assert(
    "counter continuity: A's re-hello + reconnect consumed NO numbers — the next genuinely new fan gets Nº3, not 4",
    capC1.welcomes.length === 1 && capC1.welcomes[0]?.fanNo === 3,
    `welcomes=${JSON.stringify(capC1.welcomes)}`,
  );

  await closeAndWait(a1);
  await closeAndWait(a2);
  await closeAndWait(b1);
  await closeAndWait(c1);
  return 4; // the next never-before-seen anonId to hello with a side should mint Nº4
}

/* ── B: side-less hellos structurally never mint ────────────────────────── */
async function scenarioSideLessNeverMints(url: string, nextExpected: number): Promise<number> {
  const matchId = `fanserial-sideless-${Date.now()}`;
  log('B', `matchId=${matchId} nextExpected=${nextExpected}`);

  // A side-less hello for a FRESH anonId — the diagnostics/canary-smoke
  // shape (no `side` field at all).
  const s1 = await connect(url);
  const capS1 = attachWelcomeCapture(s1, matchId, 'fanserial-sideless');
  send(s1, { type: 'hello', matchId, anonId: 'fanserial-sideless' });
  await settle();
  assert('a side-less hello receives NO welcome at all', capS1.welcomes.length === 0, `welcomes=${JSON.stringify(capS1.welcomes)}`);

  // Prove it also consumed NO number: the very next side-carrying fan still
  // gets exactly `nextExpected`, not nextExpected+1.
  const d1 = await connect(url);
  const capD1 = attachWelcomeCapture(d1, matchId, 'fanserial-d');
  send(d1, { type: 'hello', matchId, anonId: 'fanserial-d', side: 'away' });
  await settle();
  assert(
    `the side-less hello minted nothing — the next side-carrying fan still gets Nº${nextExpected}`,
    capD1.welcomes.length === 1 && capD1.welcomes[0]?.fanNo === nextExpected,
    `welcomes=${JSON.stringify(capD1.welcomes)}`,
  );

  // The SAME (still-unminted) anonId re-hellos WITH a side later, on the SAME
  // socket — mints normally, right where the counter left off.
  send(s1, { type: 'hello', matchId, anonId: 'fanserial-sideless', side: 'home' });
  await settle();
  assert(
    `a fan who first hello'd side-less mints Nº${nextExpected + 1} the moment they re-hello WITH a side`,
    capS1.welcomes.length === 1 && capS1.welcomes[0]?.fanNo === nextExpected + 1,
    `welcomes=${JSON.stringify(capS1.welcomes)}`,
  );

  await closeAndWait(s1);
  await closeAndWait(d1);
  return nextExpected + 2;
}

/* ── spawn the REAL server as a child process (same discipline as
 * restart-persistence-check.ts): detached: true makes the child its own
 * process-group leader, so killHard can SIGKILL the WHOLE group — the tsx
 * .bin shim spawns the real node server as ITS OWN child, and killing only
 * the shim pid would orphan the server (it keeps running, still writing
 * snapshots into dataDir and racing the next boot). ─────────────────────── */
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
    // main()'s in-process phase (scenarios A/B) sets STANDS_SNAPSHOT_PATH on
    // THIS process so it never touches a real local snapshot file — but that
    // mutation persists in process.env for the rest of the script's life, and
    // env spreads into every child below. Left alone, every child spawned
    // here would inherit that ONE fixed path and silently ignore its own
    // per-call STANDS_DATA_DIR (they'd all pile into the same file instead of
    // each getting an isolated dataDir) — strip it unconditionally so each
    // child resolves its snapshot path purely from ITS OWN STANDS_DATA_DIR.
    delete env.STANDS_SNAPSHOT_PATH;
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete env[k];
      else env[k] = v;
    }
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
    if (proc.exitCode !== null || proc.signalCode !== null) {
      resolve();
      return;
    }
    proc.once('exit', () => resolve());
    try {
      process.kill(-proc.pid!, 'SIGKILL'); // whole process group
    } catch {
      proc.kill('SIGKILL'); // group already gone — fall back to the shim pid
    }
  });
}

/* ── C: a REAL restart — counter + map both survive, never reassigned ───── */
async function scenarioRestartContinuity(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-fanserial-restart-'));
  const matchId = `fanserial-restart-${Date.now()}`;
  log('C', `dataDir=${dataDir} matchId=${matchId}`);
  try {
    const boot1 = await bootServer({ STANDS_DATA_DIR: dataDir, STANDS_SNAPSHOT_INTERVAL_MS: '1200' });
    log('C-boot1', `up on port ${boot1.port}`);
    const url1 = `ws://127.0.0.1:${boot1.port}`;

    const fanA = await connect(url1);
    const capA = attachWelcomeCapture(fanA, matchId, 'fanserial-restart-a');
    send(fanA, { type: 'hello', matchId, anonId: 'fanserial-restart-a', side: 'home' });
    await sleep(150);
    assert('boot1: fan A mints Nº1', capA.welcomes.length === 1 && capA.welcomes[0]?.fanNo === 1, `welcomes=${JSON.stringify(capA.welcomes)}`);

    const fanB = await connect(url1);
    const capB = attachWelcomeCapture(fanB, matchId, 'fanserial-restart-b');
    send(fanB, { type: 'hello', matchId, anonId: 'fanserial-restart-b', side: 'away' });
    await sleep(150);
    assert('boot1: fan B mints Nº2', capB.welcomes.length === 1 && capB.welcomes[0]?.fanNo === 2, `welcomes=${JSON.stringify(capB.welcomes)}`);

    // let at least one real periodic snapshot (interval 1200ms above) land.
    await sleep(1700);

    await closeAndWait(fanA);
    await closeAndWait(fanB);
    await killHard(boot1.proc); // hard kill — no graceful shutdown, no flush-on-exit
    log('C-boot1', 'hard-killed (SIGKILL)');

    // ── boot2: fresh process, same dir — the real reboot ──────────────────
    const boot2 = await bootServer({ STANDS_DATA_DIR: dataDir, STANDS_SNAPSHOT_INTERVAL_MS: '30000' });
    log('C-boot2', `up on port ${boot2.port}`);
    await sleep(200);
    const restoredLine = boot2.getOutput().split('\n').find((l) => l.includes('[stands:registry] restored'));
    assert('boot2 logs a restored-snapshot line', !!restoredLine, restoredLine ?? '(no matching line)');

    const url2 = `ws://127.0.0.1:${boot2.port}`;

    // fan A reconnects post-restart, WITH a side — still Nº1, never reassigned.
    const fanA2 = await connect(url2);
    const capA2 = attachWelcomeCapture(fanA2, matchId, 'fanserial-restart-a');
    send(fanA2, { type: 'hello', matchId, anonId: 'fanserial-restart-a', side: 'home' });
    await sleep(250);
    assert(
      'boot2: fan A reconnecting post-restart with a side is welcomed again with the SAME Nº1',
      capA2.welcomes.length === 1 && capA2.welcomes[0]?.fanNo === 1,
      `welcomes=${JSON.stringify(capA2.welcomes)}`,
    );

    // counter continuity: a brand-new fan mints Nº3, not Nº1 or Nº2 (both
    // already taken pre-kill) — proves nextFanNo itself survived the
    // restart, not just the anonId->fanNo map.
    const fanE = await connect(url2);
    const capE = attachWelcomeCapture(fanE, matchId, 'fanserial-restart-e');
    send(fanE, { type: 'hello', matchId, anonId: 'fanserial-restart-e', side: 'home' });
    await sleep(250);
    assert(
      'boot2: counter continuity — a brand-new fan post-restart mints Nº3 (both 1 and 2 were already taken pre-kill)',
      capE.welcomes.length === 1 && capE.welcomes[0]?.fanNo === 3,
      `welcomes=${JSON.stringify(capE.welcomes)}`,
    );

    await closeAndWait(fanA2);
    await closeAndWait(fanE);
    await killHard(boot2.proc);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

/* ── D: tolerant load of a pre-fan-serial (v3) snapshot ──────────────────── */
async function scenarioV3Tolerance(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-fanserial-v3tolerance-'));
  const matchId = 'v3-legacy-fanserial-match';
  try {
    const v3Snapshot = {
      version: 3,
      savedAtMs: Date.now(),
      matches: [
        {
          matchId,
          rooted: [['v3-legacy-fan', 'home']],
          rooms: [],
          predictions: [],
          predictLocked: false,
          verdicts: [],
          moments: [],
          resolved: false,
          fanStats: [],
        },
      ],
      // deliberately NO top-level `fans` key — the exact shape a genuine
      // pre-this-task v3 file has (fanStats shipped one task before THE FAN
      // SERIAL; `fans` is a top-level SnapshotFile field, not per-match, so
      // it doesn't exist anywhere in a real v3 file).
    };
    writeFileSync(path.join(dataDir, 'rooot-stands-snapshot.json'), JSON.stringify(v3Snapshot));
    log('D', `hand-wrote a v3-shaped snapshot (no fans key) at ${dataDir}`);

    const boot = await bootServer({ STANDS_DATA_DIR: dataDir, STANDS_SNAPSHOT_INTERVAL_MS: '30000' });
    await sleep(200);
    const restoredLine = boot.getOutput().split('\n').find((l) => l.includes('[stands:registry] restored'));
    assert('a v3 file (no fans key) boots without crashing and logs it as v3', !!restoredLine && restoredLine.includes('(v3)'), restoredLine ?? '(no matching line)');

    const url = `ws://127.0.0.1:${boot.port}`;

    // "loads clean" means the WHOLE snapshot, not just fan numbering — the
    // v3 rooted fact still restores alongside the absent `fans` field.
    const observer = await connect(`${url}/?matchId=${encodeURIComponent(matchId)}`);
    const seen: { standsHome: number } = { standsHome: -1 };
    observer.on('message', (raw) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(raw.toString()) as ServerMsg;
      } catch {
        return;
      }
      if (m.type === 'stands' && m.matchId === matchId) seen.standsHome = m.counts.home;
    });
    send(observer, { type: 'hello', matchId, anonId: 'v3-tolerance-observer' });
    await sleep(400);
    assert('the v3 rooted fact still restores alongside the absent fans field (home=1)', seen.standsHome === 1, `standsHome=${seen.standsHome}`);

    // numbering starts fresh at Nº1 — nothing to restore for `fans`, never
    // fabricated for a fan who connected before this shipped.
    const fresh = await connect(url);
    const capFresh = attachWelcomeCapture(fresh, matchId, 'v3-tolerance-fresh-fan');
    send(fresh, { type: 'hello', matchId, anonId: 'v3-tolerance-fresh-fan', side: 'away' });
    await sleep(250);
    assert(
      'numbering starts fresh at Nº1 on a v3 file with no fans field — never fabricated for a fan who connected before this shipped',
      capFresh.welcomes.length === 1 && capFresh.welcomes[0]?.fanNo === 1,
      `welcomes=${JSON.stringify(capFresh.welcomes)}`,
    );

    await closeAndWait(observer);
    await closeAndWait(fresh);
    await killHard(boot.proc);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  // Set BEFORE importing ../server (transitively ./registry -> ./snapshot,
  // which captures this env var into a module-level constant at import time)
  // so this check never touches a real local snapshot file — a dynamic
  // import is required here since static imports are hoisted ahead of any
  // other top-level code, including this assignment (matches
  // presence-cheer-check.ts's identical pattern). UNLIKE that file's fixed
  // literal path, THE FAN SERIAL is registry-GLOBAL (not matchId-scoped), so
  // a leftover file from a PRIOR run of this same check would silently
  // poison this run's absolute fanNo assertions (a fresh-matchId-per-scenario
  // trick, which is what makes a fixed path safe elsewhere, doesn't help
  // here) — every invocation gets its own never-before-seen path instead.
  process.env.STANDS_SNAPSHOT_PATH ||= path.join(tmpdir(), `rooot-fan-serial-check-${process.pid}-${Date.now()}.json`);
  const { createStandsServer } = await import('../server');

  const { httpServer, registry } = createStandsServer();
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const addr = httpServer.address();
  if (addr === null || typeof addr === 'string') throw new Error('failed to bind an ephemeral port');
  const url = `ws://127.0.0.1:${addr.port}`;
  log('setup', `stands server up on ephemeral port ${addr.port}`);

  try {
    const nextAfterA = await scenarioMintOrderAndResend(url);
    await scenarioSideLessNeverMints(url, nextAfterA);
  } finally {
    registry.stop();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }

  // C and D each spawn their own REAL child process(es) with a fresh,
  // isolated STANDS_DATA_DIR — independent of the in-process server above
  // and of each other.
  await scenarioRestartContinuity();
  await scenarioV3Tolerance();

  console.log('\n──────────── SUMMARY ────────────');
  const failed = assertions.filter((x) => !x.pass);
  console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
  if (failed.length > 0) {
    console.log('FAILED:');
    for (const f of failed) console.log(`  - ${f.desc} (${f.detail})`);
    process.exitCode = 1;
  }
}

// two real child-process restart/boot scenarios (C: 2 boots + a 1700ms
// snapshot-interval wait; D: 1 boot) on top of the in-process settle()s —
// 60s keeps a comfortable margin over realistic tsx cold-start + wait time.
const watchdog = setTimeout(() => {
  console.error('[fan-serial-check] watchdog: hung for 60s, forcing exit');
  process.exit(1);
}, 60_000);

main()
  .then(() => {
    clearTimeout(watchdog);
    process.exit(process.exitCode ?? 0);
  })
  .catch((err) => {
    clearTimeout(watchdog);
    console.error('[fan-serial-check] fatal:', err);
    process.exit(1);
  });
