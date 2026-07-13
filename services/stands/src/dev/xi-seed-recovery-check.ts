/**
 * Dev-only verification script (NOT part of the service — never imported by
 * src/index.ts). Proves the Starting XI survives a restart, end-to-end, over
 * a REAL process boundary — same "real child process, nothing shared" style
 * as restart-persistence-check.ts.
 *
 * Root cause (scratchpad/starting-xi-diagnosis.md): lineups rides the TxLINE
 * scores SSE as a ONE-SHOT `Action:"lineups"` envelope ~45min pre-kickoff.
 * SSE never replays past events, so a service that (re)starts after the drop
 * never sees it live again. STEP 0 of this task probed the REAL
 * `/api/scores/snapshot/{fid}` endpoint (finished fixtures 18222446,
 * 18213979) with the real token: BOTH snapshots carry exactly one
 * `Action:"lineups"` envelope, and the real `parseLineups` (contracts/
 * normalize.ts) parses it cleanly (byPlayerId 52-54, non-null starting XI).
 * 18237038 (tomorrow's France-Spain, too early) carries none yet — expected.
 *
 * Given the snapshot DOES carry lineups, this proves Fix 2a: txline.ts's
 * `seedSnapshot` already replays EVERY envelope in the snapshot array
 * (lineups included) through the SAME `dispatch()` the live stream uses —
 * no lineups-specific branch was missing there. What WAS broken, found while
 * building this check by tracing the full hop (the diagnosis's data-flow map
 * jumped straight from ingest to server.ts's cache, skipping index.ts's
 * routing in between): `index.ts`'s `fixtureIdOfFeedMsg` — the chokepoint
 * that decides which match a FeedMsg belongs to before broadcastToMatch ever
 * fires — had no case for `{type:'lineup'}`. It fell through to `return
 * null`, so EVERY lineup FeedMsg (live delivery too, not just seed replay)
 * was silently dropped before ever reaching a client, restart or not. Fixing
 * only seedSnapshot without this would have left the team sheet blank
 * forever, even with a perfectly recovered roster server-side (goal/card
 * scorer names WOULD have resolved even with the routing bug present — the
 * roster latch runs unconditionally inside dispatch(), before routing is
 * even consulted — the routing bug's ONLY victim is the `{type:'lineup'}`
 * message the TEAM SHEET UI needs).
 *
 * This check proves BOTH halves against the REAL entrypoint (src/index.ts,
 * TXLINE_ENABLE=1) with a tiny local HTTP+SSE stub standing in for TxODDS —
 * never the live API, no token needed (the stub never validates auth
 * headers, so a dummy token file satisfies txline.ts's loadToken()):
 *
 *   boot1 (live delivery, no restart): the stub's snapshot endpoint starts
 *     EMPTY (a fixture that hasn't dropped lineups yet). Once boot1 is up,
 *     the stub pushes the REAL (trimmed) lineups envelope down the LIVE SSE
 *     stream, then a synthetic goal envelope for one of its real players.
 *     Asserts: a socket watching the match receives {type:'lineup'} with the
 *     real starter names, AND the goal's scorer resolves to a real name —
 *     this is the routing-bug regression: it fails at the lineup assertion
 *     alone on unfixed index.ts, even though the scorer assertion already
 *     passes (server-side roster latch is unconditional).
 *
 *   boot2 (seed recovery after a hard restart): boot1 is SIGKILLed — no
 *     graceful shutdown. A fresh child boots against the SAME stub, whose
 *     snapshot endpoint NOW returns that same real lineups envelope (mirrors
 *     the STEP 0 probe finding), while the live SSE stream stays
 *     PERMANENTLY SILENT on lineups (the one-shot has already fired — SSE
 *     never replays). Asserts: a socket watching the match STILL receives
 *     {type:'lineup'} with the real names (recovered purely from the
 *     seedSnapshot fetch, zero live help), the `[txline:seed] lineup seed`
 *     confirmation line lands in boot2's log, and a live goal fired AFTER
 *     boot2 boots still resolves its scorer's real name (proving
 *     rosterByFixture, not just the client-facing message, survived).
 *
 * The captured envelope: a REAL (trimmed) `Action:"lineups"` line for
 * fixture 18213979 (NOR-ENG, one of the two matches this bug actually hit),
 * pulled from fixtures/scores-night-20260703.jsonl in the MAIN checkout
 * (gitignored, not present in this worktree) — 3 starters + 1 bench per side
 * kept verbatim (real ids/names/rosterNumbers/positionIds), everything else
 * trimmed. Real identity, never fabricated, matching this repo's honesty law
 * even for a test fixture.
 *
 * Usage: tsx src/dev/xi-seed-recovery-check.ts (or: npm run check:xi-seed-recovery)
 */
