/*
 * ROOOT — STATS ADAPTER (coordinator lane: wire → window.__stats).
 *
 * Derives a live per-side MATCH STATS aggregate from the same stands WebSocket
 * feed the loom rides (contracts/stats.ts is the schema; design/BRIEF-STATS.md is
 * the brief). Design reads window.__stats and subscribes via
 * window.__statsAdapter.onStats(cb).
 *
 * Honesty: everything is REAL off the wire. Counts are counts — every rate is
 * derived from them (never served/faked). possession % is a computed time-share,
 * gated (withheld until trustworthy). territory is an attacking-pressure PROXY.
 *
 * Legend fully resolved (Jul 6): possession/shots/offsides/fouls are score EVENTS,
 * not the numeric Stats block. Families (Jul 7): shots-by-outcome · corners · cards
 * · fouls · offsides · possession % · territory · danger · subs · injuries ·
 * penalties · scorer+type (per side, named via the wire roster) · a MATCH-LEVEL var
 * block (VAR carries no side). Names come from the server's lineups roster.
 *
 * Opt-in: ?statsfeed=1, or wherever the fan experience runs (/, /live,
 * /count-live.html, /stadium.html, ?loomfeed=1, ?site=1). Match via ?match=<id>.
 */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  // NB: production serves clean URLs (cleanUrls) — the path is '/stadium', not
  // '/stadium.html'. Match by substring so BOTH the clean route and the .html file
  // (preview / direct open) activate the adapter. Exact '.html' checks silently
  // failed on prod → stadium + count-live showed the fallback, never live (Jul 7).
  var p = location.pathname;
  var ON = p === '/' || p === '/live'
    || p.indexOf('/count-live') >= 0 || p.indexOf('/count') >= 0 || p.indexOf('/stadium') >= 0
    || q.get('site') === '1' || q.get('loomfeed') === '1' || q.get('statsfeed') === '1' || q.get('demo') === '1';
  if (!ON) return;
  var matchId = q.get('match') || '18202783'; // SUI–COL default (live now). MUST match stadium's FIX default. TODO(P2): dynamic default so /stadium + /count auto-follow the live game.
  var wsBase = q.get('ws') || 'wss://rooot-stands.fly.dev/';

  // PRESS weights (match the loom) — for the TERRITORY proxy (danger-weighted).
  var PRESS = { safe: 0.3, possession: 0.5, attack: 1, danger: 1.5, 'high-danger': 2 };

  function emptySide() {
    return { shots: { total: 0, onTarget: 0, offTarget: 0, blocked: 0, woodwork: 0 },
      corners: 0, freeKicks: 0, throwIns: 0, cards: { yellow: 0, red: 0, list: [] }, goals: 0,
      attacks: { danger: 0, highDanger: 0 }, territory: 0.5,
      possessionPct: null, fouls: null, offsides: null,
      subs: { count: 0, moves: [] }, injuries: { count: 0, list: [] },
      penalties: { scored: 0, missed: 0, retake: 0, list: [] }, scorers: [], varReviews: 0 };
  }
  var stats = { minute: null, home: emptySide(), away: emptySide(), var: [], pending: [], lineups: null };
  var terr = { home: 0, away: 0 };  // weighted attacking pressure per side → territory
  var seen = {};                    // count-once dedup (corners/cards/danger)
  var shotById = {}, fkById = {};   // upgradeable side events (outcome/type lands on confirm)
  var subById = {}, injuryById = {}, penById = {}, scorerById = {};
  var cardById = {}, throwById = {};  // cards upgrade (name lands late); throws dedup by id
  var varList = [], varSeen = {}, lastVarType = null; // match-level VAR (no side): pair each decision with the preceding open's type
  var possLast = null;              // {side, c} — last possession-holder + clock second
  var possTime = { home: 0, away: 0 };
  var cbs = [];
  window.__stats = stats;
  window.__statsAdapter = { stats: stats, matchId: matchId, onStats: function (cb) { cbs.push(cb); if (typeof cb === 'function') try { cb(stats); } catch (e) {} } };
  function emit() { for (var i = 0; i < cbs.length; i++) { try { cbs[i](stats); } catch (e) {} } }

  function sideOf(s) { return s === 'home' ? stats.home : s === 'away' ? stats.away : null; }

  // shot Data.Outcome (lowercased) → the bucket; null while still unconfirmed.
  function shotBucket(d) {
    if (d === 'ontarget' || d === 'scored') return 'onTarget';
    if (d === 'offtarget' || d === 'missed') return 'offTarget';
    if (d === 'blocked') return 'blocked';
    if (d === 'woodwork' || d.indexOf('post') >= 0 || d.indexOf('bar') >= 0) return 'woodwork';
    return null;
  }

  // Events re-emit (unconfirmed → confirmed); each family recounts from its id-map
  // so the confirmed detail replaces the placeholder rather than double-counting.
  function deriveShots() {
    var h = stats.home.shots, a = stats.away.shots;
    h.total = 0; h.onTarget = 0; h.offTarget = 0; h.blocked = 0; h.woodwork = 0;
    a.total = 0; a.onTarget = 0; a.offTarget = 0; a.blocked = 0; a.woodwork = 0;
    for (var id in shotById) { var s = shotById[id], sd = sideOf(s.side); if (!sd) continue; sd.shots.total++; if (s.oc) sd.shots[s.oc]++; }
  }
  function deriveFreeKicks() {
    stats.home.freeKicks = 0; stats.away.freeKicks = 0;
    stats.home.offsides = 0; stats.away.offsides = 0;
    stats.home.fouls = 0; stats.away.fouls = 0;
    for (var id in fkById) {
      var f = fkById[id], sd = sideOf(f.side); if (!sd) continue;
      sd.freeKicks++;
      if (f.type === 'offside') sd.offsides++;
      else if (f.type) sd.fouls++; // any non-Offside FreeKickType == a foul (TxODDS Jul 6)
    }
  }
  function deriveSubs() {
    stats.home.subs = { count: 0, moves: [] }; stats.away.subs = { count: 0, moves: [] };
    for (var id in subById) { var s = subById[id], sd = sideOf(s.side); if (!sd) continue; sd.subs.count++; sd.subs.moves.push({ inName: s.inName, outName: s.outName, minute: s.minute }); }
  }
  function deriveInjuries() {
    stats.home.injuries = { count: 0, list: [] }; stats.away.injuries = { count: 0, list: [] };
    for (var id in injuryById) { var x = injuryById[id], sd = sideOf(x.side); if (!sd) continue; sd.injuries.count++; sd.injuries.list.push({ player: x.player, outcome: x.outcome, minute: x.minute }); }
  }
  function derivePens() {
    stats.home.penalties = { scored: 0, missed: 0, retake: 0, list: [] };
    stats.away.penalties = { scored: 0, missed: 0, retake: 0, list: [] };
    for (var id in penById) { var p = penById[id], sd = sideOf(p.side); if (!sd) continue;
      var o = (p.outcome || '').toLowerCase();
      if (o.indexOf('scored') >= 0) sd.penalties.scored++;
      else if (o.indexOf('miss') >= 0) sd.penalties.missed++;
      else if (o.indexOf('retake') >= 0) sd.penalties.retake++;
      sd.penalties.list.push({ taker: p.taker || null, outcome: p.outcome || null, minute: p.minute }); }
  }
  function deriveScorers() {
    stats.home.scorers = []; stats.away.scorers = [];
    for (var id in scorerById) { var g = scorerById[id], sd = sideOf(g.side); if (!sd) continue; sd.scorers.push({ name: g.name, type: g.type, minute: g.minute }); }
  }
  // cards re-emit (empty → PlayerId) under a stable id — recount + rebuild the who/when list
  // from the id-map so a late name upgrades in place (never double-counts a re-emit).
  function deriveCards() {
    stats.home.cards = { yellow: 0, red: 0, list: [] }; stats.away.cards = { yellow: 0, red: 0, list: [] };
    for (var id in cardById) { var c = cardById[id], sd = sideOf(c.side); if (!sd) continue;
      if (c.type === 'Red') sd.cards.red++; else sd.cards.yellow++;
      sd.cards.list.push({ player: c.player, type: c.type, minute: c.minute }); }
    stats.home.cards.list.sort(byMinute); stats.away.cards.list.sort(byMinute);
  }
  // throw_in re-emits (empty → ThrowInType) under a stable id — count DISTINCT ids per side.
  function deriveThrows() {
    stats.home.throwIns = 0; stats.away.throwIns = 0;
    for (var id in throwById) { var sd = sideOf(throwById[id]); if (sd) sd.throwIns++; }
  }
  function byMinute(x, y) { return (x.minute == null ? 1e9 : x.minute) - (y.minute == null ? 1e9 : y.minute); }
  // (VAR aggregation is inline in onLedgerEvent's 'var' case — open + decision can share an id.)

  function onLedgerEvent(ev) {
    var k = ev.kind, side = ev.side, id = ev.id, d = (ev.detail || '').toLowerCase();
    var D = (ev.raw && ev.raw.Data) || {};              // the raw envelope's Data (Type/Outcome/…)
    var mn = (typeof ev.minute === 'number') ? ev.minute : stats.minute;
    // keep the stadium minute live through play (shots/danger are frequent), but NEVER
    // from warmup/standby tunnel chatter pre-kickoff — that would fabricate a minute the
    // same way the loom's phantom did. Monotonic so out-of-order re-emits can't rewind it.
    if (typeof ev.minute === 'number' && k !== 'warmup' && (stats.minute == null || ev.minute >= stats.minute)) stats.minute = ev.minute;

    // MATCH-LEVEL: VAR (the wire gives no side)
    if (k === 'var') {
      // match-level (no side). 'var' opens with Data.Type; 'var_end' decides with
      // Data.Outcome (Stands/Overturned). Open + decision can share an id, so pair by
      // proximity: hold the open's type, attach it to the next decision. Dedup decisions by id.
      if (D.Outcome) { if (id && !varSeen[id]) { varSeen[id] = true; varList.push({ type: lastVarType, outcome: D.Outcome, minute: mn }); lastVarType = null; } }
      else if (D.Type) { lastVarType = D.Type; }
      stats.var = varList; stats.home.varReviews = varList.length; stats.away.varReviews = 0;
      return;
    }
    // upgradeable side events keyed by id — the confirmed re-emit upgrades in place
    if (k === 'shot') { if (side && id) { shotById[id] = { side: side, oc: shotBucket(d) }; deriveShots(); } return; }
    if (k === 'free-kick') { if (side && id) { fkById[id] = { side: side, type: d }; deriveFreeKicks(); } return; }
    if (k === 'substitution') { if (side && id) { var pr = (ev.detail || '').split('|'); subById[id] = { side: side, inName: pr[0] || null, outName: pr[1] || null, minute: mn }; deriveSubs(); } return; }
    if (k === 'injury') { if (side && id) { injuryById[id] = { side: side, player: ev.detail || null, outcome: D.Outcome || null, minute: mn }; deriveInjuries(); } return; }
    if (k === 'penalty-kick') { if (side && id) { penById[id] = { side: side, outcome: (ev.detail || D.Outcome || null), minute: mn }; derivePens(); } return; }
    // cards: keyed by id so the late name-carrying re-emit upgrades in place; keep a name
    // already resolved if a later empty re-emit arrives (empty ≠ erase). Never count-once.
    if (k === 'yellow-card' || k === 'red-card') { if (side && id) { var pc = cardById[id]; cardById[id] = { side: side, type: (k === 'red-card' ? 'Red' : 'Yellow'), player: (ev.detail || (pc && pc.player) || null), minute: mn }; deriveCards(); } return; }
    if (k === 'throw-in') { if (side && id) { throwById[id] = side; deriveThrows(); } return; }

    // count-once + scorer
    var sd = sideOf(side); if (!sd) return;
    if (id && seen[id] && k !== 'goal') return;
    switch (k) {
      case 'corner': if (id) seen[id] = true; sd.corners++; break;
      // cards + throw-ins are handled id-keyed above (they re-emit; the name lands late)
      case 'goal': // the SCORE number is the authoritative 'score' message; here we keep the scorer + type
        if (side && id && ev.confirmed) { scorerById[id] = { side: side, name: ev.detail || null, type: ev.goalKind || null, minute: mn }; deriveScorers(); }
        break;
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

  // possession % = time-share of the possession-holder over the match clock, honestly
  // gated (see comment) so a fresh join never shows a false 100/0.
  function onPossession(sp) {
    if (!sp || !sp.side) return;
    if (PRESS[sp.kind] != null) terr[sp.side] += PRESS[sp.kind];
    var c = sp.clockSeconds;
    if (typeof c === 'number') {
      if (possLast) { var dd = c - possLast.c; if (dd > 0 && dd < 120) possTime[possLast.side] += dd; }
      possLast = { side: sp.side, c: c };
      var tot = possTime.home + possTime.away;
      if (tot >= 90 && possTime.home > 0 && possTime.away > 0) {
        stats.home.possessionPct = Math.round(100 * possTime.home / tot);
        stats.away.possessionPct = 100 - stats.home.possessionPct;
      }
    }
    recomputeTerritory();
  }

  function onFeed(msg) {
    switch (msg.type) {
      case 'status': if (msg.ev && typeof msg.ev.minute === 'number') stats.minute = msg.ev.minute; emit(); break;
      case 'score':
        if (msg.ev) {
          if (typeof msg.ev.minute === 'number') stats.minute = msg.ev.minute;
          // authoritative score (Score.Total.Goals) — correct on ANY join.
          if (typeof msg.ev.home === 'number') stats.home.goals = msg.ev.home;
          if (typeof msg.ev.away === 'number') stats.away.goals = msg.ev.away;
        }
        emit(); break;
      case 'ledger':
        if (msg.msg && msg.msg.type === 'event') { onLedgerEvent(msg.msg.ev); recomputeTerritory(); emit(); }
        break;
      case 'spell': onPossession(msg.spell); emit(); break;
      case 'lineup': if (msg.lineup) { stats.lineups = msg.lineup; emit(); } break;   // the starting XI, before a ball is kicked
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
  // under ?demo=1 with no explicit ?ws, feed the stadium's stat cards from the baked
  // serverless feed (demo-feed.js) instead of the live WebSocket.
  if (q.get('demo') === '1' && !q.get('ws') && window.__demoFeed) {
    window.__demoFeed.start(function (m) { try { onFeed(m); } catch (err) { console.warn('[stats-adapter] translate error', err); } });
  } else {
    connect();
  }
})();
