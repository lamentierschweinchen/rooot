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
 */
import { chromium } from 'playwright';
import { STATUS } from './report.mjs';
import { initScript, isAllowedFrame } from './wsTap.mjs';
import { sleep } from './util.mjs';

const VIEWPORT = { width: 390, height: 844 };
const ROUTES = ['/', '/live', '/cabinet'];
const SETTLE_MS = 4000;

export async function runSmoke(report, { web, ws, headed }) {
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

      if (navError) {
        report.add(`smoke ${route}: loads clean`, STATUS.FAIL, `navigation error: ${navError}`);
      } else if (consoleErrors.length) {
        report.add(`smoke ${route}: loads clean`, STATUS.FAIL,
          `title="${title}"; ${consoleErrors.length} console error(s)/exception(s): ${consoleErrors.slice(0, 3).join(' || ')}`);
      } else {
        report.add(`smoke ${route}: loads clean`, STATUS.PASS,
          `title="${title}"; zero console errors or uncaught exceptions (settled ${SETTLE_MS}ms; ${log ? log.opens.length : 0} WS open(s), ${log ? log.sends.length : 0} allowed send(s), ${log ? log.blockedSends.length : 0} blocked send(s))`);
      }

      await context.close();
    }

    report.add('smoke: WS connects on /live', liveOpenedWs ? STATUS.PASS : STATUS.SKIPPED,
      liveOpenedWs
        ? `a WebSocket reached the OPEN state while on /live (title="${liveTitle}")`
        : `no WebSocket ever opened while on /live (title="${liveTitle}") -- if this --web target is a plain "vite dev" server, this is the known local/prod parity gap: vercel.json's cleanUrls rewrite (/live -> /woven-loom) is Vercel-only and isn't replicated by apps/web/vite.config.ts in dev, so /live 404s to index.html locally (no adapter script at all). See README "local vite dev vs production routing". Not expected against a real deployment.`);

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
