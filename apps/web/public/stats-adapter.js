/*
 * ROOOT — STATS ADAPTER (coordinator lane: wire → window.__stats).
 *
 * Derives a live per-side MATCH STATS aggregate from the same stands WebSocket
 * feed the loom rides (contracts/stats.ts is the schema). Design reads
 * window.__stats and subscribes via window.__statsAdapter.onStats(cb).
 *
 * Honesty: everything here is REAL off the wire — shots (by outcome), corners,
 * cards, goals, VAR, free-kicks, danger/high-danger pressure, and a TERRITORY
 * proxy (share of attacking pressure, NOT ball possession). possessionPct/
 * fouls/offsides stay null (pending the TxODDS ScoreStatKey legend) — never faked.
 *
 * Opt-in: ?statsfeed=1, or wherever the fan experience runs (/, /live,
 * ?loomfeed=1, ?site=1). Match via ?match=<id> (default = tonight's fixture).
 */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  var ON = location.pathname === '/' || location.pathname === '/live'
    || q.get('site') === '1' || q.get('loomfeed') === '1' || q.get('statsfeed') === '1';
  if (!ON) return;
  var matchId = q.get('match') || '18192996';
  var wsBase = q.get('ws') || 'wss://rooot-stands.fly.dev/';

  // PRESS weights (match the loom) — for the TERRITORY proxy.
  var PRESS = { safe: 0.3, possession: 0.5, attack: 1, danger: 1.5, 'high-danger': 2 };

  function emptySide() {
    return { shots: { total: 0, onTarget: 0, offTarget: 0, blocked: 0, woodwork: 0 },
      corners: 0, freeKicks: 0, cards: { yellow: 0, red: 0 }, goals: 0, varReviews: 0,
      attacks: { danger: 0, highDanger: 0 }, territory: 0.5,
      possessionPct: null, fouls: null, offsides: null };
  }
  var stats = { minute: null, home: emptySide(), away: emptySide(),
    pending: ['possession %', 'fouls', 'offsides'] };
  var terr = { home: 0, away: 0 };  // weighted attacking pressure per side → territory
  var seen = {};                    // ev.id → true (dedup: the wire re-emits)
  var cbs = [];
  window.__stats = stats;
  window.__statsAdapter = { stats: stats, matchId: matchId, onStats: function (cb) { cbs.push(cb); if (typeof cb === 'function') try { cb(stats); } catch (e) {} } };
  function emit() { for (var i = 0; i < cbs.length; i++) { try { cbs[i](stats); } catch (e) {} } }

  function sideOf(s) { return s === 'home' ? stats.home : s === 'away' ? stats.away : null; }

  function onLedgerEvent(ev) {
    var k = ev.kind, sd = sideOf(ev.side), id = ev.id, d = (ev.detail || '').toLowerCase();
    if (!sd) return;                          // side-less rows don't map to a side stat
    if (id && seen[id] && k !== 'goal') return; // dedup re-emits (goals handled below by confirmed)
    switch (k) {
      case 'shot':
        if (id) seen[id] = true;
        sd.shots.total++;
        if (d.indexOf('wood') >= 0 || d.indexOf('post') >= 0 || d.indexOf('bar') >= 0) sd.shots.woodwork++;
        else if (d.indexOf('block') >= 0) sd.shots.blocked++;
        else if (d.indexOf('on') >= 0) sd.shots.onTarget++;
        else if (d.indexOf('off') >= 0) sd.shots.offTarget++;
        break;
      case 'corner': if (id) seen[id] = true; sd.corners++; break;
      case 'free-kick': if (id) seen[id] = true; sd.freeKicks++; break;
      case 'yellow-card': if (id) seen[id] = true; sd.cards.yellow++; break;
      case 'red-card': if (id) seen[id] = true; sd.cards.red++; break;
      case 'var': if (id && !seen['V' + id]) { seen['V' + id] = true; sd.varReviews++; } break;
      case 'goal': if (ev.confirmed && id && !seen['G' + id]) { seen['G' + id] = true; sd.goals++; } break;
      case 'danger': {
        if (id) seen[id] = true;
        var high = d.indexOf('high') >= 0;
        if (high) sd.attacks.highDanger++; else sd.attacks.danger++;
        terr[ev.side] += high ? PRESS['high-danger'] : PRESS.danger;
        break;
      }
      default: break;
    }
  }

  function recomputeTerritory() {
    var tot = terr.home + terr.away;
    if (tot > 0) { stats.home.territory = terr.home / tot; stats.away.territory = terr.away / tot; }
  }

  function onFeed(msg) {
    switch (msg.type) {
      case 'status': if (msg.ev && typeof msg.ev.minute === 'number') stats.minute = msg.ev.minute; break;
      case 'score': if (msg.ev && typeof msg.ev.minute === 'number') stats.minute = msg.ev.minute; break;
      case 'ledger':
        if (msg.msg && msg.msg.type === 'event') { onLedgerEvent(msg.msg.ev); recomputeTerritory(); emit(); }
        break;
      case 'spell': {
        var sp = msg.spell;
        if (sp && sp.side && PRESS[sp.kind] != null) { terr[sp.side] += PRESS[sp.kind]; recomputeTerritory(); emit(); }
        break;
      }
      default: break;
    }
  }

  // ── transport: WS to the stands service (mirrors loom-adapter) ──
  var url = wsBase + (wsBase.indexOf('?') >= 0 ? '&' : '?') + 'matchId=' + encodeURIComponent(matchId);
  var backoff = 1000;
  function connect() {
    var ws;
    try { ws = new WebSocket(url); } catch (e) { setTimeout(connect, backoff); return; }
    ws.onopen = function () { backoff = 1000; console.log('[stats-adapter] live wire →', matchId); };
    ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (_) { return; } try { onFeed(m); } catch (err) { console.warn('[stats-adapter] translate error', err); } };
    ws.onclose = function () { setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30000); };
    ws.onerror = function () { try { ws.close(); } catch (_) {} };
  }
  connect();
})();
