#!/usr/bin/env node
/**
 * ROOOT reconnect-storm regression check (tonight-gate hang fix, 2026-07-11).
 *
 * Verifies the fix for last night's ground-page hang: a live-page reload logged
 * "[stands-adapter] live wire → 18218149" TEN times within ~1s (plus 10x
 * stats-adapter) against 2 expected (parent + one iframe) — a self-feeding
 * reconnect storm. Root cause: heavy join-snapshot replay processing blocked the
 * main thread, sockets died under backpressure, MULTIPLE queued onclose handlers
 * fired near-simultaneous reconnects, and each successful reconnect reset backoff
 * to 1s and pulled the full replay again.
 *
 * The fix (apps/web/public/{stands,stats,loom}-adapter.js, match-read.js):
 *   1. single-flight connect guard (never >1 concurrent attempt, >1 pending
 *      reconnect timer)
 *   2. backoff (1s->30s) resets to 1s only once a connection has stayed open
 *      >=5s, not merely on open
 *   3. trailing-edge throttle (~250ms) on the state-publish path, so a
 *      ~1,600-message join replay can't force 1,600 synchronous renders
 *
 * This script proves both halves against a REAL local stack, driving the REAL
 * pages (never edited) via the REAL adapters (never stubbed):
 *
 *   --check storm       force-kill each page's live socket(s) repeatedly (via
 *                        wsTap.mjs's window.__canary.killLive, an additive
 *                        extension -- see lib/wsTap.mjs) and assert concurrency
 *                        never exceeds the page's expected steady-state count,
 *                        across ground.html (stands+stats), woven-loom.html
 *                        (loom), and stadium.html (stats+match-read).
 *   --check responsive  navigate fresh into a match with an already-heavy
 *                        server-side join-snapshot and assert page.evaluate()
 *                        round-trips stay <=2s throughout (main thread never
 *                        blocks on the replay burst).
 *   --check both         (default) run both.
 *
 * Usage:
 *   node scripts/canary/reconnect-check.mjs --web <baseUrl> --ws <wsUrl> \
 *     --match <id> [--check storm|responsive|both] [--out <path>] [--headed]
 *
 * Same local-stack-only host safety as `run.mjs --mode full` (this force-kills
 * real sockets repeatedly -- must be structurally incapable of hammering prod).
 *
 * Recommended local setup -- see scripts/canary/README.md "Enabling full-time
 * replay" for the full recipe:
 *
 *   # storm check: a bare local stack is enough (no replay needed -- it only
 *   # needs real reconnect dynamics against a live crowd, matching the existing
 *   # canary's own documented bare-server behavior)
 *   cd services/stands && PORT=8788 npm start
 *   node scripts/canary/reconnect-check.mjs --web http://localhost:4180 \
 *     --ws ws://localhost:8788/ --match 18218149 --check storm
 *
 *   # responsive check: needs an accumulated join-snapshot, so point a second
 *   # instance at a recorded fixture and let it finish (or run well into) the
 *   # replay before joining
 *   cd services/stands && PORT=8789 \
 *     REPLAY_FILE=/Users/ls/Documents/rooot/fixtures/sui-col-scores-20260707.jsonl \
 *     REPLAY_FIXTURE=18202783 REPLAY_SPEED=60 npm start
 *   node scripts/canary/reconnect-check.mjs --web http://localhost:4180 \
 *     --ws ws://localhost:8789/ --match 18202783 --check responsive
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { assertFullModeHostSafety } from './lib/cli.mjs';
import { Report, STATUS } from './lib/report.mjs';
import { initScript } from './lib/wsTap.mjs';
import { waitFor, sleep } from './lib/util.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIEWPORT = { width: 390, height: 844 };

function isoStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function parseArgs(argv) {
  const args = { web: null, ws: null, match: '18218149', check: 'both', out: null, headed: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--web': args.web = argv[++i]; break;
      case '--ws': args.ws = argv[++i]; break;
      case '--match': args.match = argv[++i]; break;
      case '--check': args.check = argv[++i]; break;
      case '--out': args.out = argv[++i]; break;
      case '--headed': args.headed = true; break;
      case '--help': case '-h': args.help = true; break;
      default: throw new Error(`unrecognized argument "${a}"`);
    }
  }
  return args;
}

const HELP = `
ROOOT reconnect-storm regression check

Usage:
  node scripts/canary/reconnect-check.mjs --web <baseUrl> --ws <wsUrl> --match <id> [--check storm|responsive|both] [--out <path>] [--headed]

See the file header for the full local-stack recipe (bare server for --check storm,
a REPLAY_FILE-fed instance for --check responsive).
`;

// Real pages, never edited -- each already loads exactly these adapters at
// their documented activation params (see AGENTS.md's adapter file headers).
// `expected` is the steady-state count of REAL sockets reaching this run's
// --ws host once the page has settled. `logsEqualOpens`: true only when EVERY
// adapter present logs "live wire" on open (stands-adapter and stats-adapter
// both do; loom-adapter does). match-read.js has NEVER logged on open -- true
// before this fix too, by original design, not something this fix touches --
// so stadium.html (stats-adapter + match-read) structurally has fewer logs
// than opens on a perfectly healthy run; asserting equality there would be
// testing a false assumption, not a real property.
const STORM_PAGES = [
  { name: 'ground.html (stands-adapter + stats-adapter)', path: 'ground.html', expected: 2, logsEqualOpens: true },
  { name: 'woven-loom.html (loom-adapter)', path: 'woven-loom.html?site=1&loomfeed=1', expected: 1, logsEqualOpens: true },
  { name: 'stadium.html (stats-adapter + match-read, match-read never logs)', path: 'stadium.html', expected: 2, logsEqualOpens: false },
];

const ROUNDS = 4; // backoff escalates 1s->2s->4s->8s per round -- enough to prove both the
// single-flight guard (every round) and the escalate-not-reset discipline (rounds 2-4),
// without the run growing past ~30s of cumulative backoff wait per page.

async function newTaggedContext(browser, wsHost) {
  const context = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true });
  await context.addInitScript(initScript, { wsHost, enforceAllowlist: false });
  const page = await context.newPage();
  const consoleLiveWire = [];
  const consoleErrors = [];
  page.on('console', (msg) => {
    const t = msg.text();
    if (/live wire/.test(t)) consoleLiveWire.push({ text: t, atMs: Date.now() });
    if (msg.type() === 'error') consoleErrors.push(t);
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  return { context, page, consoleLiveWire, consoleErrors };
}

function liveCount(page, hostFilter) {
  return page.evaluate((h) => (window.__canary && window.__canary.liveCount ? window.__canary.liveCount(h) : -1), hostFilter).catch(() => -1);
}
function killLive(page, hostFilter) {
  return page.evaluate((h) => (window.__canary && window.__canary.killLive ? window.__canary.killLive(h) : 0), hostFilter).catch(() => 0);
}

async function waitForCount(page, hostFilter, target, timeoutMs) {
  return waitFor(() => liveCount(page, hostFilter), (n) => (n === target ? n : null), { timeoutMs, pollMs: 100 });
}

/**
 * One page's storm: wait for the legitimate steady-state connection count,
 * then repeatedly force-close every currently-OPEN matching socket (simulating
 * "the socket dies under backpressure" -- server restart / any abrupt close
 * looks identical to the adapter's onclose handler, which doesn't branch on
 * close code) while sampling live concurrency continuously, from the instant
 * of each kill through to the next successful reconnect -- not just a short
 * window right after the kill, so a guard that only fails after a delay (e.g.
 * a race in the reconnect scheduling) can't hide from this.
 */
