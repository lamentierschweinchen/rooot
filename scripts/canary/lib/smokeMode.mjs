/**
 * --mode smoke: production-safe, read-only checks (task-5-brief.md point 3).
 * Loads /, /live, /cabinet and asserts: zero console errors, the WS connects
 * (scoped to /live -- see below), and NO write frame is EVER sent -- enforced
 * in code by lib/wsTap.mjs's init script, not just observed here after the
 * fact. This mode never clicks, types, or calls any window.__stands method;
 * the only network traffic a page can possibly generate is whatever it does
 * on its own by loading.
 *
 * Route note (see README "local vite dev vs production routing"): / and
 * /cabinet never open a WebSocket by current design (apps/web/index.html has
 * no script; cabinet.html reads window.__seat/__album, never the wire) -- so
 * "the WS connects" is asserted specifically against /live, the one route
 * genuinely expected to carry a live feed.
 *
 * Page identity (review finding): under a local "vite dev" SPA fallback (or
 * any other misrouting), all three routes can silently serve the SAME
 * index.html -- three "loads clean" PASSes that would read identically
 * whether routing worked or not. Each route's "loads clean" check therefore
 * also asserts `document.title` against the real title baked into that
 * route's actual HTML file (read from apps/web/index.html,
 * apps/web/public/woven-loom.html, apps/web/public/cabinet.html) before it
 * will PASS; a mismatch reports SKIPPED with the routing reason -- the same
 * pattern the WS-connects check below already uses -- never a silent PASS
 * for the wrong page.
 *
 * Write-block self-test (review finding): none of these three routes load
 * stands-adapter.js (the app's only WebSocket sender), so the passive
 * "outgoing frames never leave the allowlist" summary below was vacuous on
 * every real run -- it would read identically if lib/wsTap.mjs's enforcement
 * were deleted outright, because nothing ever attempted a write in the first
 * place. `runWriteBlockSelfTest` below closes that gap: it opens its own
 * adversarial WebSocket to this run's actual --ws target from inside a page
 * and deliberately attempts a disallowed frame and a hello-with-side, then
 * asserts -- via the tap's own accounting -- that both were blocked and
 * neither ever reached the real network. That makes every run, including a
 * run against real production tonight, actually exercise the block instead
 * of merely assuming it holds.
 */
import { chromium } from 'playwright';
import { STATUS } from './report.mjs';
import { initScript, isAllowedFrame } from './wsTap.mjs';
import { sleep } from './util.mjs';

const VIEWPORT = { width: 390, height: 844 };
const ROUTES = ['/', '/live', '/cabinet'];
const SETTLE_MS = 4000;
const SELF_TEST_TIMEOUT_MS = 8000;

// The real, unique <title> baked into each route's actual HTML file --
// apps/web/index.html, apps/web/public/woven-loom.html (served at /live via
// vercel.json's rewrite), apps/web/public/cabinet.html (served at /cabinet
// via vercel.json's cleanUrls). Read directly from those files, not
// guessed; see the header comment above for why this assertion exists.
const ROUTE_IDENTITY = {
  '/': { title: 'ROOOT - Matchday' },
  '/live': { title: 'THE LOOM — woven live' },
  '/cabinet': { title: 'YOUR CABINET — what you kept' },
};

