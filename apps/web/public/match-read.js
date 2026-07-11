/*
 * ROOOT — MATCH READ-MODEL (coordinator lane: feed -> window.__match).
 *
 * A tiny read-model for the MATCH itself (score/clock/market/teams) — because
 * window.__loom is push-in (the loom's render sink), not readable. The gate,
 * terrace, and ground surfaces read window.__match for the scoreline, the
 * clock, and the pre-match market instead of tracking the feed themselves.
 *
 * The fold is pure (reduceMatch(state, msg) -> new state) and Node-testable —
 * see scripts/_matchread-test.mjs and scripts/_bake-test.mjs. The browser glue
 * below is thin: connectFeed() opens either the live feed WebSocket (a real
 * ?ws) or the baked serverless player (?demo=1, no ?ws — see demo-feed.js),
 * folds every message through reduceMatch, and republishes window.__match +
 * fires `on(fn)` subscribers. connectFeed is intentionally duplicated in
 * crowd-sim.js (~10 lines) rather than shared — not worth a new file.
 *
 * Opt-in: ?demo=1, ?live=1, or ?matchread=1. Match via ?match=<id>; live
 * defaults to the stands WebSocket (override with ?ws=<wsBase>); demo with no
 * ?ws plays the baked apps/web/public/plate/demo-suicol.js recording.
 *
 * Honesty: market is the feed's real de-vigged triple, never synthesized.
 * marketSeries accumulates one { min, home, draw, away } point per odds
 * update — the later odds-chart card's data source.
 */
