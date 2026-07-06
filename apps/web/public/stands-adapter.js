/*
 * ROOOT — STANDS ADAPTER (coordinator lane: wire → window.__stands).
 *
 * Surfaces the crowd mechanisms for a STATIC fan-section page (the loom pattern,
 * for the Stands). Speaks contracts/crowd.ts on the same stands WebSocket; the
 * server already handles all of it (root/cheer/predict/react + consensus/moments).
 * A bundled app would use src/data/crowd-client.ts instead — this is the static
 * equivalent, exposing window.__stands + subscriptions design renders against.
 *
 * Honesty: counts/roar are real server counts, never blended with market.
 * PREDICT is stamped with the live de-vigged market triple at press time.
 *
 * Opt-in: ?standsfeed=1, or wherever the fan experience runs (/, /live,
 * ?loomfeed=1, ?site=1). Match via ?match=<id>.
 */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  var ON = location.pathname === '/' || location.pathname === '/live'
    || q.get('site') === '1' || q.get('loomfeed') === '1' || q.get('standsfeed') === '1';
  if (!ON) return;
  var matchId = q.get('match') || '18192996';
  var wsBase = q.get('ws') || 'wss://rooot-stands.fly.dev/';

  var ANON_KEY = 'rooot.anonId';
  function anonId() {
    try { var e = localStorage.getItem(ANON_KEY); if (e) return e;
      var f = 'anon-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(ANON_KEY, f); return f;
    } catch (_) { return 'anon-' + Math.random().toString(36).slice(2, 10); }
  }
  var me = anonId();
  var ws = null, mySide = null, backoff = 1000;
  var lastTriple = null;                 // live de-vigged market, for the predict stamp
  var trailing = null;                   // side currently behind → faith
  var lastScore = { home: 0, away: 0 };
  var cb = { state: [], consensus: [], verdict: [], moment: [], momentResult: [] };
  function fire(list, v) { for (var i = 0; i < list.length; i++) { try { list[i](v); } catch (e) {} } }

  function send(m) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(m)); } catch (e) {} } }
  function hello() { send({ type: 'hello', matchId: matchId, anonId: me, side: mySide || undefined }); }

  // ── the surface design renders against ──
  var pendingCheer = 0, cheerTimer = null, view = { rooted: { home: 0, away: 0 }, roar: { home: 0, away: 0 }, faithSide: null, connected: false };
  window.__stands = {
    anonId: me,
    matchId: matchId,
    root: function (side) { mySide = side === 'away' ? 'away' : 'home'; hello(); publish(); },
    cheer: function () { if (!mySide) return; pendingCheer++; if (!cheerTimer) cheerTimer = setTimeout(flushCheer, 120); },
    predict: function (home, away) {
      send({ type: 'predict', matchId: matchId, anonId: me, home: home, away: away,
        marketAtPredict: lastTriple || undefined, atMs: Date.now() });
    },
    momentReact: function (momentId, token) {
      if (!mySide) return;
      send({ type: 'momentReact', matchId: matchId, momentId: momentId, anonId: me, side: mySide, token: token, atMs: Date.now() });
    },
    onState: function (fn) { cb.state.push(fn); publish(); },        // {rooted, roar, faithSide, connected}
    onConsensus: function (fn) { cb.consensus.push(fn); },           // the crowd's predicted scoreline (all + byRoot + doubters)
    onVerdict: function (fn) { cb.verdict.push(fn); },               // your prediction verdict at FT
    onMoment: function (fn) { cb.moment.push(fn); },                 // a drama window opens (kind, side, palette, closesAtMs)
    onMomentResult: function (fn) { cb.momentResult.push(fn); },     // the split reveal
  };
  function flushCheer() { cheerTimer = null; var n = pendingCheer; pendingCheer = 0; if (n > 0 && mySide) send({ type: 'cheer', matchId: matchId, side: mySide, n: n, atMs: Date.now() }); }
  function publish() { view.faithSide = trailing; fire(cb.state, view); }

  function onMsg(m) {
    switch (m.type) {
      case 'stands':
        if (m.matchId !== matchId) return;
        view.rooted = { home: m.counts.home, away: m.counts.away };
        view.roar = { home: m.roar.home, away: m.roar.away };
        view.connected = true; publish();
        break;
      case 'consensus': if (m.matchId === matchId) fire(cb.consensus, m); break;
      case 'predictVerdict': if (m.matchId === matchId && m.anonId === me) fire(cb.verdict, m); break;
      case 'moment': if (m.matchId === matchId) fire(cb.moment, m); break;
      case 'momentResult': if (m.matchId === matchId) fire(cb.momentResult, m); break;
      case 'odds': { var t = m.tick; if (t && t.period !== 'et') lastTriple = { home: t.pHome, draw: t.pDraw, away: t.pAway }; break; }
      case 'score':
        if (m.ev && typeof m.ev.home === 'number') {
          lastScore = { home: m.ev.home, away: m.ev.away };
          trailing = lastScore.home < lastScore.away ? 'home' : lastScore.away < lastScore.home ? 'away' : null;
          publish();
        }
        break;
      default: break;
    }
  }

  function connect() {
    var url = wsBase + (wsBase.indexOf('?') >= 0 ? '&' : '?') + 'matchId=' + encodeURIComponent(matchId);
    try { ws = new WebSocket(url); } catch (e) { setTimeout(connect, backoff); return; }
    ws.onopen = function () { backoff = 1000; hello(); console.log('[stands-adapter] live wire →', matchId); };
    ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (_) { return; } try { onMsg(m); } catch (err) { console.warn('[stands-adapter]', err); } };
    ws.onclose = function () { view.connected = false; publish(); setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30000); };
    ws.onerror = function () { try { ws.close(); } catch (_) {} };
  }
  connect();
})();