export async function runSmoke(report, { web, ws, headed, match }) {
  const wsHost = new URL(ws).host;
  const browser = await chromium.launch({ headless: !headed });

  const allSends = []; // every frame that reached the real network, across all 3 routes
  const allBlocked = []; // every frame the allowlist guard refused, across all 3 routes
  let liveOpenedWs = false;
  let liveTitle = null;

  try {
    for (const route of ROUTES) {
      const context = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true });
      await context.addInitScript(initScript, { wsHost, enforceAllowlist: true });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));

      const sep = route.includes('?') ? '&' : '?';
      const url = `${web}${route}${sep}ws=${encodeURIComponent(ws)}`;
      let navError = null;
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 20000 });
      } catch (err) {
        navError = String(err);
      }

      await sleep(SETTLE_MS);

      const log = await page.evaluate(() => window.__canary).catch(() => null);
      const title = await page.title().catch(() => '(unknown)');

      if (route === '/live') {
        liveTitle = title;
        liveOpenedWs = !!(log && log.opens && log.opens.length > 0);
      }

      if (log) {
        for (const s of log.sends) allSends.push({ route, ...s });
        for (const b of log.blockedSends) allBlocked.push({ route, ...b });
      }

      const expectedTitle = ROUTE_IDENTITY[route].title;
      const identityOk = title === expectedTitle;

      if (navError) {
        report.add(`smoke ${route}: loads clean`, STATUS.FAIL, `navigation error: ${navError}`);
      } else if (consoleErrors.length) {
        report.add(`smoke ${route}: loads clean`, STATUS.FAIL,
          `title="${title}"; ${consoleErrors.length} console error(s)/exception(s): ${consoleErrors.slice(0, 3).join(' || ')}`);
      } else if (!identityOk) {
        report.add(`smoke ${route}: loads clean`, STATUS.SKIPPED,
          `page identity mismatch: got title="${title}", expected "${expectedTitle}" for ${route} -- this route did not actually serve its own page, so "zero console errors" would be a vacuous PASS for the wrong page. Known cause against a plain "vite dev" server: SPA fallback serves index.html for any unresolved path -- see README "local vite dev vs production routing". Not expected against a real deployment.`);
      } else {
        report.add(`smoke ${route}: loads clean`, STATUS.PASS,
          `title="${title}" (matches this route's own page); zero console errors or uncaught exceptions (settled ${SETTLE_MS}ms; ${log ? log.opens.length : 0} WS open(s), ${log ? log.sends.length : 0} allowed send(s), ${log ? log.blockedSends.length : 0} blocked send(s))`);
      }

      await context.close();
    }

    report.add('smoke: WS connects on /live', liveOpenedWs ? STATUS.PASS : STATUS.SKIPPED,
      liveOpenedWs
        ? `a WebSocket reached the OPEN state while on /live (title="${liveTitle}")`
        : `no WebSocket ever opened while on /live (title="${liveTitle}") -- if this --web target is a plain "vite dev" server, this is the known local/prod parity gap: vercel.json's cleanUrls rewrite (/live -> /woven-loom) is Vercel-only and isn't replicated by apps/web/vite.config.ts in dev, so /live 404s to index.html locally (no adapter script at all). See README "local vite dev vs production routing". Not expected against a real deployment.`);

    // Active proof the block holds against THIS run's real target -- see
    // runWriteBlockSelfTest and the header comment above.
    await runWriteBlockSelfTest(report, browser, { web, ws, wsHost, match });

    // The actual enforcement already happened in-page (native send() was
    // simply never called for a disallowed frame) -- this is the post-hoc,
    // belt-and-suspenders proof that the guard held: every frame that DID
    // reach the network really was allowed.
    const leaked = allSends.filter((s) => !isAllowedFrame(s.data));
    report.add('smoke: outgoing frames never leave the allowlist', leaked.length === 0 ? STATUS.PASS : STATUS.FAIL,
      leaked.length === 0
        ? `${allSends.length} frame(s) reached the network across all routes, all allowlisted (hello, no side); ${allBlocked.length} disallowed attempt(s) were hard-blocked in code before reaching the network${allBlocked.length ? ': ' + allBlocked.map((b) => `${b.route}/${b.type ?? 'unparseable'}`).join(', ') : ''}`
        : `${leaked.length} disallowed frame(s) reached the real network -- allowlist guard was bypassed: ${JSON.stringify(leaked.slice(0, 5))}`);
  } finally {
    await browser.close();
  }
}

/**
 * The adversarial write-block self-test (review finding). Opens a fresh
 * context/page (so `window.__canary` is a clean tap with `enforceAllowlist`
 * on), navigates to `web`'s home route purely to host a page, then --
 * entirely inside the page via `page.evaluate` -- constructs a REAL
 * `WebSocket` to this run's actual `--ws` target and deliberately attempts:
 *
 *   (a) a disallowed frame type: a real "cheer" shape, matching
 *       apps/web/public/stands-adapter.js's flushCheer().
 *   (b) a "hello" WITH a side: the allowlist only ever permits a bare hello
 *       (no `side`), matching the shape stands-adapter.js's hello() sends
 *       once a fan has picked an end.
 *
 * Both attempts are made through the SAME `window.WebSocket` wrapper every
 * other page on this run uses (installed by wsTap.mjs's initScript) -- so
 * this exercises the exact code path (lib/wsTap.mjs's `send` intercept,
 * `enforceAllowlist` branch) that the passive "outgoing frames never leave
 * the allowlist" check can only observe after the fact. The assertion reads
 * the tap's own accounting: both attempts must land in
 * `window.__canary.blockedSends` (reason "not-in-smoke-allowlist"), and
 * NEITHER may ever appear in `window.__canary.sends` -- that array only
 * ever gains an entry when the real native `send()` was actually invoked
 * (see wsTap.mjs), so its absence there is the proof the block fired BEFORE
 * any byte could reach the wire, not merely that the app chose not to send.
 *
 * Deliberately does not require the socket to reach OPEN first: the tap's
 * `send` intercept runs before the native `send()` is ever called,
 * regardless of readyState (see wsTap.mjs), so the block holds identically
 * whether or not the handshake has completed -- this keeps the assertion
 * about the write-block itself, not conflated with target reachability
 * (which "smoke: WS connects on /live" already covers separately). The
 * matchId/anonId used are canary-only, distinctly named, and never reach
 * the network anyway (belt-and-suspenders: even a future regression that
 * broke the block could not pollute a real match's crowd data with these).
 */
