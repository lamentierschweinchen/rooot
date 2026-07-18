/**
 * PROVENANCE + WATERMARK CHECK (docs/DATA-ARCHITECTURE.md §4 items 2 + 4,
 * branch provenance-watermark) — proves, against a REAL booted server
 * (createStandsServer, in-process, same pattern as pulse-fix-check.ts) and a
 * REAL startTxLineIngest wired to a local fake TxODDS stub:
 *
 *   ITEM 2 — relics carry their own provenance:
 *   SCENARIO A: an odds swing captured live (MessageId/Ts alongside the
 *     parse, ingest/txline.ts's noteOddsProvenance) survives to FULL_TIME,
 *     fetchProvenanceRefs pulls the REAL validation-endpoint shape (stubbed
 *     with the actual specimen from fixtures/provenance/messi-goal-tick-
 *     proof.json — same fixture, same MessageId/Ts) and it lands in the
 *     crystallized record's provenance.txlineRefs BEFORE the hash — proven
 *     directly by recomputing hashRecord with the persisted txlineRefs
 *     (matches) vs with txlineRefs forced back to [] (does NOT match).
 *   SCENARIO B: the validation endpoint fails (500) — txlineRefs stays [],
 *     one log line, crystallize still completes (record written, no crash).
 *
 *   ITEM 4 — feed watermarks (LOG-ONLY):
 *   SCENARIO C: the odds stream is forced to end after scenario A's ticks
 *     land (a real EOF, the same path a transient network drop takes) —
 *     asserts the reconnect is picked up and the NEXT envelope for the same
 *     fixture logs "[txline:watermark] fixture … resumed, gap …".
 *   Folded into scenario A's scores sequence: two filler envelopes with Seq
 *     jumping by +6 assert the "[txline:watermark] fixture … Seq gap:" line
 *     (pattern 5 — verified monotonic-per-fixture against a real night
 *     capture first; see ingest/txline.ts's lastSeqByFixture doc comment).
 *
 * Usage: tsx src/dev/provenance-watermark-check.ts (or: npm run check:provenance)
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import type { FeedMsg } from '@contracts/feed';
import type { SentimentRecord } from '@contracts/sentiment';

function log(tag: string, msg: string): void {
  console.log(`[provenance-watermark-check:${tag}] ${msg}`);
}

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? '✓' : '✗ FAIL';
  if (!cond) failures++;
  console.log(`  ${mark}  ${label}${detail ? `  — ${detail}` : ''}`);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();
    const poll = () => {
      if (predicate()) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(poll, 40);
    };
    poll();
  });
}

/* ── capture console output so log-only behavior (watermark/Seq/provenance
 * lines) is assertable, while still printing normally ─────────────────── */
const logLines: string[] = [];
const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);
console.log = (...args: unknown[]) => {
  logLines.push(args.map((a) => String(a)).join(' '));
  origLog(...args);
};
console.warn = (...args: unknown[]) => {
  logLines.push(args.map((a) => String(a)).join(' '));
  origWarn(...args);
};
function loggedSince(fromIdx: number, needle: string): boolean {
  return logLines.slice(fromIdx).some((l) => l.includes(needle));
}

/* ── the REAL specimen (fixtures/provenance/messi-goal-tick-proof.json) ──
 * fixtureId 18175918 (ARG-CPV), exercised live Jul 4 (docs/DATA.md:31-35).
 * Used verbatim as both the odds tick that becomes the "biggestSwing"
 * candidate AND the validation-endpoint response the stub serves back for
 * its exact MessageId/Ts. */
const SPECIMEN_PATH = new URL('../../../../fixtures/provenance/messi-goal-tick-proof.json', import.meta.url);
const SPECIMEN = JSON.parse(readFileSync(SPECIMEN_PATH, 'utf8')) as {
  tick: { FixtureId: number; MessageId: string; Ts: number; Pct: string[] };
  proof: unknown;
};
const FIXTURE_SUCCESS = String(SPECIMEN.tick.FixtureId); // '18175918'
const FIXTURE_FAIL = '18179549'; // COL-GHA — also in sentiment/teams.ts FIXTURE_INFO
const DUMMY_JWT = 'check-jwt-DO-NOT-LEAK-9f3a1c';

