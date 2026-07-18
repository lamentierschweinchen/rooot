/**
 * ROOOT dev check — THE 0–0 SEAL (Codex pre-match review, finding 2).
 *
 * normalize emits a 'score' message only on goal / penalty-outcome /
 * correction actions — so a match that genuinely finishes 0–0 reaches
 * FULL_TIME with NO cached score at all. The old FT branch's numeric guard
 * then silently dropped the ENTIRE seal: no verdicts, no sentiment record,
 * scarves refusing to mint — total record loss on a goalless night (a real
 * possibility in a knockout that heads to penalties).
 *
 * This check drives the REAL server over a status-only replay fixture
 * (PRE → FIRST_HALF → FULL_TIME, not a single goal) and asserts the whole
 * seal happens anyway:
 *   1. the FT branch logs the explicit "settling 0–0 (goalless wire)" line
 *      (the honest fallback, never silent),
 *   2. a fan who predicted 0–0 receives an 'exact' verdict graded against
 *      final {0,0},
 *   3. exactly ONE sentiment record lands on disk (after the FT reaction
 *      window closes — THE SEAL defers past open windows by design) and it
 *      carries finalScore {home:0, away:0}.
 *
 * Same harness conventions as restart-persistence-check.ts (spawn the real
 * server, isolated temp dataDir, a REAL fixture id so fixtureInfo resolves).
 *
 * Usage: tsx src/dev/zero-zero-seal-check.ts (or: npm run check:zero-zero)
 */
import { type ChildProcessByStdio, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import type { ClientMsg, PredictVerdictMsg, ServerMsg } from '@contracts/crowd';

function log(tag: string, msg: string): void {
  console.log(`[zero-zero-seal-check:${tag}] ${msg}`);
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

async function waitFor(cond: () => boolean, timeoutMs: number, stepMs = 200): Promise<boolean> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (cond()) return true;
    await sleep(stepMs);
  }
  return cond();
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
    // detached: group-leader so killHard can SIGKILL the tsx shim AND the real
    // server under it (see restart-persistence-check.ts's bootServer comment).
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
      process.kill(-proc.pid!, 'SIGKILL');
    } catch {
      proc.kill('SIGKILL');
    }
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

/** A REAL fixture id (teams.ts FIXTURE_INFO) so fixtureInfo/accumulators
 * resolve — same identity-borrowing convention as restart-persistence-check's
 * ANCHOR_CHECK_FIXTURE_ID, in an isolated temp dataDir. */
const FIXTURE_ID = '18175918';

/** Status-only wire: PRE → FIRST_HALF → FULL_TIME. NOT ONE goal line — the
 * whole point. Envelope shapes per contracts/normalize.ts. */
function buildGoallessReplayFixture(): string {
  const base = Date.now();
  const fid = Number(FIXTURE_ID);
  const lines = [
    { at: base, env: { FixtureId: fid, Participant1IsHome: true, Action: 'status', StatusId: 1, Data: { StatusId: 1 } } }, // PRE
    { at: base + 2000, env: { FixtureId: fid, Participant1IsHome: true, Action: 'status', StatusId: 2, Data: { StatusId: 2 }, Clock: { Running: true, Seconds: 0 } } }, // FIRST_HALF — locks predictions
    { at: base + 2600, env: { FixtureId: fid, Participant1IsHome: true, Action: 'status', StatusId: 5, Data: { StatusId: 5 }, Clock: { Running: false, Seconds: 5400 } } }, // FULL_TIME — goalless
  ];
  return lines.map(({ at, env }) => JSON.stringify({ receivedAtMs: at, event: 'message', data: JSON.stringify(env) })).join('\n') + '\n';
}

function sentimentFiles(dataDir: string): string[] {
  const dir = path.join(dataDir, 'sentiment');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith(`${FIXTURE_ID}-`) && f.endsWith('.json'));
}

