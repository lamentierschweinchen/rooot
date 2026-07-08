/*
 * ROOOT — MATCH READ-MODEL (coordinator lane: feed -> window.__match).
 *
 * A tiny read-model for the MATCH itself (score/clock/market/teams) — because
 * window.__loom is push-in (the loom's render sink), not readable. The gate,
 * terrace, and ground surfaces read window.__match for the scoreline, the
 * clock, and the pre-match market instead of tracking the feed themselves.
 *
 * The fold is pure (reduceMatch(state, msg) -> new state) and Node-testable —
 * see scripts/_matchread-test.mjs. The browser glue below is thin: it opens
 * the same feed WebSocket the other adapters use, folds every message through
 * reduceMatch, and republishes window.__match + fires `on(fn)` subscribers.
 *
 * Opt-in: ?demo=1 or ?matchread=1. Match via ?match=<id>, feed via ?ws=<wsBase>
 * (mirrors crowd-sim.js's gate + defaults — a later task may extract a shared
 * connectFeed(url,onMsg); for now this duplicates that ~8-line connect block).
 *
 * Honesty: market is the feed's real de-vigged triple, never synthesized.
 */
(function (root) {
  'use strict';

  function initialState() {
    return {
      score: { home: 0, away: 0 },
      clock: { min: 0, phase: 'PRE', running: false },
      market: { home: 0.34, draw: 0.33, away: 0.33 },
      teams: { home: null, away: null },
      done: false
    };
  }

  // pure fold: the same FeedMsg union crowd-sim.js ingests (contracts/feed.ts)
  function reduceMatch(state, msg) {
    var s = state || initialState();
    if (!msg || !msg.type) return s;
    if (msg.type === 'score' && msg.ev) {
      var clock = (typeof msg.ev.minute === 'number') ? Object.assign({}, s.clock, { min: msg.ev.minute }) : s.clock;
      return Object.assign({}, s, { score: { home: msg.ev.home, away: msg.ev.away }, clock: clock });
    } else if (msg.type === 'status' && msg.ev) {
      var phase = msg.ev.phase || s.clock.phase;
      var running = phase === 'FIRST_HALF' || phase === 'SECOND_HALF' || phase === 'EXTRA_TIME';
      var done = s.done || phase === 'FULL_TIME' || phase === 'PENALTIES';
      return Object.assign({}, s, { clock: Object.assign({}, s.clock, { phase: phase, running: running }), done: done });
    } else if (msg.type === 'odds' && msg.tick) {
      return Object.assign({}, s, { market: { home: msg.tick.pHome, draw: msg.tick.pDraw, away: msg.tick.pAway } });
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
  if (q.get('demo') !== '1' && q.get('matchread') !== '1') return;   // demo-only
  var matchId = q.get('match') || '18202783';
  var wsBase = q.get('ws') || 'wss://rooot-stands.fly.dev/';
  var state = initialState();
  var subs = [];
  function snapshot() { return { score: state.score, clock: state.clock, market: state.market, teams: state.teams, done: state.done }; }
  function fire() { for (var i = 0; i < subs.length; i++) try { subs[i](snapshot()); } catch (e) {} }
  function publish() {
    var s = snapshot();
    window.__match.score = s.score; window.__match.clock = s.clock; window.__match.market = s.market;
    window.__match.teams = s.teams; window.__match.done = s.done;
    fire();
  }
  window.__match = {
    score: state.score, clock: state.clock, market: state.market, teams: state.teams, done: state.done,
    on: function (fn) { subs.push(fn); fn(snapshot()); }
  };
  // feed: reuse the WS the other adapters use
  var url = wsBase + (wsBase.indexOf('?') >= 0 ? '&' : '?') + 'matchId=' + encodeURIComponent(matchId);
  (function connect() {
    var ws; try { ws = new WebSocket(url); } catch (e) { setTimeout(connect, 1000); return; }
    ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (_) { return; } try { state = reduceMatch(state, m); publish(); } catch (err) {} };
    ws.onclose = function () { setTimeout(connect, 1000); };
    ws.onerror = function () { try { ws.close(); } catch (_) {} };
  })();
})(typeof window !== 'undefined' ? window : this);