/* ── fake TxODDS stub: streams + snapshot + validation, fully scriptable ── */
interface TxOddsStub {
  url: string;
  emitOdds(env: unknown): void;
  emitScores(env: unknown): void;
  endOddsConnections(): void;
  oddsConnectCount(): number;
  validationCalls: Array<{ messageId: string | null; ts: string | null }>;
  close(): Promise<void>;
}
function startTxOddsStub(): Promise<TxOddsStub> {
  return new Promise((resolve) => {
    const oddsConns = new Set<ServerResponse>();
    const scoresConns = new Set<ServerResponse>();
    let oddsConnects = 0;
    const validationCalls: Array<{ messageId: string | null; ts: string | null }> = [];

    const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? '';
      if (url.startsWith('/api/scores/snapshot/') || url.startsWith('/api/odds/snapshot/')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('[]'); // no seed needed — everything arrives live in this check
        return;
      }
      if (url.startsWith('/api/odds/validation')) {
        const u = new URL(url, 'http://stub.local');
        const messageId = u.searchParams.get('messageId');
        const ts = u.searchParams.get('ts');
        validationCalls.push({ messageId, ts });
        if (messageId === SPECIMEN.tick.MessageId) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(SPECIMEN.proof)); // the REAL captured response shape
          return;
        }
        // anything else (the fetch-fail scenario's messageId, or an unknown
        // one) — synthetic server failure, proving the honest-degrade path.
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'synthetic validation failure for check' }));
        return;
      }
      if (url === '/api/odds/stream') {
        oddsConnects++;
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        res.write(': connected\n\n');
        oddsConns.add(res);
        req.on('close', () => oddsConns.delete(res));
        return;
      }
      if (url === '/api/scores/stream') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
        res.write(': connected\n\n');
        scoresConns.add(res);
        req.on('close', () => scoresConns.delete(res));
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
        emitOdds(env) {
          const payload = `event: message\ndata: ${JSON.stringify(env)}\n\n`;
          for (const res of oddsConns) res.write(payload);
        },
        emitScores(env) {
          const payload = `event: message\ndata: ${JSON.stringify(env)}\n\n`;
          for (const res of scoresConns) res.write(payload);
        },
        endOddsConnections() {
          for (const res of [...oddsConns]) res.end(); // clean EOF — the reconnect path a transient drop takes
        },
        oddsConnectCount: () => oddsConnects,
        validationCalls,
        close() {
          return new Promise<void>((res2) => {
            for (const c of [...oddsConns, ...scoresConns]) c.end();
            server.close(() => res2());
          });
        },
      });
    });
  });
}

/* ── minimal FeedMsg router (index.ts's fixtureIdOfFeedMsg, trimmed to the
 * message types this check actually sends: odds/score/status/ledger) ───── */
function fixtureIdOfFeedMsg(msg: FeedMsg): string | null {
  if (msg.type === 'ledger') {
    const m = msg.msg;
    if (m.type === 'event') {
      const sep = m.ev.id.indexOf(':');
      return sep > 0 ? m.ev.id.slice(0, sep) : null;
    }
    return m.fixtureKey || null;
  }
  let raw: unknown;
  if (msg.type === 'odds') raw = msg.tick.raw;
  else if (msg.type === 'score') raw = msg.ev.raw;
  else if (msg.type === 'status') raw = msg.ev.raw;
  else return null;
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = obj.FixtureId ?? obj.fixtureId;
  return typeof id === 'number' ? String(id) : typeof id === 'string' ? id : null;
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
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.once('close', () => resolve());
    ws.close();
  });
}

/* ── odds tick builders ──────────────────────────────────────────────── */
function oddsEnv(fixtureId: string, messageId: string, ts: number, pct: [string, string, string]): unknown {
  return {
    FixtureId: Number(fixtureId),
    MessageId: messageId,
    Ts: ts,
    Bookmaker: 'TXLineStablePriceDemargined',
    BookmakerId: 10021,
    SuperOddsType: '1X2_PARTICIPANT_RESULT',
    GameState: null,
    InRunning: true,
    MarketParameters: null,
    MarketPeriod: null,
    PriceNames: ['part1', 'draw', 'part2'],
    Prices: [1000, 25000, 100000],
    Pct: pct,
  };
}
function goalEnv(fixtureId: string, seq: number, ts: number): unknown {
  return {
    FixtureId: Number(fixtureId),
    Action: 'goal',
    Participant1IsHome: true,
    Participant: 1,
    Score: { Participant1: { Total: { Goals: 1 } }, Participant2: { Total: { Goals: 0 } } },
    Clock: { Running: true, Seconds: 1500 },
    Ts: ts,
    Seq: seq,
  };
}
function fullTimeEnv(fixtureId: string, seq: number, ts: number): unknown {
  return { FixtureId: Number(fixtureId), Action: 'status', Data: { StatusId: 5 }, Clock: { Running: false, Seconds: 5400 }, Ts: ts, Seq: seq };
}
function commentEnv(fixtureId: string, seq: number, ts: number): unknown {
  // inert filler (LEDGER_ACTION_KIND has no 'comment' entry — parses to
  // nothing in score/status/ledger) — carries FixtureId/Ts/Seq only, so it
  // exercises noteFeedHealth without touching match state.
  return { FixtureId: Number(fixtureId), Action: 'comment', Ts: ts, Seq: seq };
}