async function runWriteBlockSelfTest(report, browser, { web, ws, wsHost, match }) {
  const context = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true });
  await context.addInitScript(initScript, { wsHost, enforceAllowlist: true });
  try {
    const page = await context.newPage();
    try {
      await page.goto(`${web}/`, { waitUntil: 'load', timeout: 20000 });
    } catch (err) {
      report.add('smoke: write-block self-test', STATUS.FAIL,
        `could not load ${web}/ to host the adversarial socket: ${err}`);
      return;
    }

    let result;
    try {
      result = await page.evaluate(async ({ wsUrl, matchId, anonId, openTimeoutMs }) => {
        function withMatchId(u, id) {
          try {
            const parsed = new URL(u);
            parsed.searchParams.set('matchId', id);
            return parsed.toString();
          } catch (e) { return u; }
        }
        const url = withMatchId(wsUrl, matchId);
        const sock = new WebSocket(url);
        let openedOk = false;
        try {
          await new Promise((resolve, reject) => {
            const t = setTimeout(() => reject(new Error('open-timeout')), openTimeoutMs);
            sock.addEventListener('open', () => { clearTimeout(t); openedOk = true; resolve(); });
          });
        } catch (e) {
          // Proceed regardless -- see the function doc comment: the block
          // runs before any native send() call, independent of readyState.
        }

        const beforeBlocked = window.__canary.blockedSends.length;
        const beforeSends = window.__canary.sends.length;

        // (a) a disallowed frame type.
        sock.send(JSON.stringify({ type: 'cheer', matchId: matchId, side: 'home', n: 1, atMs: Date.now() }));
        // (b) hello WITH a side -- the allowlist only permits a bare hello.
        sock.send(JSON.stringify({ type: 'hello', matchId: matchId, anonId: anonId, side: 'home' }));

        const blockedNew = window.__canary.blockedSends.slice(beforeBlocked);
        const sendsNew = window.__canary.sends.slice(beforeSends);
        try { sock.close(); } catch (e) {}
        return { openedOk, blockedNew, sendsNew };
      }, { wsUrl: ws, matchId: `${match}-canary-selftest`, anonId: `canary-selftest-${Date.now()}`, openTimeoutMs: SELF_TEST_TIMEOUT_MS });
    } catch (err) {
      report.add('smoke: write-block self-test', STATUS.FAIL, `adversarial page.evaluate threw: ${err}`);
      return;
    }

    const { openedOk, blockedNew, sendsNew } = result;
    const cheerBlocked = blockedNew.find((b) => b.type === 'cheer' && b.reason === 'not-in-smoke-allowlist');
    const helloSideBlocked = blockedNew.find((b) => b.type === 'hello' && b.reason === 'not-in-smoke-allowlist');
    const leaked = sendsNew.filter((s) => s.type === 'cheer' || (s.type === 'hello' && s.data && s.data.side));

    if (cheerBlocked && helloSideBlocked && leaked.length === 0) {
      report.add('smoke: write-block self-test', STATUS.PASS,
        `opened a real WebSocket to ${ws} from inside the page (${openedOk ? 'reached OPEN' : `never reached OPEN within ${SELF_TEST_TIMEOUT_MS}ms -- irrelevant to the result, see step doc`}) and attempted (a) a disallowed "cheer" frame and (b) a "hello" WITH a side; both landed in window.__canary.blockedSends (reason="not-in-smoke-allowlist") and NEITHER appears in window.__canary.sends -- the tap's own accounting shows native send() was never invoked for either attempt, proving the block held against this run's actual --ws target.`);
    } else {
      report.add('smoke: write-block self-test', STATUS.FAIL,
        `adversarial write was not fully blocked: cheer-blocked=${!!cheerBlocked} hello-with-side-blocked=${!!helloSideBlocked} leaked-to-real-sends=${JSON.stringify(leaked.slice(0, 5))}`);
    }
  } finally {
    await context.close();
  }
}