import { type ChildProcessByStdio, spawn } from 'node:child_process';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import type { FeedMsg } from '@contracts/feed';

function log(tag: string, msg: string): void {
  console.log(`[xi-seed-recovery-check:${tag}] ${msg}`);
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

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
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

/* ── the REAL (trimmed) lineups envelope — fixture 18213979, NOR-ENG ──────
 * Pulled verbatim (see file header) from a genuine `Action:"lineups"` line
 * on the recorded night. 3 starters + 1 bench per side kept as-is; the other
 * ~22 roster entries per side trimmed. Real ids/names throughout. */
const XI_FIXTURE_ID = '18213979';
const REAL_LINEUPS_ENVELOPE = {
  FixtureId: 18213979,
  Action: 'lineups',
  Participant1IsHome: true,
  Participant1Id: 2661,
  Participant2Id: 1888,
  Ts: 1783800963537,
  Lineups: [
    {
      normativeId: 2661,
      preferredName: 'Norway',
      lineups: [
        { rosterNumber: '1', positionId: 34, starter: true, starred: false, player: { normativeId: 10093502, preferredName: 'Nyland, Orjan' } },
        { rosterNumber: '17', positionId: 35, starter: true, starred: false, player: { normativeId: 1054954, preferredName: 'Heggem, Torbjorn' } },
        { rosterNumber: '5', positionId: 35, starter: true, starred: false, player: { normativeId: 10094556, preferredName: 'Moller Wolfe, David' } },
        { rosterNumber: '13', positionId: 34, starter: false, starred: false, player: { normativeId: 10124452, preferredName: 'Selvik, Egil' } },
      ],
    },
    {
      normativeId: 1888,
      preferredName: 'England',
      lineups: [
        { rosterNumber: '8', positionId: 36, starter: true, starred: false, player: { normativeId: 10015384, preferredName: 'Anderson, Elliot' } },
        { rosterNumber: '10', positionId: 36, starter: true, starred: false, player: { normativeId: 1170403, preferredName: 'Bellingham, Jude' } },
        { rosterNumber: '18', positionId: 37, starter: true, starred: false, player: { normativeId: 911404, preferredName: 'Gordon, Anthony' } },
        { rosterNumber: '15', positionId: 35, starter: false, starred: false, player: { normativeId: 186778, preferredName: 'Burn, Dan' } },
      ],
    },
  ],
};

/** A minimal, hand-built live-wire 'goal' envelope (same style as
 * restart-persistence-check.ts's buildAnchorCheckReplayFixture) — England
 * (Participant2, away) scores via Jude Bellingham, a REAL id from the
 * trimmed roster above. Proves scorer-name resolution end-to-end. */
function buildGoalEnvelope(): unknown {
  return {
    FixtureId: 18213979,
    Action: 'goal',
    Participant1IsHome: true,
    Participant: 2, // England (away, Participant2) scores
    Score: { Participant1: { Total: { Goals: 0 } }, Participant2: { Total: { Goals: 1 } } },
    Clock: { Running: true, Seconds: 1500 },
    Data: { PlayerId: 1170403 }, // Bellingham, Jude
  };
}

/* ── a tiny local TxODDS stand-in: HTTP snapshot endpoints + SSE streams,
 * fully scriptable so the test controls exactly what "restart recovery"
 * sees. Never touches the real TxLINE API, never needs a real token. ────── */
interface TxOddsStub {
  url: string;
  /** swap what /api/scores/snapshot/:fid returns, mid-test */
  setScoresSnapshot(arr: unknown[]): void;
  /** push one more envelope down every currently-open /api/scores/stream connection */
  emitScoresLive(env: unknown): void;
  close(): Promise<void>;
}

function startTxOddsStub(): Promise<TxOddsStub> {
  return new Promise((resolve) => {
    let scoresSnapshot: unknown[] = [];
    const scoresConns = new Set<ServerResponse>();

    const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? '';
      if (url.startsWith('/api/scores/snapshot/')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(scoresSnapshot));
        return;
      }
      if (url.startsWith('/api/odds/snapshot/')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('[]'); // odds unused in this check
        return;
      }
      if (url === '/api/scores/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        res.write(': connected\n\n');
        scoresConns.add(res);
        req.on('close', () => scoresConns.delete(res));
        return;
      }
      if (url === '/api/odds/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        res.write(': connected\n\n'); // odds unused — never sends more
        return;
      }
      res.writeHead(404);
      res.end();
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      resolve({
        url: `http://127.0.0.1:${port}`,
        setScoresSnapshot(arr) {
          scoresSnapshot = arr;
        },
        emitScoresLive(env) {
          const payload = `event: message\ndata: ${JSON.stringify(env)}\n\n`;
          for (const res of scoresConns) res.write(payload);
        },
        close() {
          return new Promise<void>((res2) => {
            for (const c of scoresConns) c.end();
            server.close(() => res2());
          });
        },
      });
    });
  });
}