async function main(): Promise<void> {
  const stub = await startTxOddsStub();
  log('setup', `fake TxODDS stub up at ${stub.url}`);

  const tokenDir = mkdtempSync(path.join(tmpdir(), 'rooot-provenance-watermark-token-'));
  const tokenFile = path.join(tokenDir, 'fake-token.json');
  writeFileSync(tokenFile, JSON.stringify({ jwt: DUMMY_JWT, apiToken: 'check-api-token' }));

  const dataDir = mkdtempSync(path.join(tmpdir(), 'rooot-provenance-watermark-data-'));

  // env MUST be set before ingest/txline.ts (or server.ts, which imports it)
  // is ever loaded — TXLINE_API/TXLINE_TOKEN_FILE/STANDS_DATA_DIR are read at
  // module-eval time (matches pulse-fix-check.ts's STANDS_DATA_DIR doc note).
  process.env.STANDS_DATA_DIR = dataDir;
  process.env.TXLINE_API = stub.url;
  process.env.TXLINE_TOKEN_FILE = tokenFile;

  const { createStandsServer } = await import('../server');
  const { startTxLineIngest } = await import('../ingest/txline');

  const { httpServer, broadcastToMatch } = createStandsServer();
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const addr = httpServer.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  log('setup', `real server booted on :${port}, DATA_DIR=${dataDir}`);

  const handle = startTxLineIngest({
    fixtureIds: new Set([FIXTURE_SUCCESS, FIXTURE_FAIL]),
    onFeedMsg: (msg) => {
      const fid = fixtureIdOfFeedMsg(msg);
      if (fid) broadcastToMatch(fid, msg);
    },
    onFeedState: (s) => log('ingest', `feedState -> ${s}`),
  });

  try {
    const wsA = await connect(`ws://127.0.0.1:${port}`);
    const receivedA: Array<Record<string, unknown>> = [];
    wsA.on('message', (raw) => {
      try {
        receivedA.push(JSON.parse(raw.toString()) as Record<string, unknown>);
      } catch {
        /* ignore */
      }
    });
    wsA.send(JSON.stringify({ type: 'hello', matchId: FIXTURE_SUCCESS, anonId: 'pw-check-a', side: 'home' }));

    const wsB = await connect(`ws://127.0.0.1:${port}`);
    const receivedB: Array<Record<string, unknown>> = [];
    wsB.on('message', (raw) => {
      try {
        receivedB.push(JSON.parse(raw.toString()) as Record<string, unknown>);
      } catch {
        /* ignore */
      }
    });
    wsB.send(JSON.stringify({ type: 'hello', matchId: FIXTURE_FAIL, anonId: 'pw-check-b', side: 'away' }));
    await sleep(200);

    /* ═══ SCENARIO A — real proof fetch: swing captured, hash covers it ═══ */
    log('A', 'odds ticks (anchor + the real Messi-goal specimen) — a real swing');
    const anchorTs = SPECIMEN.tick.Ts - 30_000;
    stub.emitOdds(oddsEnv(FIXTURE_SUCCESS, 'synthetic-anchor-tick', anchorTs, ['50.000', '25.000', '25.000']));
    await sleep(80);
    stub.emitOdds(oddsEnv(FIXTURE_SUCCESS, SPECIMEN.tick.MessageId, SPECIMEN.tick.Ts, SPECIMEN.tick.Pct as [string, string, string]));
    await sleep(80);

    log('A', 'two filler scores envelopes with Seq jumping +6 (pattern 5)');
    const logIdxSeq = logLines.length;
    stub.emitScores(commentEnv(FIXTURE_SUCCESS, 10, anchorTs));
    await sleep(60);
    stub.emitScores(commentEnv(FIXTURE_SUCCESS, 16, anchorTs + 1000));
    await sleep(150);
    check(
      'Seq gap (pattern 5): a +6 jump on the scores stream logs a warning naming the fixture and the probable-missed count',
      loggedSince(logIdxSeq, `[txline:watermark] fixture ${FIXTURE_SUCCESS} Seq gap: 10 -> 16 (5 probably missed)`),
      logLines.slice(logIdxSeq).filter((l) => l.includes('Seq gap')).join(' | ') || '(no Seq gap line found)',
    );

    log('A', 'goal + FULL_TIME — crystallize should fire');
    stub.emitScores(goalEnv(FIXTURE_SUCCESS, 17, anchorTs + 2000));
    await sleep(80);
    stub.emitScores(fullTimeEnv(FIXTURE_SUCCESS, 18, anchorTs + 3000));

    // THE SEAL is deferred past the full-time reaction window (25s) — Codex
    // pre-match review, findings 1+3 — so the record broadcast arrives ~28s
    // after full time, not within the old 6s budget.
    const gotRecordA = await waitFor(() => receivedA.some((m) => m.type === 'sentiment'), 60_000);
    check('scenario A: crystallize fired and broadcast a sentiment record', gotRecordA, `received types=${receivedA.map((m) => m.type).join(',')}`);
    const recordA = receivedA.find((m) => m.type === 'sentiment')?.record as SentimentRecord | undefined;

    check('scenario A: exactly one txlineRef (the biggestSwing candidate — no ET in this synthetic match)', recordA?.provenance.txlineRefs.length === 1, JSON.stringify(recordA?.provenance.txlineRefs.map((r) => r.length)));

    const ref = recordA?.provenance.txlineRefs[0];
    let refParsed: { summary?: { oddsSubTreeRoot?: unknown }; subTreeProof?: unknown[]; mainTreeProof?: unknown[] } | null = null;
    try {
      refParsed = ref ? JSON.parse(ref) : null;
    } catch {
      refParsed = null;
    }
    check(
      'scenario A: the ref is the REAL compacted proof (summary.oddsSubTreeRoot is a base64 string, sub/main tree proofs present)',
      typeof refParsed?.summary?.oddsSubTreeRoot === 'string' &&
        (refParsed.summary.oddsSubTreeRoot as string).length > 0 &&
        Array.isArray(refParsed.subTreeProof) &&
        refParsed.subTreeProof.length > 0 &&
        Array.isArray(refParsed.mainTreeProof) &&
        refParsed.mainTreeProof.length > 0,
      JSON.stringify(refParsed).slice(0, 200),
    );
    check(
      'scenario A: the validation endpoint was queried with the EXACT captured MessageId/Ts',
      stub.validationCalls.some((c) => c.messageId === SPECIMEN.tick.MessageId && c.ts === String(SPECIMEN.tick.Ts)),
      JSON.stringify(stub.validationCalls),
    );

    // recordHash must be computed AFTER txlineRefs is populated — prove it
    // directly: recomputing hashRecord with the PERSISTED txlineRefs must
    // reproduce the persisted hash; recomputing with txlineRefs forced to []
    // must NOT (i.e. the hash is genuinely sensitive to this field, not
    // filled in after the fact the way anchorTxSig deliberately is).
    if (recordA) {
      const { hashRecord } = await import('../sentiment/builder');
      const { recordHash: _rh, anchorTxSig: _atx, ...provRest } = recordA.provenance;
      const sameRefsHash = hashRecord({ ...recordA, provenance: provRest });
      const emptyRefsHash = hashRecord({ ...recordA, provenance: { ...provRest, txlineRefs: [] } });
      check('scenario A: recordHash recomputed with the SAME (persisted) txlineRefs matches the persisted hash', sameRefsHash === recordA.provenance.recordHash, `recomputed=${sameRefsHash.slice(0, 12)} persisted=${recordA.provenance.recordHash.slice(0, 12)}`);
      check(
        'scenario A: recordHash recomputed with txlineRefs forced to [] does NOT match — the hash genuinely covers provenance, computed AFTER population',
        emptyRefsHash !== recordA.provenance.recordHash,
        `withEmptyRefs=${emptyRefsHash.slice(0, 12)} persisted=${recordA.provenance.recordHash.slice(0, 12)}`,
      );
    }

    check('no secret token value ever appeared in a log line', !logLines.some((l) => l.includes(DUMMY_JWT)), '(scanned all captured console output)');

    /* ═══ SCENARIO B — validation fetch fails: [] + no crash ═══ */
    log('B', 'a swing for a DIFFERENT fixture whose MessageId the stub always fails on');
    const logIdxB = logLines.length;
    const failAnchorTs = SPECIMEN.tick.Ts + 500_000;
    stub.emitOdds(oddsEnv(FIXTURE_FAIL, 'synthetic-fail-anchor', failAnchorTs, ['50.000', '25.000', '25.000']));
    await sleep(80);
    stub.emitOdds(oddsEnv(FIXTURE_FAIL, 'synthetic-fail-tick', failAnchorTs + 30_000, ['10.000', '20.000', '70.000']));
    await sleep(80);
    stub.emitScores(goalEnv(FIXTURE_FAIL, 30, failAnchorTs + 31_000));
    await sleep(80);
    stub.emitScores(fullTimeEnv(FIXTURE_FAIL, 31, failAnchorTs + 32_000));

    const gotRecordB = await waitFor(() => receivedB.some((m) => m.type === 'sentiment'), 60_000); // deferred seal — see scenario A
    check('scenario B: crystallize STILL completed despite the validation endpoint failing (never blocks crystallize)', gotRecordB, `received types=${receivedB.map((m) => m.type).join(',')}`);
    const recordB = receivedB.find((m) => m.type === 'sentiment')?.record as SentimentRecord | undefined;
    check('scenario B: txlineRefs stayed honestly empty (fetch-fail path -> [])', Array.isArray(recordB?.provenance.txlineRefs) && recordB.provenance.txlineRefs.length === 0, JSON.stringify(recordB?.provenance.txlineRefs));
    check(
      'scenario B: exactly one log line noted the failed fetch (honest, not silent — and not a crash/stack dump)',
      loggedSince(logIdxB, `[txline:provenance] ${FIXTURE_FAIL} validation fetch failed for one candidate`),
      logLines.slice(logIdxB).filter((l) => l.includes('validation fetch failed')).join(' | ') || '(no failure line found)',
    );

    /* ═══ SCENARIO C — watermark: reconnect gap log ═══ */
    log('C', `forcing the odds stream to end (clean EOF) — connects so far: ${stub.oddsConnectCount()}`);
    const connectsBefore = stub.oddsConnectCount();
    const logIdxC = logLines.length;
    stub.endOddsConnections();
    const reconnected = await waitFor(() => stub.oddsConnectCount() > connectsBefore, 8_000);
    check('scenario C: a new odds connection arrived after the stream ended (the reconnect path)', reconnected, `connects ${connectsBefore} -> ${stub.oddsConnectCount()}`);

    // one more tick for the ALREADY-crystallized FIXTURE_SUCCESS — harmless
    // (dispatch/noteFeedHealth run independent of match/crystallize state) —
    // its watermark was already set by scenario A's ticks, so this is the
    // "next envelope after resume" that should log the gap.
    stub.emitOdds(oddsEnv(FIXTURE_SUCCESS, 'synthetic-post-reconnect-tick', SPECIMEN.tick.Ts + 20_000, ['40.000', '20.000', '40.000']));
    const gotGapLog = await waitFor(() => loggedSince(logIdxC, `[txline:watermark] fixture ${FIXTURE_SUCCESS} resumed, gap`), 4_000);
    check(
      'scenario C: the next envelope after reconnect logs the wire-time gap since the last watermark',
      gotGapLog,
      logLines.slice(logIdxC).filter((l) => l.includes('resumed, gap')).join(' | ') || '(no resume-gap line found)',
    );

    await closeAndWait(wsA);
    await closeAndWait(wsB);
  } finally {
    handle.stop();
    await stub.close();
    rmSync(tokenDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  }

  console.log('\n──────────── SUMMARY ────────────');
  console.log(failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

const watchdog = setTimeout(() => {
  origWarn('[provenance-watermark-check] watchdog: hung for 180s, forcing exit');
  process.exit(1);
}, 180_000); // two deferred seals (25s reaction window each) + anchors — the old 45s budget predates the deferred seal

main()
  .then(() => {
    clearTimeout(watchdog);
    process.exit(process.exitCode ?? 0);
  })
  .catch((err) => {
    clearTimeout(watchdog);
    origWarn(`[provenance-watermark-check] fatal: ${String(err)}`);
    process.exit(1);
  });