async function stormPage(report, { browser, wsHost, web, wsUrl, match, pageDef }) {
  const stepName = `storm: ${pageDef.name}`;
  const { context, page, consoleLiveWire, consoleErrors } = await newTaggedContext(browser, wsHost);
  try {
    const sep = pageDef.path.includes('?') ? '&' : '?';
    const url = `${web}/${pageDef.path}${sep}live=1&match=${encodeURIComponent(match)}&ws=${encodeURIComponent(wsUrl)}`;
    await page.goto(url, { waitUntil: 'load', timeout: 20000 });

    const initial = await waitForCount(page, wsHost, pageDef.expected, 15000);
    if (!initial.ok) {
      report.add(stepName, STATUS.FAIL,
        `never reached the expected steady-state of ${pageDef.expected} live socket(s) to ${wsHost} within 15s (last observed count: ${initial.last})`);
      return;
    }

    let maxObserved = initial.value;
    let overshoot = null;
    const roundEvidence = [];

    for (let round = 1; round <= ROUNDS; round++) {
      const killedN = await killLive(page, wsHost);
      const roundStart = Date.now();
      const capMs = Math.min(1000 * Math.pow(2, round - 1), 30000); // theoretical max backoff wait this round
      const roundTimeout = capMs + 10000; // + generous connect/settle slack
      let sampled = 0;
      const res = await waitFor(async () => {
        const n = await liveCount(page, wsHost);
        sampled++;
        if (n > maxObserved) maxObserved = n;
        if (n > pageDef.expected && !overshoot) overshoot = { round, n, atMs: Date.now() - roundStart };
        return n === pageDef.expected ? n : null;
      }, (v) => v, { timeoutMs: roundTimeout, pollMs: 75 });
      roundEvidence.push(`round ${round}: killed=${killedN} recovered=${res.ok ? `in ${res.elapsedMs}ms` : `TIMED OUT after ${roundTimeout}ms`} (${sampled} samples)`);
      if (overshoot) break; // already have a violation; no need to keep going
      if (!res.ok) break;   // didn't recover -- stop killing a connection we don't have
    }

    // Settle before the final tally: console messages relay to Node over their own async
    // CDP channel, separate from the page.evaluate() round-trip that confirms readyState --
    // give any in-flight "live wire" log a moment to arrive so the count below isn't an
    // artifact of reading it in the same instant the last reconnect completed.
    await sleep(500);
    const liveWireLogs = consoleLiveWire.length;
    const opens = await page.evaluate((h) => window.__canary.opens.filter((o) => o.host === h).length, wsHost).catch(() => -1);
    const concurrencyEvidence = `maxObserved=${maxObserved} (expected<=${pageDef.expected})`;
    const errEvidence = consoleErrors.length ? ` | ${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 2).join(' || ')}` : '';

    if (overshoot) {
      report.add(stepName, STATUS.FAIL,
        `concurrency guard VIOLATED: observed ${overshoot.n} live socket(s) to ${wsHost} (expected <=${pageDef.expected}) at round ${overshoot.round}, +${overshoot.atMs}ms after that round's kill -- ${concurrencyEvidence}; "live wire" logs=${liveWireLogs} opens=${opens} -- ${roundEvidence.join(' | ')}${errEvidence}`);
      return;
    }
    // logsEqualOpens pages (every adapter present logs once per open): exact equality is the
    // precise assertion -- "never logs more than one 'live wire' per adapter per reconnect
    // cycle". Pages with a silent adapter (match-read.js) can only be held to logs<=opens
    // (a real, still-meaningful bound: logs can never exceed total real opens) plus a basic
    // liveness floor -- see the STORM_PAGES comment for why equality doesn't apply there.
    const logsOk = pageDef.logsEqualOpens ? liveWireLogs === opens : (liveWireLogs >= 1 && liveWireLogs <= opens);
    if (!logsOk) {
      report.add(stepName, STATUS.FAIL,
        `"live wire" console logs (${liveWireLogs}) inconsistent with native open events (${opens}) for ${wsHost} (page expects ${pageDef.logsEqualOpens ? 'logs == opens' : '1 <= logs <= opens'}) -- a stale/duplicate handler may be logging more than once per real open -- ${concurrencyEvidence}; ${roundEvidence.join(' | ')}${errEvidence}`);
      return;
    }
    report.add(stepName, STATUS.PASS,
      `never exceeded ${pageDef.expected} concurrent live socket(s) to ${wsHost} across ${roundEvidence.length} force-kill round(s) (${concurrencyEvidence}); "live wire" console logs=${liveWireLogs}, native opens=${opens} (${pageDef.logsEqualOpens ? 'exactly one log per real open' : 'match-read.js on this page never logs, by original design -- logs <= opens holds'}); ${roundEvidence.join(' | ')}${errEvidence}`);
  } catch (err) {
    report.add(stepName, STATUS.FAIL, `threw: ${err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : String(err)}`);
  } finally {
    await context.close();
  }
}