(function (root) {
  'use strict';

  function initialState() {
    return {
      score: { home: 0, away: 0 },
      clock: { min: 0, phase: 'PRE', running: false },
      market: { home: 0.34, draw: 0.33, away: 0.33 },
      // one { min, home, draw, away } point per odds update — feeds a later odds-chart
      // card. Appended, never mutated in place (reduceMatch stays a pure fold).
      marketSeries: [],
      teams: { home: null, away: null },
      done: false
    };
  }

  // the match minute rides whichever event carries it — score.minute is often null on the
  // wire, but status + ledger events carry a real liveMinute. Pull it from any of them.
  function msgMinute(msg) {
    if (msg.type === 'score' && msg.ev && typeof msg.ev.minute === 'number') return msg.ev.minute;
    if (msg.type === 'status' && msg.ev && typeof msg.ev.minute === 'number') return msg.ev.minute;
    if (msg.type === 'ledger' && msg.msg && msg.msg.ev && typeof msg.msg.ev.minute === 'number') return msg.msg.ev.minute;
    return null;
  }

  // pure fold: the same FeedMsg union crowd-sim.js ingests (contracts/feed.ts)
  function reduceMatch(state, msg) {
    var s = state || initialState();
    if (!msg || !msg.type) return s;
    // advance the clock monotonically off any minute-bearing event, BEFORE the type handlers —
    // so an odds tick's marketSeries point (and clock.min) reads the latest real minute, not 0.
    var mm = msgMinute(msg);
    if (mm !== null && mm > s.clock.min) s = Object.assign({}, s, { clock: Object.assign({}, s.clock, { min: mm }) });
    if (msg.type === 'score' && msg.ev) {
      return Object.assign({}, s, { score: { home: msg.ev.home, away: msg.ev.away } });
    } else if (msg.type === 'status' && msg.ev) {
      var phase = msg.ev.phase || s.clock.phase;
      var running = phase === 'FIRST_HALF' || phase === 'SECOND_HALF' || phase === 'EXTRA_TIME';
      var done = s.done || phase === 'FULL_TIME' || phase === 'PENALTIES';
      return Object.assign({}, s, { clock: Object.assign({}, s.clock, { phase: phase, running: running }), done: done });
    } else if (msg.type === 'odds' && msg.tick) {
      var market = { home: msg.tick.pHome, draw: msg.tick.pDraw, away: msg.tick.pAway };
      var point = { min: s.clock.min, home: market.home, draw: market.draw, away: market.away };
      return Object.assign({}, s, { market: market, marketSeries: s.marketSeries.concat([point]) });
    } else if (msg.type === 'fixtureInfo' && msg.fixture) {
      var mkTeam = function (t) { return t ? { tri: t.code, name: t.name } : null; };
      return Object.assign({}, s, { teams: { home: mkTeam(msg.fixture.home), away: mkTeam(msg.fixture.away) } });
    }
    return s;
  }

  root.reduceMatch = reduceMatch;
  if (typeof module !== 'undefined' && module.exports) module.exports = { reduceMatch: reduceMatch };

  if (typeof window === 'undefined') return;
  var q = new URLSearchParams(location.search);
  var DEMO = q.get('demo') === '1';   // live by default; demo only when explicitly asked
  var LIVE = q.get('live') === '1';
  if (!DEMO && !LIVE && q.get('matchread') !== '1') return;   // private prototype defaults to demo; explicit live/demo=0 opts out
  var explicitMatch = q.get('match');   // ?match= always wins — never touches the manifest
  var wsBase = q.get('ws') || (LIVE ? 'wss://rooot-stands.fly.dev/' : null);
  var state = initialState();
  var subs = [];
  function snapshot() { return { score: state.score, clock: state.clock, market: state.market, marketSeries: state.marketSeries, teams: state.teams, done: state.done }; }
  function fire() { for (var i = 0; i < subs.length; i++) try { subs[i](snapshot()); } catch (e) {} }
  // trailing-edge throttle (~250ms, <=4 fires/s) on the LIVE path only: the window.__match
  // fields above are updated synchronously on every message BEFORE the throttle gate, so
  // reads never go stale — only the subscriber fan-out (fire(), which snapshots + calls each
  // on(fn)) is coalesced, so a join replay's ~1,600 messages can't each force a synchronous
  // render. ?demo=1 is gated out and stays byte-identical (demo-feed.js already paces its own
  // playback; no reconnect loop to storm in the first place).
  var publishTimer = null;
  function publish() {
    var s = snapshot();
    window.__match.score = s.score; window.__match.clock = s.clock; window.__match.market = s.market;
    window.__match.marketSeries = s.marketSeries; window.__match.teams = s.teams; window.__match.done = s.done;
    if (DEMO) { fire(); return; }
    if (publishTimer) return;
    publishTimer = setTimeout(function () { publishTimer = null; fire(); }, 250);
  }
  window.__match = {
    score: state.score, clock: state.clock, market: state.market, marketSeries: state.marketSeries,
    teams: state.teams, done: state.done,
    on: function (fn) { subs.push(fn); fn(snapshot()); }
  };
  // feed: a real ?ws -> the live WebSocket (unchanged behavior); else, under
  // ?demo=1 with no ?ws, the baked serverless player (see demo-feed.js).
  function connectFeed(matchId, wsBase, onMsg) {
    if (wsBase) {
      var url = wsBase + (wsBase.indexOf('?') >= 0 ? '&' : '?') + 'matchId=' + encodeURIComponent(matchId);
      var ws = null, backoff = 1000, connecting = false, reconnectTimer = null, openedAtMs = 0;
      // Single-flight + reconnect discipline (see stands-adapter.js for the full incident
      // rationale). The original loop here had no backoff at all (flat 1s retry forever) —
      // now brought in line with the other adapters: `connecting` guards against two
      // concurrent attempts, `reconnectTimer` against more than one pending reconnect,
      // backoff (1s→30s) resets to 1s only once a connection has stayed open >=5s.
      function scheduleReconnect() {
        if (reconnectTimer || connecting) return;
        reconnectTimer = setTimeout(function () { reconnectTimer = null; connect(); }, backoff);
      }
      function connect() {
        if (connecting) return;
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        connecting = true;
        var sock;
        try { sock = new WebSocket(url); } catch (e) { connecting = false; scheduleReconnect(); return; }
        ws = sock;
        sock.onopen = function () {
          if (sock !== ws) return; // stale handler guard — should be unreachable under single-flight
          if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
          openedAtMs = Date.now();
        };
        sock.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (_) { return; } try { onMsg(m); } catch (err) {} };
        sock.onclose = function () {
          if (sock !== ws) return;
          connecting = false;
          var stayedOpen = openedAtMs > 0 && (Date.now() - openedAtMs) >= 5000;
          backoff = stayedOpen ? 1000 : Math.min(backoff * 2, 30000);
          openedAtMs = 0;
          scheduleReconnect();
        };
        sock.onerror = function () { try { sock.close(); } catch (_) {} };
      }
      connect();
    } else if (DEMO && root.__demoFeed) {
      root.__demoFeed.start(onMsg);
    }
  }
  function bootFeed(matchId) {
    connectFeed(matchId, wsBase, function (m) {
      // Fix 4: guard the odds case by matchId when the server stamps one
      // (kept out of reduceMatch — the exported pure fold stays untouched for
      // scripts/_matchread-test.mjs); tolerate its absence (older server) by
      // falling through to prior behavior.
      if (m && m.type === 'odds' && m.matchId && m.matchId !== matchId) return;
      try { state = reduceMatch(state, m); publish(); } catch (err) {}
    });
  }
  // Shared fixture-manifest resolution (mirrors loom-adapter.js/stands-adapter.js/
  // stats-adapter.js — script-order-independent, one fetch total via the same
  // window.__fixtureReady ||= fetch(...) idiom): (1) ?match= wins outright; (2) the
  // manifest's matchId, raced against a timeout so a hung fetch never blocks the
  // socket; (3) the FRA–MAR live-test literal, last resort. Only the LIVE default
  // goes through the manifest — the demo/prototype default ('18202783', the baked
  // SUI–COL recording plate/demo-suicol.js plays) is untouched: it has nothing to
  // do with tonight's fixture, and ?demo=1 must stay byte-identical to today.
  function resolveMatchId(explicit, cb) {
    if (explicit) { cb(explicit); return; }
    window.__fixtureReady = window.__fixtureReady || fetch('/fixture.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    var done = false;
    // fellBack=true only on the genuine fallback paths (fetch failed/timed out/
    // malformed) — never on a legit manifest read, even one that happens to
    // resolve to this same literal. Warns exactly once (review I2).
    function finish(id, fellBack) {
      if (done) return; done = true;
      if (fellBack) console.warn('[match-read] fixture manifest unavailable — falling back to 18213979');
      cb(id);
    }
    window.__fixtureReady.then(function (fx) {
      if (fx && fx.matchId) finish(fx.matchId, false); else finish('18213979', true);
    }, function () { finish('18213979', true); });
    setTimeout(function () { finish('18213979', true); }, 1500);
  }
  if (LIVE) resolveMatchId(explicitMatch, bootFeed);
  else bootFeed(explicitMatch || '18202783');
})(typeof window !== 'undefined' ? window : this);
