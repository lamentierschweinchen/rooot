/**
 * --mode full: the two-(then three-)browser acceptance flow, task-5-brief.md
 * point 2. Drives the REAL gate.html -> ground.html -> woven-loom.html DOM
 * (selectors read from the live markup, never edited), and asserts against
 * the raw WS frames every page/observer sees (see lib/wsTap.mjs — the
 * adapters' own window.__stands view is too narrow for several of these:
 * no `presence`, no raw ledger/status/odds).
 *
 * Step order matters: the shared read-only feed observer and the full-time
 * wait are both "listen in the background while other steps run" -- opened
 * early / checked late -- so the replay gets the maximum wall-clock budget
 * without the run serially blocking on it.
 */
import { chromium } from 'playwright';
import { STATUS } from './report.mjs';
import { initScript, readLog, lastOfType } from './wsTap.mjs';
import { openObserver } from './rawWs.mjs';
import { sleep, waitFor, short } from './util.mjs';

const VIEWPORT = { width: 390, height: 844 };
const GOAL_WAIT_TIMEOUT_MS = 75_000;
// Generous on purpose: a REPLAY_SPEED chosen to give the pre-kickoff setup
// above a safe margin (predictions LOCK at kickoff -- see README) pushes full
// time further out in wall-clock terms too. This is a one-sided cost (a real
// FULL_TIME arrives and the step resolves immediately; only an absent replay
// pays the full wait before an honest SKIP).
const FULL_TIME_TIMEOUT_MS = 240_000;
const CHEER_TIMEOUT_MS = 2_000; // brief: "a discrete cheer signal <= 2s"

function qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

async function step(report, name, fn) {
  try {
    await fn();
  } catch (err) {
    report.add(name, STATUS.FAIL, `threw: ${err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : String(err)}`);
  }
}

async function newTab(browser, { wsHost, enforceAllowlist = false }) {
  const context = await browser.newContext({ viewport: VIEWPORT, isMobile: true, hasTouch: true });
  await context.addInitScript(initScript, { wsHost, enforceAllowlist });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));
  return { context, page, consoleErrors };
}

function lastPresence(log) {
  const m = lastOfType(log, 'stands');
  return m && m.data && typeof m.data.presence === 'number' ? m.data.presence : null;
}

function lastRoarFor(log, side) {
  const m = lastOfType(log, 'stands');
  return m && m.data && m.data.roar && typeof m.data.roar[side] === 'number' ? m.data.roar[side] : null;
}

function isConfirmedGoal(msg) {
  return !!(
    msg && msg.type === 'ledger' && msg.data &&
    msg.data.msg && msg.data.msg.type === 'event' &&
    msg.data.msg.ev && msg.data.msg.ev.kind === 'goal' && msg.data.msg.ev.confirmed
  );
}