/* ── spawn the REAL server as a child process (same discipline as
 * restart-persistence-check.ts: detached process group, SIGKILL the whole
 * group so tsx's shim can never orphan the real node server underneath). ─ */
const STANDS_ROOT = fileURLToPath(new URL('../../', import.meta.url)); // services/stands/
const TSX_BIN = path.join(STANDS_ROOT, 'node_modules', '.bin', 'tsx');

interface BootedServer {
  proc: ChildProcessByStdio<null, Readable, Readable>;
  port: number;
  getOutput(): string;
}

function bootServer(overrides: Record<string, string | undefined>): Promise<BootedServer> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = { ...process.env, PORT: '0', REPLAY_FILE: '' };
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
      process.kill(-proc.pid!, 'SIGKILL'); // whole process group — see bootServer comment above
    } catch {
      proc.kill('SIGKILL');
    }
  });
}

type LineupFeedMsg = Extract<FeedMsg, { type: 'lineup' }>;
type ScoreFeedMsg = Extract<FeedMsg, { type: 'score' }>;

/** Watches one ws connection for the FeedMsg types this check cares about. */
function watchFeed(ws: WebSocket): { lineup: LineupFeedMsg | null; scores: ScoreFeedMsg[] } {
  const seen: { lineup: LineupFeedMsg | null; scores: ScoreFeedMsg[] } = { lineup: null, scores: [] };
  ws.on('message', (raw) => {
    let m: FeedMsg;
    try {
      m = JSON.parse(raw.toString()) as FeedMsg;
    } catch {
      return;
    }
    if (m.type === 'lineup') seen.lineup = m;
    if (m.type === 'score') seen.scores.push(m);
  });
  return seen;
}

