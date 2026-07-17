/*
 * ROOOT — MATCHDAY (coordinator lane: manifest -> window.__matchday).
 *
 * The one clock for the whole site. fixture.json carries the matchday schedule
 * (fixtures[] — sealed matches + the ones still to come); this module derives a
 * phase for each and picks the fixture the experience centers on. Every surface
 * reads posture from here — nothing hardcodes a kickoff string or decides
 * "live" on its own. That is the law this module exists to enforce: all cards
 * agree, always.
 *
 * Phases, per fixture:
 *   UPCOMING    now < gates (kickoff − gatesOpenMinutes)
 *   GATES_OPEN  gates ≤ now < kickoff
 *   LIVE        kickoff ≤ now, not sealed (a live surface may flip it done
 *               early via markDone when the wire whistles full time)
 *   FULL_TIME   sealed in the manifest (fx.sealed=true, has finalScore/replay),
 *               or LIVE aged past kickoff+210min (certainly over; sealed=false
 *               until the bake lands — surfaces say full time, no fake stats)
 *
 * current = first LIVE, else first GATES_OPEN, else next UPCOMING, else last
 * sealed. Re-evaluated every 30s and on visibilitychange; subscribers fire only
 * when something actually changed.
 *
 * Honesty: phases derive from the manifest's wire-pulled kickoffs and the
 * feed's own full-time — never invented, never "TONIGHT" on a dead fixture.
 */
(function () {
  'use strict';

  var GRACE_MS = 210 * 60000; // kickoff + 3.5h: no football runs longer — over, even unsealed

  // dev-only: ?mdnow=<ISO> pins this page's clock so any posture can be seen and
  // screenshotted before it happens for real. Affects nothing but this viewer.
  var NOW_PIN = (function () {
    try { return Date.parse(new URLSearchParams(location.search).get('mdnow') || '') || null; } catch (e) { return null; }
  })();
  function nowMs() { return NOW_PIN || Date.now(); }

  window.__fixtureReady = window.__fixtureReady || fetch('/fixture.json')
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });

  var md = {
    fixtures: [],
    current: null,
    next: null,
    lastSealed: null,
    ready: null,
    phaseOf: function (id) { var f = md.get(id); return f ? f.phase : null; },
    get: function (id) {
      for (var i = 0; i < md.fixtures.length; i++) if (md.fixtures[i].matchId === String(id)) return md.fixtures[i];
      return null;
    },
    markDone: function (id) { doneIds[String(id)] = true; evaluate(); },
    on: function (fn) { subs.push(fn); if (evaluated) fn(md); return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
    // one voice for kickoff copy everywhere: viewer's local clock, weekday when not today
    kickLabel: function (fx) {
      if (!fx || !fx.kickoffUtc) return '';
      var d = new Date(fx.kickoffUtc), now = new Date(nowMs());
      var hhmm = two(d.getHours()) + ':' + two(d.getMinutes());
      var today = d.toDateString() === now.toDateString();
      var day = today ? 'TONIGHT' : ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getDay()];
      return day + ' ' + hhmm;
    },
    gatesLabel: function (fx) {
      if (!fx || !fx.kickoffUtc) return '';
      var g = new Date(gatesMs(fx));
      return two(g.getHours()) + ':' + two(g.getMinutes());
    }
  };

  var subs = [];
  var doneIds = {};
  var evaluated = false;
  var lastSig = '';
  var manifest = null;

  function two(n) { return (n < 10 ? '0' : '') + n; }

  function gatesMs(fx) {
    var mins = (manifest && manifest.gatesOpenMinutes) || 30;
    return Date.parse(fx.kickoffUtc) - mins * 60000;
  }

  function phaseFor(fx, now) {
    if (fx.status === 'sealed') return 'FULL_TIME';
    if (doneIds[fx.matchId]) return 'FULL_TIME';
    var kick = Date.parse(fx.kickoffUtc);
    if (!isFinite(kick)) return 'UPCOMING';
    if (now < gatesMs(fx)) return 'UPCOMING';
    if (now < kick) return 'GATES_OPEN';
    if (now > kick + GRACE_MS) return 'FULL_TIME';
    return 'LIVE';
  }

  function evaluate() {
    if (!manifest) return;
    var now = nowMs();
    var list = manifest.fixtures && manifest.fixtures.length ? manifest.fixtures
      // legacy manifest (no fixtures[]) — one entry from the top-level pin, sealed unknown
      : [{ matchId: manifest.matchId, home: manifest.home, away: manifest.away, kickoffUtc: manifest.kickoffUtc, stage: null, status: 'sealed', replay: true }];

    md.fixtures = list.map(function (f) {
      var fx = Object.assign({}, f);
      fx.matchId = String(fx.matchId);
      fx.phase = phaseFor(fx, now);
      fx.sealed = fx.status === 'sealed';
      return fx;
    });

    var live = null, gates = null, upcoming = null, sealed = null;
    md.fixtures.forEach(function (fx) {
      if (fx.phase === 'LIVE' && !live) live = fx;
      if (fx.phase === 'GATES_OPEN' && !gates) gates = fx;
      if (fx.phase === 'UPCOMING' && !upcoming) upcoming = fx; // manifest is kickoff-ordered
      if (fx.sealed) sealed = fx;                              // last sealed wins
    });
    md.next = upcoming;
    md.lastSealed = sealed;
    md.current = live || gates || upcoming || sealed || md.fixtures[0] || null;

    evaluated = true;
    var sig = md.fixtures.map(function (f) { return f.matchId + ':' + f.phase; }).join('|') + '@' + (md.current ? md.current.matchId : '');
    if (sig !== lastSig) {
      lastSig = sig;
      subs.forEach(function (fn) { try { fn(md); } catch (e) {} });
    }
  }

  md.ready = window.__fixtureReady.then(function (fx) { manifest = fx; evaluate(); return md; });

  setInterval(evaluate, 30000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) evaluate(); });

  window.__matchday = md;
})();
