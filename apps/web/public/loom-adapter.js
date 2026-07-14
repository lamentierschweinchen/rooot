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
  // A kept cloth (?keepsake=1) makes __loom inert (woven-loom.html freezes it at full time) —
  // no live socket is ever needed, so bail before anything else runs. Earliest cheap exit;
  // leaves every other activation path (/live, ?site=1, ?demo=1) byte-identical.
  if (q.get('keepsake') === '1') return;
  var DEMO = q.get('demo') === '1';   // live by default; demo only when explicitly asked
  // Activate on the explicit dev opt-in (?loomfeed=1) OR the clean live front
  // door (rooot.club / /live, served by a rewrite). Direct /loom-proto stays
  // the self-contained demo — untouched.
  var SITE = location.pathname === '/' || location.pathname === '/live' || q.get('site') === '1' || DEMO;
  if (q.get('loomfeed') !== '1' && !SITE) return;
  var explicitMatch = q.get('match');   // ?match= always wins — never touches the manifest
  var wsBase = q.get('ws') || 'wss://rooot-stands.fly.dev/';

  // Shared fixture-manifest resolution (script-order-independent, one fetch total —
  // stands-adapter.js/stats-adapter.js/match-read.js each set up the same
  // window.__fixtureReady ||= fetch(...), so whichever script runs first on a page
  // does the ONE network fetch): (1) ?match= wins outright; (2) the manifest's
  // matchId, raced against a timeout so a hung fetch never blocks the socket;
  // (3) the FRA–MAR live-test literal, last resort.
  function resolveMatchId(explicit, cb) {
    if (explicit) { cb(explicit); return; }
    window.__fixtureReady = window.__fixtureReady || fetch('/fixture.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
    var done = false;
    // fellBack=true only on the genuine fallback paths (fetch failed/timed out/
    // malformed) — never on a legit manifest read, even one that happens to
    // resolve to this same literal. Warns exactly once (review I2).
    function finish(id, fellBack) {
      if (done) return; done = true;
      if (fellBack) console.warn('[loom-adapter] fixture manifest unavailable — falling back to 18213979');
      cb(id);
    }
    window.__fixtureReady.then(function (fx) {
      if (fx && fx.matchId) finish(fx.matchId, false); else finish('18213979', true);
    }, function () { finish('18213979', true); });
    setTimeout(function () { finish('18213979', true); }, 1500);
  }

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
  // player name for the loom's optional tap-tag (e.g. "23′ · GOAL · ESP / YAMAL"). The wire
  // packs it onto ev.detail for goal/card/sub ledger events — scorer/booked-player/sub name,
  // resolved from the SAME wire's roster (contracts/normalize.ts). Absent/empty → undefined,
  // never an empty string or placeholder: the loom renders honestly without it (law #1).
  function nameOrUndef(s) { return (typeof s === 'string' && s) ? s : undefined; }

  // DEMO boots synchronously with the explicit param or the old literal fallback —
  // no fetch, no timeout, no await (byte-identical to pre-manifest behavior; mirrors
  // match-read.js's LIVE/non-LIVE split). Only the LIVE path (the connect() transport
  // below) consults the fixture manifest via resolveMatchId.
  function boot(matchId) {
  waitForLoom(function () {
    var L = window.__loom;
    L.live();
    // Explicit replay labeling: a recording (?demo=1, or a re-served recording explicitly
    // flagged ?replay=1 on a ?ws= endpoint) tells the masthead the truth — the adapter has no
    // way to infer "this is history" from the wire's shape alone, so the operator states it.
    // Never fires on the real live path. Guarded so an older loom build (no .mode yet) can't throw.
    if ((DEMO || q.get('replay') === '1') && typeof L.mode === 'function') L.mode('replay');

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
          // Fix 4: guard by matchId when the server stamps one; tolerate its
          // absence (older server) by falling through to prior behavior.
          if (msg.matchId && msg.matchId !== matchId) break;
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
          // Fix (Jul 14 FRA-ESP incident, docs/POSTMORTEM-2026-07-14-live.md — the stuck
          // "0-3"): parseScoreMessage reports the running total off EVERY 'goal'/
          // 'penalty_outcome' envelope, Confirmed:false included — a goal still under review
          // already bumps this number optimistically. Trusting it unconditionally showed a
          // score that counted an attempt VAR went on to overturn, and nothing ever corrected
          // it back down: var_end/action_discarded carry the reverted total on the wire, but
          // neither is 'goal'/'penalty_outcome' (parseScoreMessage never re-fires for them)
          // and the ledger's own 'discard' message carries no score at all (see the
          // `m.type !== 'event'` break below) — so an unconfirmed bump here is permanent
          // unless it's never shown in the first place. Fail-closed on the SAME raw Confirmed
          // flag the goal-weave path already gates on below (mirrors stands/server.ts's
          // isWireConfirmed: absent/unreadable = NOT confirmed), so the mast only ever prints
          // a score the wire actually settled — a goal that's later chalked off never had to
          // be un-said because it was never said honestly in the first place (law #1).
          var scoreConfirmed = !!(msg.ev && msg.ev.raw && msg.ev.raw.Confirmed === true);
          if (msg.ev && typeof msg.ev.home === 'number' && scoreConfirmed) {
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
              var goalEvt = { minute: mPos, kind: 'goal', side: gs, type: goalType(ev.goalKind), et: etPhase, quiet: !!msg._replay };
              var gnm = nameOrUndef(ev.detail); // scorer, e.g. "Dembele, Ousmane" (own goals carry "(OG)")
              if (gnm) goalEvt.name = gnm;
              L.event(goalEvt);
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
            if (WEAVE.card) {
              var cardEvt = { minute: mPos, kind: 'card', side: sideNum(ev.side), type: k === 'red-card' ? 'red' : 'yellow', id: ev.id };
              // booked player's name — arrives on a later re-emit of the same id (normalize.ts: the
              // first emission is empty, so an early card often weaves nameless and updates in place).
              var cnm = nameOrUndef(ev.detail);
              if (cnm) cardEvt.name = cnm;
              L.event(cardEvt);
            }
          } else if (k === 'corner') {
            if (WEAVE.corner) L.event({ minute: mPos, kind: 'corner', side: sideNum(ev.side), id: ev.id });
          } else if (k === 'substitution') {
            if (WEAVE.sub) {
              var subEvt = { minute: mPos, kind: 'sub', side: sideNum(ev.side), id: ev.id };
              // detail packs "in|out" (same convention stats-adapter.js splits on) — the incoming
              // player is the sub's headline name.
              var snm = nameOrUndef((ev.detail || '').split('|')[0]);
              if (snm) subEvt.name = snm;
              L.event(subEvt);
            }
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
          // adopt-#1 (docs/DATA-ARCHITECTURE.md §4): resolution-chain priority — a page's
          // own in-page fixture map is the override layer and must win when it already
          // themed synchronously (woven-loom.html sets L.__themedLocally when its FX table
          // has ?match=); this wire message is the FALLBACK for a fixture that table
          // doesn't carry, never a later override of a page that already resolved one.
          var fx = msg.fixture;
          if (fx && typeof L.teams === 'function' && !L.__themedLocally) {
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
    //
    // NOTE on throttling: unlike stands-adapter/stats-adapter/match-read.js, nothing here
    // gets a state-publish throttle. window.__loom (woven-loom.html / loom-proto.html) never
    // re-renders synchronously per call — every L.* method below just mutates small in-memory
    // state (push to an array, bump a counter, set a field) and sets a `dirty` flag; the
    // actual paint runs once per animation frame, gated on that flag
    // (woven-loom.html: "if(dirty){dirty=false;renderCloth();}" inside a requestAnimationFrame
    // loop; loom-proto.html paints on its own always-on rAF loop, fully decoupled from how
    // often L.* is called). So a join replay's burst of L.odds/L.pressure/L.possession/
    // L.event/L.clock calls is already O(1)-cheap per call and already coalesces to <=1
    // render/frame — the loom solved this problem itself. Adding a throttle here would only
    // risk DROPPING data for the calls that push into arrays (L.event, L.odds, L.pressure,
    // L.possession all need every call, not just the latest) for zero main-thread benefit —
    // so market/spell-tick calls (L.odds/L.pressure/L.possession) and the event stream
    // (L.event) are both left exactly as they were. Only the transport below changes.
    var url = wsBase + (wsBase.indexOf('?') >= 0 ? '&' : '?') + 'matchId=' + encodeURIComponent(matchId);
    var backoff = 1000, ws = null, connecting = false, reconnectTimer = null, openedAtMs = 0, watchdogTimer = null;
    // Single-flight + reconnect discipline (see stands-adapter.js for the full incident
    // rationale): `connecting` guards against two concurrent attempts (opening OR open);
    // `reconnectTimer` guards against more than one pending reconnect; backoff (1s→30s)
    // resets to 1s only once a connection has stayed open >=5s, so a connect-die-connect
    // flap escalates instead of hammering at 1s.
    function scheduleReconnect() {
      if (reconnectTimer || connecting) return;
      reconnectTimer = setTimeout(function () { reconnectTimer = null; connect(); }, backoff);
    }
    function connect() {
      if (connecting) return;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      connecting = true;
      var sock;
      try { sock = new WebSocket(url); } catch (e) { connecting = false; scheduleReconnect(); return; }
      ws = sock;
      // Connect-attempt watchdog (review I4): on flaky mobile networks — tonight's exact
      // threat model — new WebSocket() can sit forever without ever firing open, error, or
      // close, leaving `connecting` stuck true and this adapter dead with no retry: a fan's
      // page hangs silently. ~10s after an attempt starts, if neither open nor close has
      // fired, abandon it — best-effort close() (its own close callback, if it ever arrives,
      // is a no-op by then, see the `connecting` guard in onSockClose below) then force the
      // same close-path bookkeeping onclose runs, so backoff still escalates (never resets —
      // openedAtMs is still 0) and exactly one reconnect gets scheduled. Cleared on both open
      // and close so a socket that behaves normally never trips it.
      watchdogTimer = setTimeout(function () {
        watchdogTimer = null;
        if (sock !== ws) return; // stale handler guard — should be unreachable under single-flight
        try { sock.close(); } catch (_) {}
        onSockClose();
      }, 10000);
      sock.onopen = function () {
        if (sock !== ws) return; // stale handler guard — should be unreachable under single-flight
        if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        openedAtMs = Date.now();
        console.log('[loom-adapter] live wire open →', matchId);
      };
      sock.onmessage = function (e) {
        var msg; try { msg = JSON.parse(e.data); } catch (_) { return; }
        try { onFeed(msg); } catch (err) { console.warn('[loom-adapter] translate error', err); }
      };
      function onSockClose() {
        if (sock !== ws || !connecting) return;
        if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
        connecting = false;
        var stayedOpen = openedAtMs > 0 && (Date.now() - openedAtMs) >= 5000;
        backoff = stayedOpen ? 1000 : Math.min(backoff * 2, 30000);
        openedAtMs = 0;
        scheduleReconnect();
      }
      sock.onclose = onSockClose;
      sock.onerror = function () { try { sock.close(); } catch (_) {} };
    }
    // under ?demo=1 with no explicit ?ws, weave the baked serverless feed (demo-feed.js) —
    // the loom shows the REAL recorded match offline, not its ARG-CPV demo seed.
    if (DEMO && !q.get('ws') && window.__demoFeed) {
      window.__demoFeed.start(function (msg) { try { onFeed(msg); } catch (err) { console.warn('[loom-adapter] translate error', err); } });
    } else {
      connect();
    }
  });
  }
  if (DEMO) { boot(explicitMatch || '18209181'); } else { resolveMatchId(explicitMatch, boot); }
})();