async function scenarioXiSeedRecovery(): Promise<void> {
  const stub = await startTxOddsStub();
  log('setup', `stub TxODDS up at ${stub.url}`);

  const tokenDir = mkdtempSync(path.join(tmpdir(), 'rooot-xi-seed-token-'));
  const tokenFile = path.join(tokenDir, 'fake-token.json');
  // dummy values only — the stub never checks auth headers, and this file is
  // never the real .secrets/txline-token.json (never read, never copied).
  writeFileSync(tokenFile, JSON.stringify({ jwt: 'not-a-real-jwt', apiToken: 'not-a-real-api-token' }));

  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-xi-seed-data-'));

  const commonEnv = {
    TXLINE_ENABLE: '1',
    TXLINE_API: stub.url,
    TXLINE_TOKEN_FILE: tokenFile,
    TXLINE_FIXTURES: XI_FIXTURE_ID,
    STANDS_DATA_DIR: dataDir,
    STANDS_SNAPSHOT_INTERVAL_MS: '30000',
  };

  try {
    // ── boot1: pre-drop state (empty snapshot) + a LIVE lineups delivery ────
    stub.setScoresSnapshot([]);
    const boot1 = await bootServer(commonEnv);
    log('boot1', `up on port ${boot1.port} (empty snapshot — lineups hasn't dropped yet)`);

    const url1 = `ws://127.0.0.1:${boot1.port}`;
    const watcher1 = await connect(`${url1}/?matchId=${XI_FIXTURE_ID}`);
    const seen1 = watchFeed(watcher1);
    await sleep(200);
    assert('boot1 sanity: before any delivery, the team sheet is genuinely empty (nothing cached to fake a pass)', seen1.lineup === null, `lineup=${JSON.stringify(seen1.lineup)}`);

    stub.emitScoresLive(REAL_LINEUPS_ENVELOPE);
    const gotLiveLineup = await waitFor(() => seen1.lineup !== null, 3000);
    assert(
      'boot1 (LIVE delivery, no restart involved): a socket watching the match receives {type:"lineup"} with the real starting XI — this is the routing-bug regression (index.ts fixtureIdOfFeedMsg had no "lineup" case, so this used to silently never arrive even with zero restarts)',
      gotLiveLineup &&
        !!seen1.lineup &&
        seen1.lineup.lineup.home.some((p) => p.name === 'Nyland, Orjan') &&
        seen1.lineup.lineup.away.some((p) => p.name === 'Bellingham, Jude'),
      `lineup=${JSON.stringify(seen1.lineup)}`,
    );

    stub.emitScoresLive(buildGoalEnvelope());
    const gotLiveGoal = await waitFor(() => seen1.scores.length >= 1, 3000);
    assert(
      'boot1: the live goal resolves its scorer to a real name (Bellingham, Jude) — the roster latch is unconditional inside dispatch(), independent of the routing bug above',
      gotLiveGoal && seen1.scores[0]?.ev.scorer === 'Bellingham, Jude',
      `scores=${JSON.stringify(seen1.scores)}`,
    );

    await closeAndWait(watcher1);
    await killHard(boot1.proc); // hard kill — no graceful shutdown, simulating the OOM/restart from the diagnosis
    log('boot1', 'hard-killed (SIGKILL) — the one-shot lineups envelope has now fired and will NEVER be re-sent live');

    // ── boot2: a FRESH child process — the one-shot has already fired, so the
    // live stream stays silent on lineups forever. The snapshot endpoint NOW
    // carries it (mirrors the STEP 0 probe finding against the real API for
    // finished fixtures 18222446/18213979) — seedSnapshot is the only path
    // that can recover it. ──────────────────────────────────────────────────
    stub.setScoresSnapshot([REAL_LINEUPS_ENVELOPE]);
    const boot2 = await bootServer(commonEnv);
    log('boot2', `up on port ${boot2.port} (snapshot now carries the lineups envelope; live stream will NOT repeat it)`);

    const url2 = `ws://127.0.0.1:${boot2.port}`;
    const watcher2 = await connect(`${url2}/?matchId=${XI_FIXTURE_ID}`);
    const seen2 = watchFeed(watcher2);
    const gotSeededLineup = await waitFor(() => seen2.lineup !== null, 3000);
    assert(
      'boot2 (SEED RECOVERY after a hard restart, zero live help): a socket watching the match receives {type:"lineup"} with the real starting XI, recovered purely from seedSnapshot fetching /api/scores/snapshot — the Starting XI survives the restart',
      gotSeededLineup &&
        !!seen2.lineup &&
        seen2.lineup.lineup.home.some((p) => p.name === 'Nyland, Orjan') &&
        seen2.lineup.lineup.away.some((p) => p.name === 'Bellingham, Jude'),
      `lineup=${JSON.stringify(seen2.lineup)}`,
    );

    const out2 = boot2.getOutput();
    const lineupSeedLine = out2.split('\n').find((l) => l.includes('[txline:seed] lineup seed') && l.includes(XI_FIXTURE_ID));
    assert(
      'boot2 logs an explicit lineup-seed confirmation line naming this fixture (operator-visible proof the recovery fired, and a stable line this check can grep)',
      !!lineupSeedLine && lineupSeedLine.includes('recovered'),
      lineupSeedLine ?? '(no matching line in output)',
    );

    // a live goal AFTER the restart — proves rosterByFixture (not just the
    // client-facing lineup message) survived, purely from the seed.
    stub.emitScoresLive(buildGoalEnvelope());
    const gotPostRestartGoal = await waitFor(() => seen2.scores.length >= 1, 3000);
    assert(
      'boot2: a goal fired AFTER the restart still resolves its scorer to a real name — server-side roster state (not just the client message) survived the restart via the seed',
      gotPostRestartGoal && seen2.scores[0]?.ev.scorer === 'Bellingham, Jude',
      `scores=${JSON.stringify(seen2.scores)}`,
    );

    await closeAndWait(watcher2);
    await killHard(boot2.proc);
  } finally {
    await stub.close();
    rmSync(tokenDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  await scenarioXiSeedRecovery();

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
  console.error('[xi-seed-recovery-check] watchdog: hung for 30s, forcing exit');
  process.exit(1);
}, 30_000);

main()
  .then(() => {
    clearTimeout(watchdog);
    process.exit(process.exitCode ?? 0);
  })
  .catch((err) => {
    clearTimeout(watchdog);
    console.error('[xi-seed-recovery-check] fatal:', err);
    process.exit(1);
  });
