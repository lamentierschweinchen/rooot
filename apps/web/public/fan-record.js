/*
 * ROOOT — FAN RECORD (coordinator lane: localStorage -> window.__myRecord).
 *
 * One reader for the fan's own paper trail, so every surface counts the same
 * things the same way. The writes stay where they are (the gate stamps
 * rooot.pass, the ground appends rooot.calls.<id>, full time writes
 * rooot.kept.<id> + rooot.cloth.<id>) — this module only reads, reconciles,
 * and totals. The cabinet's tiles, the full-time card, and the ground header
 * all call here instead of each doing their own arithmetic; that is how
 * "1 MATCHES LIVED · 0 PREDICTIONS" beside a card that knows your 0–2 dies.
 *
 * A prediction counts if the fan stamped one anywhere: kept.pred (sealed at
 * full time) OR a gate pass for that match. Exact needs a final score — from
 * the kept record, or the matchday manifest for a sealed fixture the pass
 * pointed at. Real records only; nothing is invented.
 */
(function () {
  'use strict';

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function readPrefix(prefix) {
    var out = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf(prefix) === 0) {
        var v = readJSON(k);
        if (v) { v.__id = k.slice(prefix.length); out.push(v); }
      }
    }
    return out;
  }

  // the manifest's sealed finals, when matchday is on the page — for scoring a
  // pass whose match sealed before a kept record was written
  function sealedFinal(matchId) {
    var mdy = window.__matchday;
    var fx = mdy && mdy.get && mdy.get(matchId);
    if (fx && fx.sealed && fx.finalScore) return { h: fx.finalScore.home, a: fx.finalScore.away };
    return null;
  }

  function passPred(pass) {
    if (!pass || !pass.call) return null;
    var c = pass.call;
    if (typeof c.h === 'number' && typeof c.a === 'number') return { h: c.h, a: c.a };
    if (Array.isArray(c) && c.length === 2) return { h: +c[0], a: +c[1] };
    return null;
  }

  function forMatch(matchId) {
    var id = String(matchId);
    var pass = readJSON('rooot.pass');
    if (pass && String(pass.matchId) !== id) pass = null;
    return {
      pass: pass,
      calls: readJSON('rooot.calls.' + id) || [],
      kept: readJSON('rooot.kept.' + id),
      cloth: readJSON('rooot.cloth.' + id)
    };
  }

  function totals() {
    var kepts = readPrefix('rooot.kept.');
    var cloths = readPrefix('rooot.cloth.');
    var pass = readJSON('rooot.pass');

    var ids = {};
    kepts.forEach(function (k) { ids[String(k.matchId || k.__id)] = 1; });
    cloths.forEach(function (c) { ids[String(c.fx || c.__id)] = 1; });
    var lived = Object.keys(ids).length;

    // predictions: one per match that has a stamped call anywhere
    var predIds = {};
    var exact = 0;
    kepts.forEach(function (k) {
      var id = String(k.matchId || k.__id);
      var pred = k.pred || null;
      if (!pred && pass && String(pass.matchId) === id) pred = passPred(pass);
      if (!pred) return;
      predIds[id] = 1;
      var fin = k.final || sealedFinal(id);
      if (fin && pred.h === fin.h && pred.a === fin.a) exact++;
    });
    // a pass for a match with no kept record yet still counts as a prediction
    if (pass && passPred(pass) && !predIds[String(pass.matchId)]) {
      var pid = String(pass.matchId);
      if (ids[pid] || true) predIds[pid] = 1; // stamped is stamped, lived or not
      var fin2 = sealedFinal(pid);
      var pp = passPred(pass);
      if (fin2 && pp && pp.h === fin2.h && pp.a === fin2.a) exact++;
    }

    return { lived: lived, predictions: Object.keys(predIds).length, exact: exact, loudestNight: null };
  }

  // ── points — ONE formula for every surface (owner, 17 Jul: interacting must earn).
  // Everything scores off recorded real taps; the confidence dial multiplies what the
  // prediction wins at full time — how sure you were is finally worth something.
  var CONV_MULT = [1, 1, 1.25, 1.5, 2]; // index by conv 1..4 (0 = no dial set)
  function score(parts) {
    var p = 0;
    if (parts.pred) p += 25;                       // stamped a side and a score at the gate
    p += Math.min(parts.cheers || 0, 300);         // every cheer (capped for sanity)
    p += (parts.reacts || 0) * 2;                  // every reaction
    p += Math.min(parts.mins || 0, 130);           // every minute watched
    if (parts.pred && parts.final) {
      var m = CONV_MULT[parts.conv] || 1;
      if (parts.pred.h === parts.final.h && parts.pred.a === parts.final.a) p += Math.round(200 * m);
      else if (Math.sign(parts.pred.h - parts.pred.a) === Math.sign(parts.final.h - parts.final.a)) p += Math.round(75 * m);
    }
    return Math.round(p);
  }
  function pointsFor(matchId) {
    var r = forMatch(matchId), k = r.kept || {};
    var pred = k.pred || passPred(r.pass);
    var reacts = 0; if (k.reacts) for (var t in k.reacts) reacts += k.reacts[t] || 0;
    var fin = k.final || sealedFinal(matchId);
    return score({ pred: pred, cheers: k.cheers || 0, reacts: reacts, mins: k.mins || 0, final: fin, conv: (r.pass && r.pass.conv) || 0 });
  }

  var subs = [];
  window.addEventListener('storage', function (e) {
    var k = (e && e.key) || '';
    if (k === 'rooot.pass' || k.indexOf('rooot.calls.') === 0 || k.indexOf('rooot.kept.') === 0 || k.indexOf('rooot.cloth.') === 0) {
      subs.forEach(function (fn) { try { fn(); } catch (err) {} });
    }
  });

  window.__myRecord = {
    forMatch: forMatch,
    totals: totals,
    score: score,
    pointsFor: pointsFor,
    on: function (fn) { subs.push(fn); return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; }
  };
})();
