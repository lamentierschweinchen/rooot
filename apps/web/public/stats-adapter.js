/*
 * ROOOT — STATS ADAPTER (coordinator lane: wire → window.__stats).
 *
 * Derives a live per-side MATCH STATS aggregate from the same stands WebSocket
 * feed the loom rides (contracts/stats.ts is the schema). Design reads
 * window.__stats and subscribes via window.__statsAdapter.onStats(cb).
 *
 * Honesty: everything here is REAL off the wire — shots (by outcome), corners,
 * cards, goals, VAR, free-kicks, danger/high-danger pressure, and a TERRITORY
 * proxy (share of attacking pressure, NOT ball possession).
 *
 * LEGEND UNBLOCKED (TxODDS, 2026-07-06): possession %, offsides and shot-by-
 * outcome are now REAL, verified against four recorded matches (backtested via
 * scripts/backtest-stats.ts through the same parser):
 *   • possession % — time-share of the possession-holder, from the possession-
 *     spell stream (safe/possession/attack/danger/high, tagged Participant).
 *   • offsides     — free_kick with FreeKickType==='Offside' (distinct events).
 *   • shots        — Data.Outcome enum (OnTarget/OffTarget/Blocked/Woodwork/…).
 * fouls stays null: non-offside free_kick is the STRONG hypothesis (realistic
 * counts) but TxODDS hasn't confirmed the mapping — we don't show it until they do.
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
  var matchId = q.get('match') || '18198205'; // POR–ESP default tonight
  var wsBase = q.get('ws') || 'wss://rooot-stands.fly.dev/';

  // PRESS weights (match the loom) — for the TERRITORY proxy (danger-weighted).
  var PRESS = { safe: 0.3, possession: 0.5, attack: 1, danger: 1.5, 'high-danger': 2 };

  function emptySide() {
    return { shots: { total: 0, onTarget: 0, offTarget: 0, blocked: 0, woodwork: 0 },
      corners: 0, freeKicks: 0, cards: { yellow: 0, red: 0 }, goals: 0, varReviews: 0,
      attacks: { danger: 0, highDanger: 0 }, territory: 0.5,
      possessionPct: null, fouls: null, offsides: null };
  }
  var stats = { minute: null, home: emptySide(), away: emptySide(),
    pending: ['fouls'] };  // possession % + offsides now derived; fouls pending TxODDS confirm
  var terr = { home: 0, away: 0 };  // weighted attacking pressure per side → territory
  var seen = {};                    // count-once dedup (corners/cards/goals/var/danger)
  var shotById = {};                // id → {side, oc} — upgradeable (outcome lands on the confirmed re-emit)
  var fkById = {};                  // id → {side, type} — upgradeable (FreeKickType lands on confirm)
  var possLast = null;              // {side, c} — the last possession-holder + its clock second
  var possTime = { home: 0, away: 0 };
  var cbs = [];
  window.__stats = stats;
  window.__statsAdapter = { stats: stats, matchId: matchId, onStats: function (cb) { cbs.push(cb); if (typeof cb === 'function') try { cb(stats); } catch (e) {} } };
  function emit() { for (var i = 0; i < cbs.length; i++) { try { cbs[i](stats); } catch (e) {} } }

  function sideOf(s) { return s === 'home' ? stats.home : s === 'away' ? stats.away : null; }

  // shot Data.Outcome (lowercased) → the bucket; null while still unconfirmed (empty Data).
  function shotBucket(d) {
    if (d === 'ontarget' || d === 'scored') return 'onTarget';
    if (d === 'offtarget' || d === 'missed') return 'offTarget';
    if (d === 'blocked') return 'blocked';
    if (d === 'woodwork' || d.indexOf('post') >= 0 || d.indexOf('bar') >= 0) return 'woodwork';
    return null; // unconfirmed — counted in total, not yet bucketed
  }

  // shots + free-kicks re-emit (unconfirmed → confirmed); recount from the id-maps
  // so the confirmed outcome/type replaces the placeholder rather than double-counting.
  function deriveShots() {
    var h = stats.home.shots, a = stats.away.shots;
    h.total = 0; h.onTarget = 0; h.offTarget = 0; h.blocked = 0; h.woodwork = 0;
    a.total = 0; a.onTarget = 0; a.offTarget = 0; a.blocked = 0; a.woodwork = 0;
    for (var id in shotById) { var s = shotById[id], sd = sideOf(s.side); if (!sd) continue; sd.shots.total++; if (s.oc) sd.shots[s.oc]++; }
  }
  function deriveFreeKicks() {
    stats.home.freeKicks = 0; stats.away.freeKicks = 0;
    stats.home.offsides = 0; stats.away.offsides = 0;   // 0 is honest once play is under way
    for (var id in fkById) { var f = fkById[id], sd = sideOf(f.side); if (!sd) continue; sd.freeKicks++; if (f.type === 'offside') sd.offsides++; }
  }

  function onLedgerEvent(ev) {
    var k = ev.kind, side = ev.side, id = ev.id, d = (ev.detail || '').toLowerCase();
    // upgradeable events keyed by id — the confirmed re-emit carries the outcome/type
    if (k === 'shot') { if (side && id) { shotById[id] = { side: side, oc: shotBucket(d) }; deriveShots(); } return; }
    if (k === 'free-kick') { if (side && id) { fkById[id] = { side: side, type: d }; deriveFreeKicks(); } return; }
    // count-once events
    var sd = sideOf(side); if (!sd) return;
    if (id && seen[id] && k !== 'goal') return;
    switch (k) {
      case 'corner': if (id) seen[id] = true; sd.corners++; break;
      case 'yellow-card': if (id) seen[id] = true; sd.cards.yellow++; break;
      case 'red-card': if (id) seen[id] = true; sd.cards.red++; break;
      case 'var': if (id && !seen['V' + id]) { seen['V' + id] = true; sd.varReviews++; } break;
      case 'goal': if (ev.confirmed && id && !seen['G' + id]) { seen['G' + id] = true; sd.goals++; } break;
      case 'danger': {
        if (id) seen[id] = true;
        var high = d.indexOf('high') >= 0;
        if (high) sd.attacks.highDanger++; else sd.attacks.danger++;
        terr[side] += high ? PRESS['high-danger'] : PRESS.danger;
        break;
      }
      default: break;
    }
  }

  function recomputeTerritory() {
    var tot = terr.home + terr.away;
    if (tot > 0) { stats.home.territory = terr.home / tot; stats.away.territory = terr.away / tot; }
  }

  // possession % = time-share of the possession-holder, integrated over the match
  // clock. Every possession phase counts (the side has the ball); danger/high also
  // feed the territory proxy, unchanged. Gaps/half-resets (>120s or negative) skipped.
  function onPossession(sp) {
    if (!sp || !sp.side) return;
    if (PRESS[sp.kind] != null) terr[sp.side] += PRESS[sp.kind];
    var c = sp.clockSeconds;
    if (typeof c === 'number') {
      if (possLast) { var dd = c - possLast.c; if (dd > 0 && dd < 120) possTime[possLast.side] += dd; }
      possLast = { side: sp.side, c: c };
      var tot = possTime.home + possTime.away;
      if (tot > 0) {
        stats.home.possessionPct = Math.round(100 * possTime.home / tot);
        stats.away.possessionPct = 100 - stats.home.possessionPct;
      }
    }
    recomputeTerritory();
  }

  function onFeed(msg) {
    switch (msg.type) {
      case 'status': if (msg.ev && typeof msg.ev.minute === 'number') stats.minute = msg.ev.minute; emit(); break;
      case 'score': if (msg.ev && typeof msg.ev.minute === 'number') stats.minute = msg.ev.minute; emit(); break;
      case 'ledger':
        if (msg.msg && msg.msg.type === 'event') { onLedgerEvent(msg.msg.ev); recomputeTerritory(); emit(); }
        break;
      case 'spell': onPossession(msg.spell); emit(); break;
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
