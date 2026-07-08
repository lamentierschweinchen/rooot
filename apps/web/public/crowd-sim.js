(function (root) {
  'use strict';
  var TUNE = {
    homeSize: 8203, awaySize: 14100,   // fabricated crowd sizes (labeled "simulated")
    homeBias: 0.14, reactivity: 1.0, regression: 0.02, roarDecay: 0.90,
    divergenceGain: 1.0, crescendo: 0.82
  };
  function createModel(tune) {
    var T = Object.assign({}, TUNE, tune || {});
    var st = {
      home: 0, away: 0, minute: 0, phase: 'PRE', done: false,
      market: { home: 0.34, draw: 0.33, away: 0.33 },
      belief: { home: 0.5, away: 0.5 },     // each camp's hope for ITS team
      roar: { home: 0, away: 0 }, faithSide: null, crescendo: false, moments: [], consensus: null
    };
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
      if (msg.type === 'score' && msg.ev) { st.home = msg.ev.home; st.away = msg.ev.away; if (typeof msg.ev.minute === 'number') st.minute = msg.ev.minute; }
      else if (msg.type === 'status' && msg.ev) { st.phase = msg.ev.phase || st.phase; }
      else if (msg.type === 'odds' && msg.tick) { st.market = { home: msg.tick.pHome, draw: msg.tick.pDraw, away: msg.tick.pAway }; }
      else if (msg.type === 'ledger' && msg.msg && msg.msg.type === 'event') {
        var k = msg.msg.ev.kind, sd = sideOf(msg);
        if (k === 'danger') { impulse(sd, 0.015); if (sd) st.roar[sd] = Math.min(1, st.roar[sd] + 0.12); }
        else if (k === 'shot') { impulse(sd, 0.03); if (sd) st.roar[sd] = Math.min(1, st.roar[sd] + 0.25); }
        else if (k === 'goal' && msg.msg.ev.confirmed) { impulse(sd, 0.12); if (sd) st.roar[sd] = Math.min(1, st.roar[sd] + 0.7); }
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
    return { ingest: ingest, tick: tick, snapshot: snapshot, _st: st, _T: T };
  }
  root.createModel = createModel;
  if (typeof module !== 'undefined' && module.exports) module.exports = { createModel: createModel };

  if (typeof window === 'undefined') return;
  var q = new URLSearchParams(location.search);
  if (q.get('demo') !== '1' && q.get('crowdsim') !== '1') return;   // demo-only
  var matchId = q.get('match') || '18202783';
  var wsBase = q.get('ws') || 'wss://rooot-stands.fly.dev/';
  var model = createModel();
  var cb = { state: [], consensus: [], verdict: [], moment: [], momentResult: [] };
  var me = 'sim-' + matchId, mySide = null;
  function fire(list, v) { for (var i = 0; i < list.length; i++) try { list[i](v); } catch (e) {} }
  function publish() { var s = model.snapshot(); fire(cb.state, { rooted: s.rooted, roar: s.roar, faithSide: s.faithSide, connected: true }); if (s.consensus) fire(cb.consensus, s.consensus); }
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
  // feed: reuse the WS the other adapters use
  var url = wsBase + (wsBase.indexOf('?') >= 0 ? '&' : '?') + 'matchId=' + encodeURIComponent(matchId);
  (function connect() {
    var ws; try { ws = new WebSocket(url); } catch (e) { setTimeout(connect, 1000); return; }
    ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (_) { return; } try { model.ingest(m); publish(); } catch (err) {} };
    ws.onclose = function () { setTimeout(connect, 1000); };
    ws.onerror = function () { try { ws.close(); } catch (_) {} };
  })();
  setInterval(function () { model.tick(); publish(); }, 500);
})(typeof window !== 'undefined' ? window : this);
