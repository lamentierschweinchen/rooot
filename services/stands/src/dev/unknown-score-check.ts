/**
 * ROOOT dev check — REFUSING TO INVENT A FINAL SCORE (Codex pre-match audit,
 * finding 1).
 *
 * The score channel is edge-triggered: it speaks only when a goal, penalty
 * outcome, or correction happens. So "no cached score at FULL_TIME" is
 * ambiguous, and the two readings have opposite consequences:
 *
 *   - watched from kickoff, never heard a goal  → genuinely 0–0, seal it
 *   - joined late (a restart whose snapshot seeding missed the score)
 *     → we do NOT know the score, and grading every prediction against an
 *       invented 0–0 would anchor a lie forever
 *
 * This check drives the REAL server through the second case: a replay whose
 * first status is FULL_TIME (no kickoff, no goals ever seen) and asserts the
 * server refuses — no verdicts, no record, an explicit refusal in the log —
 * and then, when the real score finally arrives on the wire, that the
 * re-check picks it up and completes the resolution with the TRUE score.
 *
 * Usage: tsx src/dev/unknown-score-check.ts (or: npm run check:unknown-score)
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
  console.log(`[unknown-score-check:${tag}] ${msg}`);
}
const assertions: Array<{ desc: string; pass: boolean; detail: string }> = [];
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

const STANDS_ROOT = fileURLToPath(new URL('../../', import.meta.url));
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
    const proc = spawn(TSX_BIN, ['src/index.ts'], { cwd: STANDS_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    const chunks: string[] = [];
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`no listening port within 10s:\n${chunks.join('')}`));
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

const FIXTURE_ID = '18175918'; // a real fixture id so fixtureInfo/accumulators resolve

/** The late-joiner's wire: PRE, then straight to FULL_TIME — no kickoff status
 * (so nothing proves we were listening) and no goal ever. Then, ~9s later, the
 * REAL score arrives (a snapshot seed landing late / a correction), which the
 * re-check must pick up. */
function buildLateJoinFixture(): string {
  const base = Date.now();
  const fid = Number(FIXTURE_ID);
  const lines = [
    { at: base, env: { FixtureId: fid, Participant1IsHome: true, Action: 'status', StatusId: 1, Data: { StatusId: 1 } } }, // PRE only — never FIRST_HALF
    { at: base + 2500, env: { FixtureId: fid, Participant1IsHome: true, Action: 'status', StatusId: 5, Data: { StatusId: 5 }, Clock: { Running: false, Seconds: 5400 } } }, // FULL_TIME, score unknown
    // the truth arrives late — the shape a snapshot seed replays: a scoring
    // envelope carrying the authoritative running total (2–1)
    { at: base + 12_000, env: { FixtureId: fid, Participant1IsHome: true, Action: 'goal', Participant: 1, Score: { Participant1: { Total: { Goals: 2 } }, Participant2: { Total: { Goals: 1 } } }, Clock: { Running: false, Seconds: 5400 } } },
  ];
  return lines.map(({ at, env }) => JSON.stringify({ receivedAtMs: at, event: 'message', data: JSON.stringify(env) })).join('\n') + '\n';
}

function sentimentFiles(dataDir: string): string[] {
  const dir = path.join(dataDir, 'sentiment');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith(`${FIXTURE_ID}-`) && f.endsWith('.json'));
}

async function main(): Promise<void> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-unknown-score-'));
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'rooot-unknown-score-fx-'));
  let server: BootedServer | null = null;
  try {
    const replayFile = path.join(fixtureDir, 'late-join.jsonl');
    writeFileSync(replayFile, buildLateJoinFixture());
    log('setup', `dataDir=${dataDir} replayFile=${replayFile}`);

    server = await bootServer({
      STANDS_DATA_DIR: dataDir,
      STANDS_SNAPSHOT_INTERVAL_MS: '1200',
      REPLAY_FILE: replayFile,
      REPLAY_FIXTURE: FIXTURE_ID,
      RELAYER_KEYPAIR: undefined,
      RELAYER_KEYPAIR_FILE: undefined,
    });
    log('boot', `up on port ${server.port}`);

    const fan = await connect(`ws://127.0.0.1:${server.port}`);
    const cap = attachVerdictCapture(fan, FIXTURE_ID);
    send(fan, { type: 'hello', matchId: FIXTURE_ID, anonId: 'unknown-score-fan', side: 'home' });
    await sleep(150);
    send(fan, { type: 'predict', matchId: FIXTURE_ID, anonId: 'unknown-score-fan', home: 2, away: 1, atMs: Date.now() });

    // FULL_TIME lands at ~+2.5s with NO score known. The server must refuse.
    const refused = await waitFor(() => server!.getOutput().includes('REFUSING to fabricate 0–0'), 12_000);
    assert('the server REFUSES to invent a final score when it never watched the match', refused, refused ? 'logged the refusal' : '(no refusal line)');

    await sleep(1500);
    assert(
      'no verdicts were sent against an invented score',
      cap.verdicts.length === 0,
      `verdicts=${JSON.stringify(cap.verdicts)}`,
    );
    assert('no record was written against an invented score', sentimentFiles(dataDir).length === 0, `files=${JSON.stringify(sentimentFiles(dataDir))}`);
    assert(
      'and the fabricated-0–0 path did NOT run (no goalless-wire settle for a match we never heard start)',
      !server.getOutput().includes('goalless wire, watched from kickoff'),
      'no goalless settle line',
    );

    // the real score arrives at ~+12s; the re-check (10s cadence) must catch it
    const recovered = await waitFor(() => server!.getOutput().includes('the real final score arrived'), 45_000);
    assert('when the REAL score finally arrives, the re-check resolves the match', recovered, recovered ? 'logged the late resolution' : '(no recovery line)');

    const gotVerdict = await waitFor(() => cap.verdicts.length >= 1, 15_000);
    assert(
      'the fan is graded against the TRUE score (2–1), never the invented one',
      gotVerdict && cap.verdicts[0]?.final.home === 2 && cap.verdicts[0]?.final.away === 1 && cap.verdicts[0]?.verdict === 'exact',
      `verdict=${JSON.stringify(cap.verdicts[0])}`,
    );

    const sealed = await waitFor(() => sentimentFiles(dataDir).length === 1, 60_000);
    assert('the record seals with the true score', sealed, `files=${JSON.stringify(sentimentFiles(dataDir))}`);
    if (sealed) {
      const rec = JSON.parse(readFileSync(path.join(dataDir, 'sentiment', sentimentFiles(dataDir)[0]!), 'utf8')) as { finalScore?: { home: number; away: number } };
      assert('the sealed record carries 2–1, not 0–0', rec.finalScore?.home === 2 && rec.finalScore?.away === 1, `finalScore=${JSON.stringify(rec.finalScore)}`);
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