async function main(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-zero-zero-check-'));
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rooot-zero-zero-fixture-'));
  let server: BootedServer | null = null;
  try {
    const replayFile = path.join(fixtureDir, 'synthetic-goalless.jsonl');
    writeFileSync(replayFile, buildGoallessReplayFixture());
    log('setup', `dataDir=${dataDir} matchId=${FIXTURE_ID} replayFile=${replayFile}`);

    server = await bootServer({
      STANDS_DATA_DIR: dataDir,
      STANDS_SNAPSHOT_INTERVAL_MS: '1200',
      REPLAY_FILE: replayFile,
      REPLAY_FIXTURE: FIXTURE_ID,
      RELAYER_KEYPAIR: undefined,
      RELAYER_KEYPAIR_FILE: undefined,
    });
    log('boot', `up on port ${server.port} (replaying ${replayFile})`);

    const url = `ws://127.0.0.1:${server.port}`;
    const exactFan = await connect(url);
    const wrongFan = await connect(url);
    const capExact = attachVerdictCapture(exactFan, FIXTURE_ID);
    const capWrong = attachVerdictCapture(wrongFan, FIXTURE_ID);
    send(exactFan, { type: 'hello', matchId: FIXTURE_ID, anonId: 'zz-exact-fan', side: 'home' });
    send(wrongFan, { type: 'hello', matchId: FIXTURE_ID, anonId: 'zz-wrong-fan', side: 'away' });
    await sleep(150);
    // both predict inside the ~2s pre-kickoff window
    send(exactFan, { type: 'predict', matchId: FIXTURE_ID, anonId: 'zz-exact-fan', home: 0, away: 0, atMs: Date.now() });
    send(wrongFan, { type: 'predict', matchId: FIXTURE_ID, anonId: 'zz-wrong-fan', home: 2, away: 1, atMs: Date.now() });

    // FULL_TIME hits at ~+2.6s; verdicts are sent in the same dispatch tick.
    const gotVerdicts = await waitFor(() => capExact.verdicts.length >= 1 && capWrong.verdicts.length >= 1, 8000);
    assert(
      'FULL_TIME on a goalless wire still resolves verdicts (the old guard silently dropped everything)',
      gotVerdicts,
      `exact=${JSON.stringify(capExact.verdicts)} wrong=${JSON.stringify(capWrong.verdicts)}`,
    );
    const vExact = capExact.verdicts[0];
    assert(
      'the 0–0 predictor grades EXACT against final {0,0}',
      vExact?.verdict === 'exact' && vExact.final.home === 0 && vExact.final.away === 0,
      `verdict=${JSON.stringify(vExact)}`,
    );
    const vWrong = capWrong.verdicts[0];
    assert(
      'the 2–1 predictor is graded (not dropped) against the same final {0,0}',
      !!vWrong && vWrong.final.home === 0 && vWrong.final.away === 0 && vWrong.verdict !== 'exact',
      `verdict=${JSON.stringify(vWrong)}`,
    );

    const settledLine = () => server!.getOutput().includes('settling 0–0 (goalless wire)');
    assert('the FT branch logged the explicit goalless-wire settle line (honest fallback, never silent)', settledLine(), `present=${settledLine()}`);

    // THE SEAL defers past the full-time reaction window (25s) by design.
    const sealed = await waitFor(() => sentimentFiles(dataDir).length === 1, 40_000);
    assert('exactly ONE sentiment record lands on disk (after the FT reaction window)', sealed && sentimentFiles(dataDir).length === 1, `files=${JSON.stringify(sentimentFiles(dataDir))}`);
    if (sealed) {
      const rec = JSON.parse(readFileSync(path.join(dataDir, 'sentiment', sentimentFiles(dataDir)[0]!), 'utf8')) as {
        finalScore?: { home: number; away: number } | null;
        provenance?: { recordHash?: string };
      };
      assert(
        'the record carries finalScore {home:0, away:0} — a real result, never absent/fabricated',
        rec.finalScore?.home === 0 && rec.finalScore?.away === 0,
        `finalScore=${JSON.stringify(rec.finalScore)}`,
      );
      assert('the record is hashed (provenance present)', typeof rec.provenance?.recordHash === 'string' && rec.provenance.recordHash.length > 0, `hash=${rec.provenance?.recordHash?.slice(0, 12)}`);
    }
  } finally {
    if (server) await killHard(server.proc);
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(fixtureDir, { recursive: true, force: true });
  }

  const failed = assertions.filter((a) => !a.pass);
  console.log(`${assertions.length - failed.length}/${assertions.length} assertions passed`);
  if (failed.length > 0) {
    console.log('FAILED:');
    for (const f of failed) console.log(` - ${f.desc} (${f.detail})`);
    process.exit(1);
  }
}

void main();
