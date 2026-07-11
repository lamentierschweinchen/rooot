/**
 * SSE IDLE-WATCHDOG CHECK (tonight-gate, Jul 11 NOR–ENG wedge fix) — proves
 * the TxLINE ingest recovers from the two silent-death modes the live wire
 * showed, against a REAL local SSE server and the REAL startTxLineIngest:
 *
 *   1. STALLED STREAM (the second-half killer): the odds stream connects,
 *      heartbeats, delivers one real 1X2 envelope — then goes byte-silent
 *      with the socket held open (a NAT/proxy half-open drop, no FIN/RST).
 *      OLD code parks in reader.read() forever: no reconnect, ingest dark.
 *      Asserts: a SECOND connection arrives within the deadline, and an
 *      envelope sent on it is normalized + delivered — ingest RESUMED.
 *   2. HUNG CONNECT: the scores stream accepts the TCP connection but never
 *      sends response headers. OLD code awaits fetch() forever. Asserts: the
 *      attempt is abandoned and retried (a second connection arrives).
 *   3. The ingest-wide stop signal still works (no watchdog interference).
 *
 * Hermetic: local HTTP server on :0; TXLINE_API pointed at it; a throwaway
 * token file (values never logged); tiny env timeouts (the same clamped envs
 * production reads — floor 1s) so the whole check runs in seconds.
 *
 * Usage: tsx src/dev/sse-idle-watchdog-check.ts (or: npm run check:sse-idle)
 */
import { createServer, type ServerResponse } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TMP = mkdtempSync(path.join(tmpdir(), 'rooot-sse-idle-check-'));
const TOKEN_PATH = path.join(TMP, 'token.json');
writeFileSync(TOKEN_PATH, JSON.stringify({ jwt: 'check-jwt', apiToken: 'check-api' }));

process.env.TXLINE_TOKEN_FILE = TOKEN_PATH;
process.env.TXLINE_IDLE_TIMEOUT_MS = '1000';    // floor — 1s of byte-silence = dead
process.env.TXLINE_CONNECT_TIMEOUT_MS = '1500'; // headers must arrive within 1.5s

const FIXTURE = '18213979';
/** One REAL captured 1X2 envelope from the NOR–ENG night tape (public wire
 * shape, no secrets) — exactly what parseOddsMessage expects. */
const REAL_1X2 =
  '{"FixtureId":18213979,"MessageId":"1837343289:00003:000052-10021-stab","Ts":1783798208111,"Bookmaker":"TXLineStablePriceDemargined","BookmakerId":10021,"SuperOddsType":"1X2_PARTICIPANT_RESULT","GameState":null,"InRunning":false,"MarketParameters":null,"MarketPeriod":null,"PriceNames":["part1","draw","part2"],"Prices":[4325,4164,1892],"Pct":["23.121","24.015","52.854"]}';

