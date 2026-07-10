/*
 * ROOOT — LOOM TAPE (loom lane): plays a baked window.MATCH bundle through the
 * LIVE contract (window.__loom) exactly as the wire adapter would — clock, odds,
 * pressure, events, score, phases, FULL_TIME — so the live weave is developed and
 * gated against a real recorded match (ARG–CPV 3–2) with no vacuum and no wire.
 *
 *   woven-loom.html?tape=1        → play at TAPE speed (default 1.6 match-min / real s)
 *   &tapespeed=<minPerSec>        → override the speed
 *   &tapeuntil=<minute>           → hold the tape at a minute (dev: park a state for the eye)
 *
 * Honesty: this is a TAPE — it declares __loom.mode('replay'); the masthead says
 * REPLAY, and the seal still fires because FULL_TIME comes from the (played) wire,
 * exactly as it will on match night. Free kicks weave only when the bundle marked
 * them Danger — the same led-to-danger curation the live adapter applies.
 */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  if (q.get('tape') !== '1') return;
  if (q.get('demo') === '1') { console.warn('[loom-tape] demo=1 also present — the tape yields to the demo feed'); return; }
  var R = window.MATCH, L = window.__loom;
  if (!R || !L) return;
  var SPEED = parseFloat(q.get('tapespeed')) || 1.6; // match-minutes per real second
  var UNTIL = q.get('tapeuntil') ? parseFloat(q.get('tapeuntil')) : null;
  var DUR = R.durationMin || 123;
  window.__loomTape = { matchId: q.get('match') || 'arg-cpv', speed: SPEED };

  L.live();
  L.mode('replay');
  L.teams({ tri: R.home.tri, name: R.home.name, primary: R.home.ink },
          { tri: R.away.tri, name: R.away.name, primary: R.away.ink });

  // the bundle speaks the loom alphabet; the wire speaks kinds — translate back so
  // the tape exercises the REAL __loom.event → mapKind path, not a shortcut
  function wireEv(e, id) {
    var side = e.s === 'h' ? 1 : e.s === 'a' ? 2 : 0, t = e.t;
    if (t === 'goal') return { minute: e.m, kind: 'goal', side: side, id: id };
    if (t === 'save') return { minute: e.m, kind: 'shot', type: 'ontarget', side: side, id: id };
    if (t === 'block') return { minute: e.m, kind: 'shot', type: 'blocked', side: side, id: id };
    if (t === 'miss') return { minute: e.m, kind: 'shot', type: 'offtarget', side: side, id: id };
    if (t === 'wood') return { minute: e.m, kind: 'shot', type: 'woodwork', side: side, id: id };
    if (t === 'yc') return { minute: e.m, kind: 'card', type: 'yellow', side: side, id: id };
    if (t === 'rc') return { minute: e.m, kind: 'card', type: 'red', side: side, id: id };
    if (t === 'corner') return { minute: e.m, kind: 'corner', side: side, id: id };
    if (t === 'sub') return { minute: e.m, kind: 'sub', side: side, id: id };
    if (t === 'injury') return { minute: e.m, kind: 'injury', side: side, id: id };
    if (t === 'offside') return { minute: e.m, kind: 'freekick', type: 'offside', side: side, id: id };
    if (t === 'freekick') return e.ft === 'Danger' ? { minute: e.m, kind: 'freekick', side: side, id: id } : null;
    if (t === 'var') return { minute: e.m, kind: 'var', id: id };
    return null;
  }

  var bi = 0, di = 0, pi = 0, ei = 0, gh = 0, ga = 0, phaseET = false, done = false;
  L.clock(0, true);
  var t0 = Date.now();
  var timer = setInterval(function () {
    if (done) return;
    var m = ((Date.now() - t0) / 1000) * SPEED;
    if (UNTIL != null && m >= UNTIL) m = UNTIL; // hold for the eye
    if (m >= DUR) m = DUR;
    L.clock(m, true);
    while (bi < R.belief.length && R.belief[bi][0] <= m) { var b = R.belief[bi++]; L.odds({ minute: b[0], pHome: b[1] / 100, pDraw: b[2] / 100, pAway: b[3] / 100 }); }
    while (di < R.danger.length && R.danger[di][0] <= m) { var d = R.danger[di++]; L.pressure(d[0], 1, +(d[1] * 2).toFixed(3)); L.pressure(d[0], 2, +((1 - d[1]) * 2).toFixed(3)); }
    while (pi < R.poss.length && R.poss[pi][0] <= m) { var ps = R.poss[pi++]; L.possession(ps[0], 1, +(ps[1] * 2).toFixed(3)); L.possession(ps[0], 2, +((1 - ps[1]) * 2).toFixed(3)); }
    while (ei < R.events.length && R.events[ei].m <= m) { var e = R.events[ei], w = wireEv(e, 'tape-' + ei); ei++;
      if (w) { L.event(w); if (w.kind === 'goal') { if (w.side === 1) gh++; else ga++; L.score(gh, ga); } } }
    if (!phaseET && m >= 97) { phaseET = true; L.phase({ phase: 'EXTRA_TIME', running: true, minute: m }); }
    if (m >= DUR && !(UNTIL != null && UNTIL < DUR)) {
      done = true; clearInterval(timer);
      L.score(R.score[0], R.score[1]);
      L.phase({ phase: 'FULL_TIME', running: false, minute: DUR });
    }
  }, 100);
})();
