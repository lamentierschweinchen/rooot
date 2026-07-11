(function (root) {
  'use strict';
  var TUNE = {
    homeSize: 8203, awaySize: 14100,   // fabricated crowd sizes (labeled "simulated")
    homeBias: 0.14, reactivity: 1.0, regression: 0.02, roarDecay: 0.90,
    divergenceGain: 1.0, crescendo: 0.82, lullTicks: 20
  };
  function createModel(tune) {
    var T = Object.assign({}, TUNE, tune || {});
    var st = {
      home: 0, away: 0, minute: 0, phase: 'PRE', done: false,
      market: { home: 0.34, draw: 0.33, away: 0.33 },
      belief: { home: 0.5, away: 0.5 },     // each camp's hope for ITS team
      roar: { home: 0, away: 0 }, faithSide: null, crescendo: false, moments: [], consensus: null
    };
    var momentSeq = 0, quietTicks = 0, pendingMoments = [], lastVerdict = null;
    st.pullMoment = function () { return pendingMoments.shift() || null; };
    st.pullVerdict = function () { return lastVerdict; };
    function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
    function sideOf(msg) { var s = msg.msg && msg.msg.ev && msg.msg.ev.side; return s === 'home' ? 'home' : s === 'away' ? 'away' : null; }
    function impulse(side, mag) { if (!side) return; var other = side === 'home' ? 'away' : 'home';
      st.belief[side] = clamp01(st.belief[side] + mag * T.reactivity); st.belief[other] = clamp01(st.belief[other] - mag * 0.5 * T.reactivity); }
    function marketFor(side) { return side === 'home' ? st.market.home : st.market.away; }
    function biasedTarget(side) { return clamp01(marketFor(side) + T.homeBias); }   // hope sits above the market
    function round1(x) { return Math.round(x * 10) / 10; }
    st.tick = function () {
      ['home', 'away'].forEach(function (side) {
        st.roar[side] = st.roar[side] * T.roarDecay;                       // decay toward zero; ingest() adds spikes on attacking events
        st.belief[side] += (biasedTarget(side) - st.belief[side]) * T.regression;   // drift toward hopeful baseline
      });
      st.faithSide = st.home < st.away ? 'home' : st.away < st.home ? 'away' : null;   // the trailing end keeps faith
      st.crescendo = (st.roar.home > T.crescendo) || (st.roar.away > T.crescendo);
      if (st.phase === 'FIRST_HALF' || st.phase === 'SECOND_HALF') {   // a lull in open play opens a mini-prediction
        quietTicks++;
        if (quietTicks === T.lullTicks) pendingMoments.push({ momentId: ++momentSeq, kind: 'predict', side: null, palette: 'predict', closesAtMs: st.minute });
      }
      // consensus: crowd's predicted scoreline = current score + expected-more from belief (kept simple)
      // byRoot: each partisan camp's own hopeful scoreline, leaning toward its own team via T.homeBias
      st.consensus = {
        all: [round1(st.home + st.belief.home), round1(st.away + st.belief.away)],
        byRoot: {
          home: [round1(st.home + st.belief.home + T.homeBias), round1(st.away + st.belief.away - T.homeBias * 0.5)],
          away: [round1(st.home + st.belief.home - T.homeBias * 0.5), round1(st.away + st.belief.away + T.homeBias)]
        },
        market: [st.market.home, st.market.draw, st.market.away]
      };
    };
    function ingest(msg) {
      if (!msg || !msg.type) return;
      // advance the match minute off whichever event carries it — score.minute is often null
      // on the wire; status + ledger carry a real liveMinute (used by moments + the demo clock).
      var _mm = (msg.type === 'status' && msg.ev && typeof msg.ev.minute === 'number') ? msg.ev.minute
              : (msg.type === 'ledger' && msg.msg && msg.msg.ev && typeof msg.msg.ev.minute === 'number') ? msg.msg.ev.minute
              : (msg.type === 'score' && msg.ev && typeof msg.ev.minute === 'number') ? msg.ev.minute : null;
      if (_mm !== null && _mm > st.minute) st.minute = _mm;
      if (msg.type === 'score' && msg.ev) { st.home = msg.ev.home; st.away = msg.ev.away; }
      else if (msg.type === 'status' && msg.ev) {
        st.phase = msg.ev.phase || st.phase;
        if (msg.ev.phase === 'FULL_TIME' || msg.ev.phase === 'PENALTIES') {
          if (st.userPredict) lastVerdict = { predicted: [st.userPredict.home, st.userPredict.away], actual: [st.home, st.away],
            hit: st.userPredict.home === st.home && st.userPredict.away === st.away };
          st.done = true;
        }
      }
      else if (msg.type === 'odds' && msg.tick) { st.market = { home: msg.tick.pHome, draw: msg.tick.pDraw, away: msg.tick.pAway }; }
      else if (msg.type === 'ledger' && msg.msg && msg.msg.type === 'event') {
        var k = msg.msg.ev.kind, sd = sideOf(msg);
        if (k === 'danger') { impulse(sd, 0.015); if (sd) st.roar[sd] = Math.min(1, st.roar[sd] + 0.12); }
        else if (k === 'shot') { impulse(sd, 0.03); if (sd) st.roar[sd] = Math.min(1, st.roar[sd] + 0.25); }
        else if (k === 'goal' && msg.msg.ev.confirmed) { impulse(sd, 0.12); if (sd) st.roar[sd] = Math.min(1, st.roar[sd] + 0.7); }
        // a VAR check or a penalty (in-progress kick, or a 'possible' being checked as
        // one — contracts/normalize.ts sets no ev.detail for 'possible'; the real
        // wire-carried flag survives on ev.raw.Data.Penalty) opens a verdict moment.
        if (k === 'var' || k === 'penalty-kick' || (k === 'possible' && msg.msg.ev.raw && msg.msg.ev.raw.Data && msg.msg.ev.raw.Data.Penalty === true))
          pendingMoments.push({ momentId: ++momentSeq, kind: 'verdict', side: sd, palette: k === 'var' ? 'var' : 'pen', closesAtMs: st.minute });
        quietTicks = 0;   // any story-worthy event resets the lull
      }
    }
    function tick() { st.tick(); }
    function snapshot() {
      return {
        rooted: { home: T.homeSize, away: T.awaySize },
        roar: { home: st.roar.home, away: st.roar.away },
        faithSide: st.faithSide, crescendo: st.crescendo, connected: true,
        consensus: st.consensus, moments: st.moments.slice()
      };
    }
    return { ingest: ingest, tick: tick, snapshot: snapshot, pullMoment: st.pullMoment, pullVerdict: st.pullVerdict, _st: st, _T: T };
  }
  root.createModel = createModel;
  if (typeof module !== 'undefined' && module.exports) module.exports = { createModel: createModel };

  if (typeof window === 'undefined') return;
  var q = new URLSearchParams(location.search);
  var DEMO = q.get('demo') === '1';   // live by default; demo only when explicitly asked
  if (!DEMO && q.get('crowdsim') !== '1') return;   // private prototype defaults to demo; explicit live/demo=0 opts out
  var matchId = q.get('match') || '18202783';
  var wsBase = q.get('ws'); // explicit only — connectFeed() decides WS vs. baked from its presence
  var model = createModel();
  var cb = { state: [], consensus: [], verdict: [], moment: [], momentResult: [] };
  var me = 'sim-' + matchId, mySide = null, verdictFired = false;
  function fire(list, v) { for (var i = 0; i < list.length; i++) try { list[i](v); } catch (e) {} }
  function publish() {
    var s = model.snapshot();
    fire(cb.state, { rooted: s.rooted, roar: s.roar, faithSide: s.faithSide, connected: true });
    if (s.consensus) fire(cb.consensus, s.consensus);
    var mo; while ((mo = model._st.pullMoment())) fire(cb.moment, mo);
    if (!verdictFired) { var vr = model._st.pullVerdict(); if (vr) { verdictFired = true; fire(cb.verdict, vr); } }
  }
  window.__stands = {
    anonId: me, matchId: matchId,
    root: function (side) { mySide = side === 'away' ? 'away' : 'home'; publish(); },
    cheer: function () { if (mySide) { model._st.roar[mySide] = Math.min(1, model._st.roar[mySide] + 0.18); publish(); } },
    predict: function (h, a) { model._st.userPredict = { home: h, away: a }; },
    momentReact: function (id, token) { model._st.userReact = { id: id, token: token }; },
    onState: function (fn) { cb.state.push(fn); publish(); },
    onConsensus: function (fn) { cb.consensus.push(fn); },
    onVerdict: function (fn) { cb.verdict.push(fn); },
    onMoment: function (fn) { cb.moment.push(fn); },
    onMomentResult: function (fn) { cb.momentResult.push(fn); }
  };
  // feed: a real ?ws -> the live WebSocket (unchanged behavior); else, under
  // ?demo=1 with no ?ws, the baked serverless player (see demo-feed.js).
  function connectFeed(matchId, wsBase, onMsg) {
    if (wsBase) {
      var url = wsBase + (wsBase.indexOf('?') >= 0 ? '&' : '?') + 'matchId=' + encodeURIComponent(matchId);
      var ws = null, backoff = 1000, connecting = false, reconnectTimer = null, openedAtMs = 0, watchdogTimer = null;
      // Single-flight + reconnect discipline (see stands-adapter.js for the full incident
      // rationale). The original loop here had no backoff at all (flat 1s retry forever) and
      // no single-flight guard — the exact pre-fix bug the other four adapters carried before
      // being fixed (review I1). This transport is reachable only behind explicit ?ws= plus
      // ?demo=1/?crowdsim=1, never tonight's fan path — this port is hygiene closing the
      // incident class everywhere, not just where it was actually observed. `connecting`
      // guards against two concurrent attempts, `reconnectTimer` against more than one
      // pending reconnect, backoff (1s→30s) resets to 1s only once a connection has stayed
      // open >=5s.
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
        // Connect-attempt watchdog (review I4): on flaky mobile networks — tonight's exact
        // threat model — new WebSocket() can sit forever without ever firing open, error, or
        // close, leaving `connecting` stuck true and this adapter dead with no retry: a fan's
        // page hangs silently. ~10s after an attempt starts, if neither open nor close has
        // fired, abandon it — best-effort close() (its own close callback, if it ever arrives,
        // is a no-op by then, see the `connecting` guard in onSockClose below) then force the
        // same close-path bookkeeping onclose runs, so backoff still escalates (never resets —
        // openedAtMs is still 0) and exactly one reconnect gets scheduled. Cleared on both open
        // and close so a socket that behaves normally never trips it.
        watchdogTimer = setTimeout(function () {
          watchdogTimer = null;
          if (sock !== ws) return; // stale handler guard — should be unreachable under single-flight
          try { sock.close(); } catch (_) {}
          onSockClose();
        }, 10000);
        sock.onopen = function () {
          if (sock !== ws) return; // stale handler guard — should be unreachable under single-flight
          if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
          if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
          openedAtMs = Date.now();
        };
        sock.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (_) { return; } try { onMsg(m); } catch (err) {} };
        function onSockClose() {
          if (sock !== ws || !connecting) return;
          if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
          connecting = false;
          var stayedOpen = openedAtMs > 0 && (Date.now() - openedAtMs) >= 5000;
          backoff = stayedOpen ? 1000 : Math.min(backoff * 2, 30000);
          openedAtMs = 0;
          scheduleReconnect();
        }
        sock.onclose = onSockClose;
        sock.onerror = function () { try { sock.close(); } catch (_) {} };
      }
      connect();
    } else if (DEMO && root.__demoFeed) {
      root.__demoFeed.start(onMsg);
    }
  }
  connectFeed(matchId, wsBase, function (m) { try { model.ingest(m); publish(); } catch (err) {} });
  setInterval(function () { model.tick(); publish(); }, 500);
})(typeof window !== 'undefined' ? window : this);