/**
 * Late-join responsiveness: navigate fresh into `match` (expected to already
 * carry a heavy accumulated join-snapshot on the server -- see the file header
 * recipe) and sample page.evaluate() round-trip latency continuously for a
 * window right after load. A page whose main thread is blocked processing a
 * synchronous burst of renders will queue the evaluate() call behind that work;
 * a responsive page returns in low single-digit ms regardless of what the
 * adapters are doing in the background.
 */
async function responsiveCheck(report, { browser, wsHost, web, wsUrl, match }) {
  const stepName = 'responsive: late join into heavy replay stays responsive';
  const { context, page, consoleErrors } = await newTaggedContext(browser, wsHost);
  const WINDOW_MS = 8000;
  const BUDGET_MS = 2000; // task requirement: "responds to evaluate within ~2s"
  try {
    const url = `${web}/ground.html?live=1&match=${encodeURIComponent(match)}&ws=${encodeURIComponent(wsUrl)}`;
    await page.goto(url, { waitUntil: 'load', timeout: 20000 });

    const samples = [];
    const start = Date.now();
    while (Date.now() - start < WINDOW_MS) {
      const t0 = Date.now();
      await page.evaluate(() => Date.now());
      samples.push(Date.now() - t0);
    }
    const maxMs = Math.max(...samples);
    const avgMs = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
    const received = await page.evaluate(() => (window.__canary ? window.__canary.received.length : -1)).catch(() => -1);
    const errEvidence = consoleErrors.length ? ` | ${consoleErrors.length} console error(s): ${consoleErrors.slice(0, 2).join(' || ')}` : '';

    if (received < 50) {
      report.add(stepName, STATUS.PROVISIONAL,
        `only ${received} inbound message(s) observed in this window -- the local --ws target likely has no heavy join-snapshot loaded (see this file's header for the REPLAY_FILE recipe), so this run did not meaningfully stress the replay path; evaluate() latency was max=${maxMs}ms avg=${avgMs}ms over ${samples.length} round-trips regardless${errEvidence}`);
      return;
    }
    if (maxMs <= BUDGET_MS) {
      report.add(stepName, STATUS.PASS,
        `${samples.length} page.evaluate() round-trip(s) over ${WINDOW_MS}ms right after a late join; max=${maxMs}ms avg=${avgMs}ms (budget <=${BUDGET_MS}ms); ${received} inbound message(s) observed on the tap (join-snapshot replay size) -- main thread never blocked${errEvidence}`);
    } else {
      report.add(stepName, STATUS.FAIL,
        `page.evaluate() round-trip hit ${maxMs}ms (budget <=${BUDGET_MS}ms; avg=${avgMs}ms) during the ${WINDOW_MS}ms window right after a late join into ${received} accumulated message(s) -- main thread was blocked${errEvidence}`);
    }
  } catch (err) {
    report.add(stepName, STATUS.FAIL, `threw: ${err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : String(err)}`);
  } finally {
    await context.close();
  }
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(String(err.message || err));
    console.error(HELP);
    process.exit(2);
  }
  if (args.help) { console.log(HELP); process.exit(0); }
  if (!args.web || !args.ws) {
    console.error('--web and --ws are required');
    console.error(HELP);
    process.exit(2);
  }
  if (!['storm', 'responsive', 'both'].includes(args.check)) {
    console.error(`--check must be storm|responsive|both, got "${args.check}"`);
    process.exit(2);
  }
  try {
    assertFullModeHostSafety({ mode: 'full', web: args.web, ws: args.ws });
  } catch (err) {
    console.error(String(err.message || err));
    process.exit(2);
  }

  const wsHost = new URL(args.ws).host;
  const report = new Report({ mode: `reconnect-check:${args.check}`, web: args.web, ws: args.ws, match: args.match });
  const browser = await chromium.launch({ headless: !args.headed });

  try {
    if (args.check === 'storm' || args.check === 'both') {
      for (const pageDef of STORM_PAGES) {
        await stormPage(report, { browser, wsHost, web: args.web, wsUrl: args.ws, match: args.match, pageDef });
      }
    }
    if (args.check === 'responsive' || args.check === 'both') {
      await responsiveCheck(report, { browser, wsHost, web: args.web, wsUrl: args.ws, match: args.match });
    }
  } catch (err) {
    report.add('run: fatal error', STATUS.FAIL, `${err && err.stack ? err.stack : String(err)}`);
  } finally {
    await browser.close();
  }

  report.finish();
  report.printTable();
  const outPath = args.out || join(__dirname, 'results', `reconnect-${args.check}-${isoStamp()}.json`);
  const written = report.writeFile(outPath);
  console.log(`results written to ${written}`);
  process.exit(report.exitCode());
}

main().catch((err) => {
  console.error('reconnect-check: fatal error outside any step:', err && err.stack ? err.stack : String(err));
  process.exit(1);
});