export async function runFull(report, { web, ws, match, headed }) {
  const wsHost = new URL(ws).host;
  const browser = await chromium.launch({ headless: !headed });
  const closers = [];
  const lensConcerns = [];

  try {
    // ── background: a read-only feed observer for the whole run (market +
    // goal-in-history), decoupled from any browser page's navigation ──────
    const feedObs = openObserver(ws, match, { hello: false });
    closers.push(() => feedObs.close());
    try {
      await feedObs.waitOpen(8000);
    } catch (err) {
      report.add('setup: local WS reachable', STATUS.FAIL, `could not open a bare connection to ${ws} (matchId=${match}): ${err.message}`);
      return; // nothing downstream can possibly work without a reachable WS
    }
    report.add('setup: local WS reachable', STATUS.PASS, `raw connection opened to ${ws}?matchId=${match}`);

    const A = await newTab(browser, { wsHost });
    const B = await newTab(browser, { wsHost });
    closers.push(() => A.context.close(), () => B.context.close());

    // ── setup: drive the real gate.html DOM for both fans, then move to
    // ground.html ourselves. Everything downstream depends on this landing,
    // so a failure here is fatal to the whole run (reported once, clearly)
    // rather than an unstructured crash. ──────────────────────────────────
    let anonIdA, anonIdB, sentA, sentB;
    try {
      // pin the page clock inside the gates-open window for this fixture: since 17 Jul the
      // gate LOCKS until kickoff-30min (matchday.js), and a canary run before match night
      // would otherwise stall on a correctly-locked turnstile. mdnow only bends the page's
      // own clock — every downstream mechanic stays real.
      const mdnow = process.env.CANARY_MDNOW || '';
      const gateUrl = `${web}/gate.html?${qs({ live: 1, match, ws })}${mdnow ? `&mdnow=${encodeURIComponent(mdnow)}` : ''}`;
      const groundUrl = `${web}/ground.html?${qs({ from: 'gate', live: 1, match, ws })}${mdnow ? `&mdnow=${encodeURIComponent(mdnow)}` : ''}`;

      // A and B are fully independent through this whole sequence -- run them
      // concurrently, not serially. This isn't just speed for its own sake:
      // predictions LOCK at kickoff (real product behavior), and a replay can
      // reach kickoff in well under a minute even at a modest speed multiplier
      // (see README) -- every second this setup takes serially eats directly
      // into that pre-kickoff window.
      async function gateFlow(page, { sideSel, homeClicks, awayClicks }) {
        await page.goto(gateUrl, { waitUntil: 'load' });
        await page.waitForFunction(() => !!window.__stands, null, { timeout: 10000 });
        await page.click(sideSel);
        for (let i = 0; i < homeClicks; i++) await page.click('.scn[data-t="h"]');
        for (let i = 0; i < awayClicks; i++) await page.click('.scn[data-t="a"]');
        await page.click('#go');
        const anonId = await page.evaluate(() => window.__stands && window.__stands.anonId);
        const sent = await waitFor(() => readLog(page), (log) => log.sends.find((s) => s.type === 'predict'), { timeoutMs: 3000 });
        await page.goto(groundUrl, { waitUntil: 'load' }); // explicit &ws=, see README "the ws override gap"
        return { anonId, sent };
      }

      const [rA, rB] = await Promise.all([
        gateFlow(A.page, { sideSel: '.end[data-side="h"]', homeClicks: 2, awayClicks: 1 }), // A: 2-1
        gateFlow(B.page, { sideSel: '.end[data-side="a"]', homeClicks: 1, awayClicks: 2 }), // B: 1-2
      ]);
      anonIdA = rA.anonId; sentA = rA.sent;
      anonIdB = rB.anonId; sentB = rB.sent;
    } catch (err) {
      report.add('setup: gate.html flow (side pick + predict)', STATUS.FAIL,
        `could not drive gate.html to completion for A/B: ${err && err.stack ? err.stack.split('\n').slice(0, 4).join(' | ') : String(err)}`);
      return; // every remaining step needs A/B seated + rooted; nothing downstream is meaningful
    }

    await step(report, 'gate: side pick (root reaches the crowd count)', async () => {
      const r = await waitFor(() => readLog(A.page), (log) => {
        const v = lastOfType(log, 'stands');
        const c = v && v.data && v.data.counts;
        return c && c.home >= 1 && c.away >= 1 ? c : null;
      }, { timeoutMs: 6000 });
      const sentDetail = `predict frame ${sentA.ok ? `sent by A at +${sentA.elapsedMs}ms` : 'was NOT observed sent by A within 3s'}; ${sentB.ok ? `sent by B at +${sentB.elapsedMs}ms` : 'was NOT observed sent by B within 3s'}`;
      if (r.ok) {
        report.add('gate: side pick (root reaches the crowd count)', STATUS.PASS,
          `A(${short(anonIdA)}) rooted home, B(${short(anonIdB)}) rooted away; counts.home=${r.value.home} counts.away=${r.value.away} (gate.html #go fired hello-with-side; ${sentDetail})`);
      } else {
        report.add('gate: side pick (root reaches the crowd count)', STATUS.FAIL,
          `counts never reflected both sides rooted within 6s; last stands broadcast on ground.html: ${JSON.stringify(lastOfType(r.last, 'stands'))}`);
      }
    });

    await step(report, 'gate: predict distinctness (consensus)', async () => {
      const r = await waitFor(() => readLog(A.page), (log) => {
        const msgs = log.received.filter((m) => m.type === 'consensus');
        for (let i = msgs.length - 1; i >= 0; i--) {
          const c = msgs[i].data;
          if (c && c.all && c.all.n >= 2 && c.byRoot.home.n >= 1 && c.byRoot.away.n >= 1) return c;
        }
        return null;
      }, { timeoutMs: 8000 });
      if (!r.ok) {
        report.add('gate: predict distinctness (consensus)', STATUS.FAIL, 'no consensus broadcast reflecting both A and B predictions arrived within 8s of joining ground.html');
        return;
      }
      const c = r.value;
      const homeOk = c.byRoot.home.mean.home === 2 && c.byRoot.home.mean.away === 1;
      const awayOk = c.byRoot.away.mean.home === 1 && c.byRoot.away.mean.away === 2;
      const distinct = c.byRoot.home.mean.home !== c.byRoot.away.mean.home || c.byRoot.home.mean.away !== c.byRoot.away.mean.away;
      if (homeOk && awayOk && distinct) {
        report.add('gate: predict distinctness (consensus)', STATUS.PASS,
          `consensus.all.n=${c.all.n}; byRoot.home mean=${JSON.stringify(c.byRoot.home.mean)} (n=${c.byRoot.home.n}); byRoot.away mean=${JSON.stringify(c.byRoot.away.mean)} (n=${c.byRoot.away.n}) -- distinct per side`);
      } else {
        report.add('gate: predict distinctness (consensus)', STATUS.FAIL, `consensus did not reflect A=2-1/B=1-2 distinctly: ${JSON.stringify(c.byRoot)}`);
      }
    });

    // ── ground.html: cheer -> B observes it (try onCheer, else roar-delta PROVISIONAL) ──
    await step(report, 'ground: cheer signal (A -> B, <=2s)', async () => {
      const hasOnCheer = await B.page.evaluate(() => typeof (window.__stands && window.__stands.onCheer) === 'function');
      if (hasOnCheer) {
        await B.page.evaluate(() => {
          window.__canaryCheerEchoes = [];
          window.__stands.onCheer((e) => window.__canaryCheerEchoes.push(Object.assign({ atMs: Date.now() }, e)));
        });
      }
      const beforeLog = await readLog(B.page);
      const roarBefore = lastRoarFor(beforeLog, 'home') ?? 0; // B rooted away; A (home) cheering should move roar.home

      // ground.html's default lens is "stands" (wrap.crowd-full), which
      // deliberately collapses the outer #youEnd band to max-height:0 /
      // pointer-events:none -- the full cheer surface is the terrace.html
      // iframe instead while that lens is showing. #youEnd is the thin
      // framing shown on the OTHER lenses, so switch there first (also
      // exercises the same dial the lens-switch step depends on).
      await A.page.click('.dseg[data-lens="loom"]');
      await sleep(500); // let the max-height/opacity transition (.42s) finish

      for (let i = 0; i < 6; i++) {
        await A.page.click('#youEnd');
        await sleep(60);
      }
      const cheerSentA = await waitFor(() => readLog(A.page), (log) => log.sends.find((s) => s.type === 'cheer'), { timeoutMs: 1000 });

      if (hasOnCheer) {
        const r = await waitFor(() => B.page.evaluate(() => window.__canaryCheerEchoes || []), (list) => list.find((e) => e.side === 'home') || null, { timeoutMs: CHEER_TIMEOUT_MS });
        if (r.ok) {
          report.add('ground: cheer signal (A -> B, <=2s)', STATUS.PASS,
            `window.__stands.onCheer fired on B within ${r.elapsedMs}ms of A's cheer (cheer frame sent at +${cheerSentA.ok ? cheerSentA.elapsedMs : '?'}ms): ${JSON.stringify(r.value)}`);
          return;
        }
        // onCheer exists but nothing arrived -- fall through to the roar-delta check as extra evidence, but this is a real FAIL, not provisional (Task 2's contract wasn't met).
        const rr = await waitFor(() => readLog(B.page), (log) => {
          const v = lastRoarFor(log, 'home');
          return v !== null && v > roarBefore ? v : null;
        }, { timeoutMs: 500 });
        report.add('ground: cheer signal (A -> B, <=2s)', STATUS.FAIL,
          `window.__stands.onCheer exists but never fired within ${CHEER_TIMEOUT_MS}ms of A's cheer (roar.home ${rr.ok ? `did rise to ${rr.value}` : 'also did not rise'} in the meantime)`);
        return;
      }

      // PROVISIONAL fallback per brief: onCheer not landed yet (Task 2) -- assert roar delta > 0 instead.
      const r = await waitFor(() => readLog(B.page), (log) => {
        const v = lastRoarFor(log, 'home');
        return v !== null && v > roarBefore ? v : null;
      }, { timeoutMs: CHEER_TIMEOUT_MS });
      if (r.ok) {
        report.add('ground: cheer signal (A -> B, <=2s)', STATUS.PROVISIONAL,
          `window.__stands.onCheer not present yet (Task 2 pending) -- fell back to roar delta: roar.home ${roarBefore} -> ${r.value} within ${r.elapsedMs}ms (cheer frame sent at +${cheerSentA.ok ? cheerSentA.elapsedMs : '?'}ms)`);
      } else {
        report.add('ground: cheer signal (A -> B, <=2s)', STATUS.FAIL,
          `no onCheer hook and roar.home never rose above ${roarBefore} within ${CHEER_TIMEOUT_MS}ms of A's cheer`);
      }
    });

    // ── ground.html: lens-switch / presence resilience ──────────────────
    await step(report, 'ground: presence resilience (lens-switch)', async () => {
      // Real UI coverage: exercise the actual dial (spawns an iframe socket in
      // production). Locally this iframe's own src omits &ws= (README "the ws
      // override gap"), so our host guard should catch/block its connection --
      // captured here as evidence, not as the assertion itself. A is already
      // on "loom" (the cheer step switched it there); dial to "stadium" so
      // this is a real transition, not a same-lens no-op.
      await A.page.click('.dseg[data-lens="stadium"]').catch(() => {});
      await sleep(700);
      const childFrames = A.page.frames().filter((f) => f !== A.page.mainFrame());
      for (const f of childFrames) {
        try {
          const flog = await f.evaluate(() => window.__canary && window.__canary.blockedConnections);
          if (flog && flog.length) lensConcerns.push(`ground.html lens iframe (${f.url()}) attempted ${flog.length} off-target connection(s): ${flog.map((c) => c.host).join(',')}`);
        } catch { /* frame may not have finished loading a same-origin document yet */ }
      }

      // The real, controllable "extra socket": a raw connection sharing A's
      // anonId+side (see README for why we don't rely on the iframe's own
      // connection for the assertion itself).
      const a2 = openObserver(ws, match, { hello: true, anonId: anonIdA, side: 'home' });
      await a2.waitOpen(5000);
      await sleep(500); // let hello land + a couple of 4Hz broadcast ticks pass

      const beforeLog = await readLog(B.page);
      const presenceBefore = lastPresence(beforeLog);

      a2.close();
      await sleep(900); // let the close propagate + a couple more ticks pass

      const afterLog = await readLog(B.page);
      const presenceAfter = lastPresence(afterLog);

      const evidence = `presence before A's 2nd connection closes: ${presenceBefore}; after: ${presenceAfter}` +
        (lensConcerns.length ? ` | ${lensConcerns.join(' | ')}` : '');

      if (presenceBefore === null || presenceAfter === null) {
        report.add('ground: presence resilience (lens-switch)', STATUS.FAIL, `could not read a numeric presence field from B's stands broadcast -- ${evidence}`);
      } else if (presenceAfter >= presenceBefore) {
        report.add('ground: presence resilience (lens-switch)', STATUS.PASS, evidence);
      } else {
        report.add('ground: presence resilience (lens-switch)', STATUS.FAIL,
          `B observed presence DROP (${presenceBefore} -> ${presenceAfter}) when A closed one of two connections while the other (A's real ground.html tab) stayed open -- ${evidence} (see services/stands/src/match-state.ts: presence is tracked as connected:Set<anonId>; markDisconnected() deletes the anonId unconditionally on ANY connection close, even with a sibling connection still open -- this is the exact bug tonight's Task 2 plan targets)`);
      }
    });

    // ── woven-loom.html: late join after a goal must not erupt GOOOL ────
    await step(report, 'woven-loom: GOOOL suppressed on late join', async () => {
      const goalWait = await waitFor(() => Promise.resolve(feedObs.received), (list) => list.find(isConfirmedGoal) || null, { timeoutMs: GOAL_WAIT_TIMEOUT_MS });
      if (!goalWait.ok) {
        report.add('woven-loom: GOOOL suppressed on late join', STATUS.SKIPPED,
          `no confirmed goal ledger event observed on the shared feed connection within ${GOAL_WAIT_TIMEOUT_MS}ms for match=${match} -- local stack likely has no replay/live feed producing goals (see README "Enabling full-time replay")`);
        return;
      }

      const C = await newTab(browser, { wsHost });
      closers.push(() => C.context.close());
      const loomUrl = `${web}/woven-loom.html?${qs({ match, live: 1, site: 1, loomfeed: 1, standsfeed: 1, ws })}`;
      await C.page.goto(loomUrl, { waitUntil: 'load' });
      await sleep(3000); // let the join-replay weave history + (if it were going to) erupt GOOOL

      const cLog = await readLog(C.page);
      const replayedGoal = cLog.received.find((m) => isConfirmedGoal(m) && m.data && m.data._replay);
      const gooolClass = await C.page.evaluate(() => { const el = document.getElementById('gooool'); return el ? el.className : null; });
      const fired = typeof gooolClass === 'string' && /(^|\s)on(\s|$)/.test(gooolClass);

      if (!replayedGoal) {
        report.add('woven-loom: GOOOL suppressed on late join', STATUS.SKIPPED,
          `C joined but no ledger goal event tagged _replay was observed (gooolEl class="${gooolClass}") -- either the goal fell out of the server's join-snapshot window, or it arrived live rather than as history; cannot verify suppression meaningfully`);
        return;
      }
      if (fired) {
        report.add('woven-loom: GOOOL suppressed on late join', STATUS.FAIL,
          `#gooool gained class "${gooolClass}" for a historical goal replayed with _replay=true (ledger id=${replayedGoal.data.msg.ev.id}) -- late joiners must not see the eruption`);
      } else {
        report.add('woven-loom: GOOOL suppressed on late join', STATUS.PASS,
          `C joined after a confirmed goal (ledger id=${replayedGoal.data.msg.ev.id}); server replayed it with _replay=true; #gooool class stayed "${gooolClass}" (never gained "on")`);
      }
    });

    // ── full-time: personal, side-aware verdict (A and B, concurrently) ──
    await step(report, 'full-time: personal side-aware verdict', async () => {
      const [va, vb] = await Promise.all([
        waitFor(() => readLog(A.page), (log) => lastOfType(log, 'predictVerdict'), { timeoutMs: FULL_TIME_TIMEOUT_MS }),
        waitFor(() => readLog(B.page), (log) => lastOfType(log, 'predictVerdict'), { timeoutMs: FULL_TIME_TIMEOUT_MS }),
      ]);
      if (!va.ok || !vb.ok) {
        report.add('full-time: personal side-aware verdict', STATUS.SKIPPED,
          `no predictVerdict observed for ${!va.ok ? 'A' : ''}${!va.ok && !vb.ok ? ' and ' : ''}${!vb.ok ? 'B' : ''} within ${FULL_TIME_TIMEOUT_MS}ms -- local stack likely isn't running a replay that reaches FULL_TIME for match=${match} (see README "Enabling full-time replay")`);
        return;
      }
      const dataA = va.value.data;
      const dataB = vb.value.data;
      const aLog = await readLog(A.page);
      const bLog = await readLog(B.page);
      const aOnlyOwn = aLog.received.filter((m) => m.type === 'predictVerdict').every((m) => m.data.anonId === anonIdA);
      const bOnlyOwn = bLog.received.filter((m) => m.type === 'predictVerdict').every((m) => m.data.anonId === anonIdB);
      const shapeOk = dataA.anonId === anonIdA && dataB.anonId === anonIdB &&
        dataA.predicted.home === 2 && dataA.predicted.away === 1 &&
        dataB.predicted.home === 1 && dataB.predicted.away === 2;

      if (shapeOk && aOnlyOwn && bOnlyOwn) {
        report.add('full-time: personal side-aware verdict', STATUS.PASS,
          `final=${dataA.final.home}-${dataA.final.away}; A predicted 2-1 -> verdict=${dataA.verdict}; B predicted 1-2 -> verdict=${dataB.verdict}; each socket received only its own anonId's verdict`);
      } else {
        report.add('full-time: personal side-aware verdict', STATUS.FAIL,
          `verdict delivery was not correctly personal/side-aware: A=${JSON.stringify(dataA)} (onlyOwn=${aOnlyOwn}) B=${JSON.stringify(dataB)} (onlyOwn=${bOnlyOwn})`);
      }
    });

    // ── market: pre-match odds render, if the local feed provides them ──
    await step(report, 'pre-match: market renders', async () => {
      const tick = feedObs.received.find((m) => m.type === 'odds' && m.data && m.data.tick && m.data.tick.period !== 'et' && typeof m.data.tick.pHome === 'number');
      if (!tick) {
        report.add('pre-match: market renders', STATUS.SKIPPED,
          `no odds/market tick observed on the shared feed connection for match=${match} -- local stack may be replaying a scores-only fixture (odds live on TxLINE's separate /api/odds/stream, recorded to a separate fixture file) -- see README "Enabling the market step"`);
        return;
      }
      const t = tick.data.tick;
      report.add('pre-match: market renders', STATUS.PASS, `de-vigged triple observed: home=${t.pHome.toFixed(3)} draw=${t.pDraw.toFixed(3)} away=${t.pAway.toFixed(3)} (period=${t.period})`);
    });
  } finally {
    for (const close of closers) {
      try { await close(); } catch { /* best-effort teardown */ }
    }
    await browser.close();
  }
}