let failures = 0;
function check(label: string, cond: boolean, detail = ''): void {
  const mark = cond ? '✓' : '✗ FAIL';
  if (!cond) failures++;
  console.log(`  ${mark}  ${label}${detail ? `  — ${detail}` : ''}`);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/* ── the fake TxLINE ── */
let oddsConns = 0;
let scoresConns = 0;
const oddsResponses: ServerResponse[] = [];
function sseHead(res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
}
function sseData(res: ServerResponse, data: string): void {
  res.write(`data: ${data}\n\n`);
}
const fake = createServer((req, res) => {
  const url = req.url ?? '';
  if (url.startsWith('/api/odds/stream')) {
    oddsConns++;
    oddsResponses.push(res);
    sseHead(res);
    res.write('event: heartbeat\ndata: {"Ts":1}\n\n');
    if (oddsConns === 1) {
      // conn #1: one real envelope, then BYTE-SILENCE with the socket held
      // open — the half-open drop. Nothing else is ever written here.
      sseData(res, REAL_1X2);
    } else {
      // conn #2+ (the reconnect the watchdog must force): deliver a second
      // envelope so "ingest resumed" is proven by a real normalized message.
      sseData(res, REAL_1X2);
      const beat = setInterval(() => res.write('event: heartbeat\ndata: {"Ts":2}\n\n'), 300);
      res.on('close', () => clearInterval(beat));
    }
    return;
  }
  if (url.startsWith('/api/scores/stream')) {
    scoresConns++;
    // HUNG CONNECT: accept, never send headers, hold the socket. Every
    // attempt hangs the same way — the assertion is that attempts keep
    // COMING (the connect watchdog abandons each one and retries).
    return;
  }
  // seedSnapshot endpoints — 404, the seeder is best-effort and tolerant
  res.writeHead(404);
  res.end();
});

async function main(): Promise<void> {
  await new Promise<void>((resolve) => fake.listen(0, resolve));
  const addr = fake.address();
  const port = addr && typeof addr === 'object' ? addr.port : 0;
  process.env.TXLINE_API = `http://127.0.0.1:${port}`;
  console.log(`[sse-idle-check] fake TxLINE on :${port} — idle limit 1000ms, connect limit 1500ms`);

  // dynamic import so the module reads the env above at load time
  const { startTxLineIngest } = await import('../ingest/txline');

  const oddsDelivered: number[] = [];
  const states: string[] = [];
  const t0 = Date.now();
  const handle = startTxLineIngest({
    fixtureIds: new Set([FIXTURE]),
    onFeedMsg: (msg) => {
      if (msg.type === 'odds') oddsDelivered.push(Date.now() - t0);
    },
    onFeedState: (s) => {
      if (states[states.length - 1] !== s) states.push(s);
    },
  });

  // Phase 1 — conn #1 delivers its envelope, then goes silent. The watchdog
  // must abort at ~1s idle and reconnect; conn #2 delivers a second envelope.
  // Generous deadline (8s) for CI wobble; typical is ~1.5-2.5s.
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline && (oddsConns < 2 || oddsDelivered.length < 2)) await sleep(100);

  check('stalled odds stream was abandoned and reconnected (a second connection arrived)', oddsConns >= 2, `oddsConns=${oddsConns}`);
  check('ingest RESUMED after the stall — a real envelope was normalized + delivered on the new connection', oddsDelivered.length >= 2, `delivered=${oddsDelivered.length} atMs=${oddsDelivered.join(',')}`);
  check('the stall was detected in watchdog time, not luck (reconnect envelope landed after the ~1s idle limit)', (oddsDelivered[1] ?? 0) > 1000, `secondAtMs=${oddsDelivered[1] ?? 'none'}`);

  // Phase 2 — the scores connect hangs headerless forever, each attempt must
  // be abandoned at ~1.5s and retried.
  const deadline2 = Date.now() + 8_000;
  while (Date.now() < deadline2 && scoresConns < 2) await sleep(100);
  check('hung headerless connect (scores) was abandoned and retried', scoresConns >= 2, `scoresConns=${scoresConns}`);

  // Phase 3 — stop() still wins over everything.
  const oddsConnsAtStop = oddsConns;
  const scoresConnsAtStop = scoresConns;
  handle.stop();
  await sleep(2_500); // > both limits + backoff — any zombie loop would reconnect in this window
  check('stop() ended both streams — no further connections after stop', oddsConns === oddsConnsAtStop && scoresConns === scoresConnsAtStop, `odds ${oddsConnsAtStop}->${oddsConns} scores ${scoresConnsAtStop}->${scoresConns}`);

  check('feedState traced a reconnect cycle (a "reconnecting"/"lost" appears after first "connected")', states.includes('reconnecting') || states.includes('lost'), `states=${states.join('>')}`);

  for (const res of oddsResponses) { try { res.destroy(); } catch { /* gone */ } }
  fake.close();
  rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('[sse-idle-check] FATAL', err);
  process.exit(1);
});
