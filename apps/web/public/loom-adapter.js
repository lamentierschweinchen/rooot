/*
 * ROOOT — LOOM WIRE ADAPTER (coordinator lane: wire → window.__loom).
 *
 * The design lane owns the loom internals (loom-proto.html defines window.__loom).
 * This file owns ONLY the translation from the live feed to that API. It does no
 * parsing — the stands service parses TxLINE with the frozen contracts/normalize
 * parsers and fans typed FeedMsgs over WebSocket; we translate FeedMsg → __loom.
 *
 * Opt-in via query params (no params → loom stays in its self-contained proto):
 *   ?loomfeed=1&match=<fixtureId>[&ws=<wsBase>]
 *   ws default: wss://rooot-stands.fly.dev/   (dry-run: ws=ws://localhost:9099)
 *
 * Honesty (owner's brief): market ≠ crowd (crowd selvages stay specimen — we
 * push none); push only what the wire says; never synthesize between real ticks;
 * on suspension the parser drops the tick so we simply don't push odds; on the
 * 90'-level settlement the full 1X2 dies (ET ticks arrive as period 'et') and we
 * stop pushing → the loom greys the belief honestly.
 */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  // Activate on the explicit dev opt-in (?loomfeed=1) OR the clean live front
  // door (rooot.club / /live, served by a rewrite). Direct /loom-proto stays
  // the self-contained demo — untouched.
  var SITE = location.pathname === '/' || location.pathname === '/live' || q.get('site') === '1';
  if (q.get('loomfeed') !== '1' && !SITE) return;
  var matchId = q.get('match') || '18198205'; // POR–ESP default (tonight's fixture)
  var wsBase = q.get('ws') || 'wss://rooot-stands.fly.dev/';

  function waitForLoom(cb) {
    if (window.__loom && typeof window.__loom.live === 'function') return cb();
    setTimeout(function () { waitForLoom(cb); }, 60);
  }

  // side: contracts return 'home'|'away' (already latched via participant1IsHome);
  // the loom wants 1=home/left, 2=away/right.
  function sideNum(s) { return s === 'home' ? 1 : s === 'away' ? 2 : 0; }

  // pressure weight per possession grade (owner's brief).
  var PRESS = { safe: 0.3, possession: 0.5, attack: 1, danger: 1.5, 'high-danger': 2 };
  // ledger goalKind (Shot|Head|Own) → loom event type (shot|head|own).
  function goalType(gk) { return gk === 'Head' ? 'head' : gk === 'Own' ? 'own' : 'shot'; }

  waitForLoom(function () {
    var L = window.__loom;
    L.live();

    var minute = 0;            // current match minute (decimal), the live edge
    var etPhase = false;       // true once EXTRA_TIME/PENALTIES — full 1X2 is dead
    var firedGoals = {};       // ledger goal id → true (fire the weave ONCE)
    var firedVars = {};        // VAR review id → true — ONE mark per review, not per envelope
    var wove = { 1: 0, 2: 0 }; // goals actually woven per side — for chalk-off reconciliation
    var report = { odds: 0, spell: 0, event: 0, goal: 0, chalked: 0, pressure: 0, score: '0-0' };
    window.__loomAdapter = { report: report, matchId: matchId };

    function setClock(mDec, running) {
      if (typeof mDec !== 'number' || !isFinite(mDec) || mDec < 0) return;
      if (mDec >= minute) { minute = mDec; L.clock(mDec, !!running); }
    }

    // THE MATCH CLOCK ticks locally between the wire's sparse updates (task #7).
    // The wire sends a minute only on status changes + goals; a 0-0 opening has
    // neither, so the loom froze at 0' while MEX-ENG was 7' live. We extrapolate
    // from the last KNOWN minute + running state, resynced whenever the wire
    // speaks (status/score/any ledger event carries a real match minute).
    // The wire's Clock.Seconds is MONOTONIC — it counts to 45'/90'/105'/120',
    // then CAPS and HOLDS there (Running:false) through stoppage + the break,
    // then continues in the next phase. So: RESPECT the wire's Running flag
    // (freeze at the cap + at half-time). The old code inferred "running" from
    // the phase and kept extrapolating past 45' through the break, overshot, then
    // JUMPED on resume with a stale timestamp — the hang after halftime. We also
    // never extrapolate more than a small cap past the last sync (a quiet wire
    // can't run away either). running=undefined advances the minute, keeps state.
    var clkBaseMin = 0, clkBaseMs = Date.now(), clkRunning = false;
    var CLK_STALL_CAP = 2.5; // minutes we'll tick past the last wire sync, max
    function syncClock(matchMinute, running, atMs) {
      if (running !== undefined && running !== null) clkRunning = !!running;
      if (typeof matchMinute === 'number' && isFinite(matchMinute) && matchMinute >= clkBaseMin - 0.05) {
        clkBaseMin = matchMinute;
        clkBaseMs = atMs || Date.now();
        setClock(matchMinute, clkRunning);
      }
    }
    var clkTimer = setInterval(function () {
      if (!clkRunning) return;
      setClock(Math.min(clkBaseMin + (Date.now() - clkBaseMs) / 60000, clkBaseMin + CLK_STALL_CAP), true);
    }, 1000);
    if (clkTimer && clkTimer.unref) clkTimer.unref();

    // The authoritative score is truth. If we've woven more goals on a side than
    // the score now supports, VAR/offside chalked one off → un-weave it. Keyed on
    // the score (not the discard msg, which carries no target-kind), so any
    // disallowance — offside, foul, handball — reconciles the same honest way.
    function reconcile(hAuth, aAuth) {
      var auth = { 1: hAuth, 2: aAuth };
      for (var s = 1; s <= 2; s++) {
        while (wove[s] > auth[s]) {
          if (typeof L.chalkOff === 'function') L.chalkOff(s);
          wove[s]--;
          report.chalked++;
        }
      }
    }

    function onFeed(msg) {
      switch (msg.type) {
        case 'status': {
          var ph = msg.ev && msg.ev.phase;
          if (ph === 'EXTRA_TIME' || ph === 'PENALTIES') etPhase = true;
          // respect the wire's OWN running flag — it freezes at the 45'/90' cap
          // and through half-time. Fall back to the phase only if raw is missing.
          var clk = msg.ev && msg.ev.raw && msg.ev.raw.Clock;
          var running = clk && typeof clk.Running === 'boolean'
            ? clk.Running
            : (ph === 'FIRST_HALF' || ph === 'SECOND_HALF' || ph === 'EXTRA_TIME');
          if (msg.ev && typeof msg.ev.minute === 'number') syncClock(msg.ev.minute, running, Date.now());
          else clkRunning = running;
          // hand design the phase so the loom can render STOPPAGE (45+N / 90+N,
          // its own tone) and the breaks distinctly, and "restart" the timeline
          // at the half boundary. running=false at the 45'/90' cap IS stoppage/
          // the break; design implements L.phase (no-op until then).
          if (typeof L.phase === 'function') L.phase({ phase: ph || null, running: running, minute: msg.ev && typeof msg.ev.minute === 'number' ? msg.ev.minute : minute });
          break;
        }
        case 'odds': {
          var t = msg.tick;
          // only the full-match 1X2 feeds the belief; when it settles at the 90'
          // level the wire switches to period 'et' → we stop (loom greys). Honest.
          if (t.period === 'et' || etPhase) break;
          // a JOIN replay stamps the historical minute onto the tick (live ticks
          // carry none) — use it so the belief CURVE lands at its real minutes;
          // live ticks fall back to the running clock.
          var om = typeof t.minute === 'number' ? t.minute : minute;
          L.odds({ minute: om, pHome: t.pHome, pDraw: t.pDraw, pAway: t.pAway });
          report.odds++;
          break;
        }
        case 'spell': {
          var sp = msg.spell;
          var sec = sp.clockSeconds;
          if (typeof sec === 'number') setClock(sec / 60, true);
          var sn = sideNum(sp.side);
          if (sn) {
            var mDec = typeof sec === 'number' ? sec / 60 : minute;
            L.possession(mDec, sn);
            L.pressure(mDec, sn, PRESS[sp.kind] != null ? PRESS[sp.kind] : 0.5);
            report.spell++;
          }
          break;
        }
        case 'score': {
          if (msg.ev && typeof msg.ev.home === 'number') {
            L.score(msg.ev.home, msg.ev.away);
            report.score = msg.ev.home + '-' + msg.ev.away;
            reconcile(msg.ev.home, msg.ev.away); // chalk off any goal the score no longer supports
          }
          if (msg.ev && typeof msg.ev.minute === 'number') syncClock(msg.ev.minute, undefined, Date.now());
          break;
        }
        case 'ledger': {
          var m = msg.msg;
          if (m.type !== 'event') break; // amend/discard: no loom mark today
          var ev = m.ev, k = ev.kind, mn = typeof ev.minute === 'number' ? ev.minute : minute;
          // every ledger event carries a real match minute — advance the clock
          // base off it (danger/shots are frequent), so the clock ticks on even
          // through a goalless, status-quiet spell.
          if (typeof ev.minute === 'number' && ev.minute >= clkBaseMin - 0.05) { clkBaseMin = ev.minute; clkBaseMs = Date.now(); setClock(ev.minute, clkRunning); }
          if (k === 'danger') {
            // THE PRESSURE CORD'S REAL FUEL. The live wire sends danger/high-danger
            // as LEDGER events (~25 per 18s on BRA-NOR), not as spells — so route
            // them to the cord here, or it sits dead at centre (owner caught this
            // live). Not tempo: a danger spell isn't a discrete beat.
            var dsd = sideNum(ev.side);
            if (dsd) { L.pressure(mn, dsd, (ev.detail || '').toLowerCase().indexOf('high') >= 0 ? 2 : 1.5); report.pressure++; }
            break;
          }
          // tempo: every DISCRETE match event (not possession chatter — that's
          // its own cord). Meaningful "how frantic" rail.
          L.tempo(mn);
          report.event++;
          if (k === 'goal') {
            if (ev.confirmed && !firedGoals[ev.id]) {
              firedGoals[ev.id] = true;
              var gs = sideNum(ev.side);
              L.event({ minute: mn, kind: 'goal', side: gs, type: goalType(ev.goalKind), et: etPhase, quiet: !!msg._replay });
              report.goal++;
              if (gs) wove[gs]++; // track woven goals for chalk-off reconciliation
              // truth-align: the goal event auto-increments; the row carries the
              // authoritative score — set it absolute so no drift/double-count.
              if (ev.score && typeof ev.score.home === 'number') {
                L.score(ev.score.home, ev.score.away);
                report.score = ev.score.home + '-' + ev.score.away;
                reconcile(ev.score.home, ev.score.away);
              }
            }
          } else if (k === 'possible') {
            // held-breath (a goal/corner being CHECKED) — NOT a VAR review. Owner
            // caught this live on BRA-NOR: drawing every `possible` as VAR badly
            // over-reports reviews. Dropped; only a real `var` review marks the cloth.
          } else if (k === 'shot') {
            L.event({ minute: mn, kind: 'shot', side: sideNum(ev.side), type: (ev.detail || '').toLowerCase() });
          } else if (k === 'yellow-card' || k === 'red-card') {
            L.event({ minute: mn, kind: 'card', side: sideNum(ev.side) });
          } else if (k === 'corner') {
            L.event({ minute: mn, kind: 'corner', side: sideNum(ev.side) });
          } else if (k === 'var') {
            // ONE mark per REVIEW, not per envelope: a review re-fires with the
            // same id (OPEN → OPEN → Overturned) — dedupe so 2 reviews ≠ 6 marks.
            if (!firedVars[ev.id]) { firedVars[ev.id] = true; L.event({ minute: mn, kind: 'var', detail: ev.detail }); }
          }
          break;
        }
        default:
          break; // feedState / fixtureInfo — not a loom signal
      }
    }

    // ── transport: WS to the stands service (it holds the token, parses server-side)
    var url = wsBase + (wsBase.indexOf('?') >= 0 ? '&' : '?') + 'matchId=' + encodeURIComponent(matchId);
    var backoff = 1000;
    function connect() {
      var ws;
      try { ws = new WebSocket(url); } catch (e) { setTimeout(connect, backoff); return; }
      ws.onopen = function () { backoff = 1000; console.log('[loom-adapter] live wire open →', matchId); };
      ws.onmessage = function (e) {
        var msg; try { msg = JSON.parse(e.data); } catch (_) { return; }
        try { onFeed(msg); } catch (err) { console.warn('[loom-adapter] translate error', err); }
      };
      ws.onclose = function () { setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 30000); };
      ws.onerror = function () { try { ws.close(); } catch (_) {} };
    }
    connect();
  });
})();
