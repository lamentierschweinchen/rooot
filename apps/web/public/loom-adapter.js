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
  var DEMO = q.get('demo') === '1';   // live by default; demo only when explicitly asked
  // Activate on the explicit dev opt-in (?loomfeed=1) OR the clean live front
  // door (rooot.club / /live, served by a rewrite). Direct /loom-proto stays
  // the self-contained demo — untouched.
  var SITE = location.pathname === '/' || location.pathname === '/live' || q.get('site') === '1' || DEMO;
  if (q.get('loomfeed') !== '1' && !SITE) return;
  var matchId = q.get('match') || '18209181'; // SUI–COL default (live now). MUST match loom-proto's FIXTURES default. TODO(P2): dynamic default so /live auto-follows the live game.
  var wsBase = q.get('ws') || 'wss://rooot-stands.fly.dev/';

  function waitForLoom(cb) {
    if (window.__loom && typeof window.__loom.live === 'function') return cb();
    setTimeout(function () { waitForLoom(cb); }, 60);
  }

  // side: contracts return 'home'|'away' (already latched via participant1IsHome);
  // the loom wants 1=home/left, 2=away/right.
  function sideNum(s) { return s === 'home' ? 1 : s === 'away' ? 2 : 0; }

  // ── CURATION — which events weave onto the cloth. The loom is design's clean set
  // (goals · shots · cards · corners · VAR); the owner wants it SPARSE, high-signal
  // moments only (Jul 8: "which event types we even want there … relatively sparse").
  // One knob per family — flip + redeploy:
  //   sub      ON  — the owner asked for these back.
  //   freekick ON  — dangerous free kicks only (the correlation below; safe fouls never
  //                  weave). Owner flagged these as maybe-redundant (a dangerous free kick
  //                  usually shows up as the shot/goal it produces) — kept, easy to cut.
  //   offside  ON  — in design's legend already; genuinely sparse (usually 1-5 a match).
  //   injury   OFF — never in the design vocabulary OR the legend; buried the cloth in
  //                  ~7-12 medical crosses a match. Still counted in the stadium stats.
  // This matches design's legend (goal·save·block·miss·corner·freekick·offside·card·var)
  // PLUS subs — the one family the owner explicitly asked to add.
  var WEAVE = { goal: true, shot: true, card: true, corner: true, var: true, sub: true, freekick: true, offside: true, injury: false };
  // pressure weight per possession grade (owner's brief).
  var PRESS = { safe: 0.3, possession: 0.5, attack: 1, danger: 1.5, 'high-danger': 2 };
  // ledger goalKind (Shot|Head|Own) → loom event type (shot|head|own).
  function goalType(gk) { return gk === 'Head' ? 'head' : gk === 'Own' ? 'own' : 'shot'; }

  waitForLoom(function () {
    var L = window.__loom;
    L.live();

    var minute = 0;            // current match minute (decimal), the live edge
    var haveMinute = false;    // true once the wire ANCHORS a real match minute. Gates the
                               // clock so nothing displays or ticks pre-kickoff — kills the
                               // phantom where a phase-only status started the tick from base 0
                               // and the 2.5' stall-cap froze it at "2'" while 0-0 (Jul 7).
    var etPhase = false;       // true once EXTRA_TIME/PENALTIES — full 1X2 is dead
    var firedGoals = {};       // ledger goal id → true (fire the weave ONCE)
    var firedVars = {};        // VAR review id → true — ONE mark per review, not per envelope
    var pendingFK = [];        // free kicks held, awaiting a danger for the same side (see below)
    var FK_DANGER_WINDOW = 25; // match-seconds a free kick has to produce a threat to count
    var wove = { 1: 0, 2: 0 }; // goals actually woven per side — for chalk-off reconciliation
    var report = { odds: 0, spell: 0, event: 0, goal: 0, chalked: 0, pressure: 0, score: '0-0' };
    window.__loomAdapter = { report: report, matchId: matchId };

    // ── THE SHOOTOUT (StatusId 12) — its OWN mode, not cloth marks. When a match
    // goes to penalties the loom BECOMES a board: two rows, alternating, a running
    // tally, the winning kick. The wire sends each kick as `penalty_outcome`
    // (→ ledger 'penalty-kick', side + Scored/Missed), re-emitted with the SAME Id
    // (dedupe → update in place). We keep them in ARRIVAL order (both sides
    // interleaved), derive the board, and decide the winner by the real rules.
    // (owner, Jul 7: "now we're in penalties… we need a mode for it.")
    var shoot = { active: false, order: [], home: [], away: [], tally: { home: 0, away: 0 }, firstUp: null, done: false, winner: null };
    var shootAt = {}; // ledger id → index in shoot.order (dedupe the false→true re-emit)
    function pushShoot() {
      window.__loomShootout = shoot;
      if (typeof L.shootout === 'function') { try { L.shootout(shoot); } catch (_) {} }
    }
    // standard shootout resolution: best-of-5, early stop when a lead can't be
    // caught, then sudden death (decided only when BOTH have taken equal and differ).
    function decideShootout(nh, na, th, ta) {
      var STD = 5, remH = Math.max(0, STD - nh), remA = Math.max(0, STD - na);
      if (nh < STD || na < STD) {
        if (th > ta + remA) return { done: true, winner: 'home' };
        if (ta > th + remH) return { done: true, winner: 'away' };
        return { done: false, winner: null };
      }
      if (nh === na && th !== ta) return { done: true, winner: th > ta ? 'home' : 'away' };
      return { done: false, winner: null };
    }
    function rebuildShoot() {
      var h = [], a = [], th = 0, ta = 0;
      for (var i = 0; i < shoot.order.length; i++) {
        var kk = shoot.order[i];
        if (kk.side === 'home') { h.push(kk); if (kk.scored) th++; }
        else { a.push(kk); if (kk.scored) ta++; }
      }
      shoot.home = h; shoot.away = a; shoot.tally = { home: th, away: ta };
      shoot.firstUp = shoot.order.length ? shoot.order[0].side : null;
      var d = decideShootout(h.length, a.length, th, ta);
      shoot.done = d.done; shoot.winner = d.winner;
    }
    function recordShootoutKick(ev) {
      var sn = sideNum(ev.side); if (!sn) return;
      var out = (ev.detail || '').toLowerCase();
      var kick = { side: sn === 1 ? 'home' : 'away', scored: out.indexOf('scored') >= 0, outcome: ev.detail || null };
      if (shootAt[ev.id] != null) shoot.order[shootAt[ev.id]] = kick; // re-emit → update in place
      else { shootAt[ev.id] = shoot.order.length; shoot.order.push(kick); }
      shoot.active = true;
      rebuildShoot();
      pushShoot();
    }

    function setClock(mDec, running) {
      if (typeof mDec !== 'number' || !isFinite(mDec) || mDec < 0) return;
      if (!haveMinute && mDec > 0) return; // pre-anchor: never surface a minute > 0 (stays 0' / KICK-OFF)
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
        haveMinute = true;       // a real wire minute — the clock may now run
        clkBaseMin = matchMinute;
        clkBaseMs = atMs || Date.now();
        setClock(matchMinute, clkRunning);
      }
    }
    var clkTimer = setInterval(function () {
      if (!clkRunning || !haveMinute) return; // never tick from an un-anchored base (the phantom "2")
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
          // the whole surface shifts into the shootout board the moment pens begin —
          // even before the first kick, so the empty board is there to fill.
          if (ph === 'PENALTIES' && !shoot.active) { shoot.active = true; pushShoot(); }
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
          // The full-match 1X2 keeps pricing the WINNER through EXTRA TIME — verified in the
          // ARG-CPV capture: it stays period 'full' for all 625 ticks across the whole match
          // (H~0.91 on the 92' ET goal → draw-heavy ~0.55 at 105' headed to pens → 0.94 on the
          // 111' winner). Do NOT cut the belief once ET starts — that flat-lined the cord and
          // the owner flagged the "beige after 90'" as a bug. Only skip a distinct 'et'-period
          // market if the wire ever sends one (it doesn't on the 1X2 we parse). (Jul 7 refix.)
          if (t.period === 'et') break;
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
          // anchor the minute (+ haveMinute) off possession, but do NOT force running —
          // the RUNNING state is the status's job (kickoff sets it, HALF_TIME clears it).
          // Forcing it true here made the clock tick through half-time, because the join
          // replay sends spells AFTER the HALF_TIME status and they re-enabled it (Jul 7).
          if (typeof sec === 'number') syncClock(sec / 60, undefined, Date.now());
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
          // PLACEMENT minute — the loom lays each mark at the SECOND it fired (its fraction
          // of the minute → position across the side's band). ev.minute is FLOORED (for the
          // clock), so read the decimal off the raw Clock.Seconds; fall back to the floored mn.
          var _secs = ev.raw && ev.raw.Clock && ev.raw.Clock.Seconds;
          var mPos = (typeof _secs === 'number' && _secs >= 0) ? _secs / 60 : mn;
          // every ledger event carries a real match minute — advance the clock
          // base off it (danger/shots are frequent), so the clock ticks on even
          // through a goalless, status-quiet spell.
          if (k !== 'warmup' && typeof ev.minute === 'number' && ev.minute >= clkBaseMin - 0.05) { haveMinute = true; clkBaseMin = ev.minute; clkBaseMs = Date.now(); setClock(ev.minute, clkRunning); } // warmup/standby is pre-kickoff tunnel chatter — it must NOT anchor the clock
          if (k === 'danger') {
            // THE PRESSURE CORD'S REAL FUEL. The live wire sends danger/high-danger
            // as LEDGER events (~25 per 18s on BRA-NOR), not as spells — so route
            // them to the cord here, or it sits dead at centre (owner caught this
            // live). Not tempo: a danger spell isn't a discrete beat.
            var dsd = sideNum(ev.side);
            if (dsd) {
              L.pressure(mn, dsd, (ev.detail || '').toLowerCase().indexOf('high') >= 0 ? 2 : 1.5); report.pressure++;
              // did a recent free kick LEAD TO this danger? weave the newest matching one,
              // placed where the FREE KICK happened. (FreeKickType is mostly empty on the wire,
              // so we detect "led to danger" by a same-side danger within the window, not a flag.)
              if (typeof _secs === 'number') {
                for (var _fi = pendingFK.length - 1; _fi >= 0; _fi--) {
                  var _fk = pendingFK[_fi];
                  if (_fk.side === dsd && _secs - _fk.secs >= 0 && _secs - _fk.secs <= FK_DANGER_WINDOW) {
                    L.event({ minute: _fk.mPos, kind: 'freekick', side: dsd, id: _fk.id });
                    pendingFK.splice(_fi, 1); break;
                  }
                }
              }
            }
            break;
          }
          // throw-ins are a stats-only signal (SET PIECES count) — NOT a loom beat.
          // ~74 a match would flood the tempo cord and swamp "how frantic". Drop here.
          if (k === 'throw-in') break;
          // a shootout kick belongs to THE BOARD, not the cloth. StatusId 12 = pens;
          // an in-play penalty (other statuses) reflects through the score path instead.
          if (k === 'penalty-kick') {
            var _psid = ev.raw && (ev.raw.StatusId != null ? ev.raw.StatusId : (ev.raw.Data && ev.raw.Data.StatusId));
            if (_psid === 12) recordShootoutKick(ev);
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
              L.event({ minute: mPos, kind: 'goal', side: gs, type: goalType(ev.goalKind), et: etPhase, quiet: !!msg._replay });
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
            // pass the wire id: shots re-emit (unconfirmed → outcome), so the loom must
            // REPLACE by id, not stack a second mark. Same for cards (empty → named).
            if (WEAVE.shot) L.event({ minute: mPos, kind: 'shot', side: sideNum(ev.side), type: (ev.detail || '').toLowerCase(), id: ev.id });
          } else if (k === 'yellow-card' || k === 'red-card') {
            if (WEAVE.card) L.event({ minute: mPos, kind: 'card', side: sideNum(ev.side), type: k === 'red-card' ? 'red' : 'yellow', id: ev.id });
          } else if (k === 'corner') {
            if (WEAVE.corner) L.event({ minute: mPos, kind: 'corner', side: sideNum(ev.side), id: ev.id });
          } else if (k === 'substitution') {
            if (WEAVE.sub) L.event({ minute: mPos, kind: 'sub', side: sideNum(ev.side), id: ev.id });
          } else if (k === 'injury') {
            // OFF by default (WEAVE.injury) — noise; still tallied in the stadium stats.
            if (WEAVE.injury) L.event({ minute: mPos, kind: 'injury', side: sideNum(ev.side), id: ev.id });
          } else if (k === 'free-kick') {
            var fkt = (ev.detail || '').toLowerCase();
            if (fkt.indexOf('offside') >= 0) {
              // offside is its own event — weave it directly, where it happened.
              if (WEAVE.offside) L.event({ minute: mPos, kind: 'freekick', side: sideNum(ev.side), type: 'offside', id: ev.id });
            } else if (WEAVE.freekick) {
              // a foul → HOLD it; the danger branch weaves it only if it LED TO DANGER.
              // Routine midfield fouls that go nowhere never weave (they'd flood the cloth).
              var _fs = sideNum(ev.side);
              if (_fs && typeof _secs === 'number') { pendingFK.push({ side: _fs, secs: _secs, mPos: mPos, id: ev.id }); if (pendingFK.length > 40) pendingFK.shift(); }
            }
          } else if (k === 'var') {
            // ONE mark per REVIEW, not per envelope: a review re-fires with the
            // same id (OPEN → OPEN → Overturned) — dedupe so 2 reviews ≠ 6 marks.
            if (WEAVE.var && !firedVars[ev.id]) { firedVars[ev.id] = true; L.event({ minute: mPos, kind: 'var', detail: ev.detail }); }
          }
          break;
        }
        case 'fixtureInfo': {
          // theme the loom from the WIRE (home/away tricodes + kit colours), so any
          // fixture themes itself — loom-proto also themes from its own FIXTURES table
          // (idempotent); woven-loom depends on this to leave the ARG/CPV demo default.
          var fx = msg.fixture;
          if (fx && typeof L.teams === 'function') {
            var mkTeam = function (t) { return t ? { tri: t.code, name: t.name, primary: t.colors && t.colors[0], secondary: t.colors && t.colors[1] } : null; };
            L.teams(mkTeam(fx.home), mkTeam(fx.away));
          }
          break;
        }
        default:
          break; // feedState — not a loom signal
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
    // under ?demo=1 with no explicit ?ws, weave the baked serverless feed (demo-feed.js) —
    // the loom shows the REAL recorded match offline, not its ARG-CPV demo seed.
    if (DEMO && !q.get('ws') && window.__demoFeed) {
      window.__demoFeed.start(function (msg) { try { onFeed(msg); } catch (err) { console.warn('[loom-adapter] translate error', err); } });
    } else {
      connect();
    }
  });
})();
