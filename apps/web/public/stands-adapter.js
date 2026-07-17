/*
 * ROOOT — STANDS ADAPTER (coordinator lane: wire → window.__stands).
 *
 * Surfaces the crowd mechanisms for a STATIC fan-section page (the loom pattern,
 * for the Stands). Speaks contracts/crowd.ts on the same stands WebSocket; the
 * server already handles all of it (root/cheer/predict/react/nextGoal + consensus/
 * moments/nextGoalState). A bundled app would use src/data/crowd-client.ts
 * instead — this is the static equivalent, exposing window.__stands +
 * subscriptions design renders against.
 *
 * Honesty: counts/roar are real server counts, never blended with market.
 * PREDICT is stamped with the live de-vigged market triple at press time.
 * NEXT GOAL (in-game, docs/BACKLOG-full-version-and-deferred-ideas.md §2) is
 * stamped by the SERVER at receipt — this adapter sends no market of its own.
 *
 * Opt-in: ?standsfeed=1, or wherever the fan experience runs (/, /live,
 * ?loomfeed=1, ?site=1). Match via ?match=<id>.
 */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search);
  // Live is the default on every surface that loads this adapter. The opt-OUTs are:
  //  ?demo=1 — the baked crowd-sim engine owns window.__stands, so this adapter must stand
  //            down or it would clobber the tape.
  //  ?replay=1 (+ the /live·/loom rewrites) — the sealed-match replay is self-contained (the
  //            baked ENG-ARG feed drives the stats/market); a live crowd socket to the stuck
  //            room has no honest crowd to show, so stand down and leave the bowl neutral
  //            rather than lean it on stuck-room counts (and keep the replay console clean).
  // (?live=1 / ?site=1 / ?loomfeed=1 / ?standsfeed=1 kept working, now redundant.)
  var REPLAY = q.get('replay') === '1' || location.pathname === '/live' || location.pathname === '/loom';
  var ON = q.get('demo') !== '1' && !REPLAY;
  if (!ON) return;
  var explicitMatch = q.get('match');   // ?match= always wins — never touches the manifest
  var wsBase = q.get('ws') || 'wss://rooot-stands.fly.dev/';

  // Shared fixture-manifest resolution (script-order-independent, one fetch total —
  // loom-adapter.js/stats-adapter.js/match-read.js each set up the same
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
      if (fellBack) console.warn('[stands-adapter] fixture manifest unavailable — falling back to 18213979');
      cb(id);
    }
    window.__fixtureReady.then(function (fx) {
      if (fx && fx.matchId) finish(fx.matchId, false); else finish('18213979', true);
    }, function () { finish('18213979', true); });
    setTimeout(function () { finish('18213979', true); }, 1500);
  }

  resolveMatchId(explicitMatch, function (matchId) {

  var ANON_KEY = 'rooot.anonId';
  function anonId() {
    try { var e = localStorage.getItem(ANON_KEY); if (e) return e;
      var f = 'anon-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem(ANON_KEY, f); return f;
    } catch (_) { return 'anon-' + Math.random().toString(36).slice(2, 10); }
  }
  var me = anonId();
  var ws = null, mySide = null, backoff = 1000, outbox = [];
  var connecting = false;        // true while a socket is opening or open — single-flight guard
  var reconnectTimer = null;     // at most one pending reconnect timer, ever
  var openedAtMs = 0;            // when the current attempt's onopen fired (0 = not open yet)
  var watchdogTimer = null;      // armed per attempt; abandons a hung connect() at ~10s (review I4)
  var lastTriple = null;                 // live de-vigged market, for the predict stamp
  var trailing = null;                   // side currently behind → faith
  var lastScore = { home: 0, away: 0 };
  var lastSentiment = null;              // THE SEAL (delta-review Bug A2) — cached like lastTriple, below.
                                          // The join-replay burst (this match's sentiment record, if any)
                                          // can land BEFORE the page finishes its own async setup (e.g.
                                          // terrace.html's fixture-manifest fetch, which gates when
                                          // wireLive() registers onSentiment) — a post-FT joiner's WS
                                          // connects and replays near-instantly, faster than that fetch
                                          // can resolve. Cache it so a callback registered AFTER the
                                          // message already arrived still gets it (same idiom as onMarket
                                          // replaying lastTriple immediately below).
  var lastFixtureInfo = null;            // adopt-#1 (docs/DATA-ARCHITECTURE.md §4): the server's
                                          // sentiment/teams.ts-sourced team identity for this match —
                                          // same cache-and-replay idiom as lastSentiment/lastTriple above,
                                          // since fixtureInfo rides the SAME near-instant join-replay burst
                                          // (server.ts replaySnapshot) and a page's own onFixtureInfo
                                          // registration can easily lose that race.
  var cb = { state: [], consensus: [], verdict: [], moment: [], momentResult: [], market: [], cheerEcho: [], nextGoalState: [], nextGoalVerdict: [], sentiment: [], fixtureInfo: [] };
  function fire(list, v) { for (var i = 0; i < list.length; i++) { try { list[i](v); } catch (e) {} } }

  function send(m) {
    if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(m)); } catch (e) {} return; }
    outbox.push(m); if (outbox.length > 24) outbox.shift();
  }
  function flush() { var q = outbox; outbox = []; for (var i = 0; i < q.length; i++) send(q[i]); }
  function hello() { send({ type: 'hello', matchId: matchId, anonId: me, side: mySide || undefined }); }

  // ── the surface design renders against ──
  var pendingCheer = 0, cheerTimer = null, view = { rooted: { home: 0, away: 0 }, roar: { home: 0, away: 0 }, faithSide: null, connected: false, market: null };
  window.__stands = {
    anonId: me,
    matchId: matchId,
    root: function (side) { mySide = side === 'away' ? 'away' : 'home'; hello(); publish(); },
    cheer: function () { if (!mySide) return; pendingCheer++; if (!cheerTimer) cheerTimer = setTimeout(flushCheer, 120); },
    predict: function (home, away, conv) {
      // conv = the gate's confidence dial 1..4 — rides to the server so the record's
      // points fold can scale the full-time bonus (contracts/crowd.ts, 2026-07-18)
      send({ type: 'predict', matchId: matchId, anonId: me, home: home, away: away,
        marketAtPredict: lastTriple || undefined,
        conv: (conv >= 1 && conv <= 4) ? Math.floor(conv) : undefined, atMs: Date.now() });
    },
    momentReact: function (momentId, token) {
      if (!mySide) return;
      send({ type: 'momentReact', matchId: matchId, momentId: momentId, anonId: me, side: mySide, token: token, atMs: Date.now() });
    },
    // NEXT GOAL (in-game, docs/BACKLOG-full-version-and-deferred-ideas.md §2):
    // which end scores next, or 'none'. Same guard style as cheer — only a
    // rooted fan can call. The server stamps the market itself at receipt;
    // this adapter sends no marketAtCall (unlike predict's client-stamped one).
    nextGoal: function (call) {
      if (!mySide) return;
      send({ type: 'nextGoalCall', matchId: matchId, anonId: me, call: call, atMs: Date.now() });
    },
    onState: function (fn) { cb.state.push(fn); publish(); },        // {rooted, roar, faithSide, connected}
    onConsensus: function (fn) { cb.consensus.push(fn); },           // the crowd's predicted scoreline (all + byRoot + doubters)
    onVerdict: function (fn) { cb.verdict.push(fn); },               // your prediction verdict at FT
    onMoment: function (fn) { cb.moment.push(fn); },                 // a drama window opens (kind, side, palette, closesAtMs)
    onMomentResult: function (fn) { cb.momentResult.push(fn); },     // the split reveal
    onCheer: function (fn) { cb.cheerEcho.push(fn); },               // a single accepted cheer landed — {side, atMs}, discrete (not the roar)
    onMarket: function (fn) { cb.market.push(fn); if (lastTriple) try { fn(lastTriple); } catch (e) {} },
    onNextGoal: function (fn) { cb.nextGoalState.push(fn); },        // the crowd's live next-goal split — {ts, open:{n,home,away,none}, marketAtTs}
    onNextGoalVerdict: function (fn) { cb.nextGoalVerdict.push(fn); }, // your personal verdict at resolution — {call, outcome, happened, marketAtCall}
    // THE SEAL (delta-review Bug A2): the durable sentiment record — sent live on crystallize
    // AND replayed to a fresh joiner (even a cold, post-eviction one — server.ts's
    // latestSentimentRecordOnDisk). Fires with the record itself (finalScore + verdict data),
    // already matchId-filtered below, so a page never has to unwrap the envelope. Replays the
    // cached record immediately on registration (lastSentiment, above) in case it already
    // arrived on the wire before this callback was registered.
    onSentiment: function (fn) { cb.sentiment.push(fn); if (lastSentiment) try { fn(lastSentiment); } catch (e) {} },
    // adopt-#1 (docs/DATA-ARCHITECTURE.md §4): the server's team identity for this match
    // (contracts/feed.ts FeedMsg 'fixtureInfo', sourced from services/stands/src/sentiment/
    // teams.ts — never fabricated; simply absent for a fixture teams.ts doesn't know). Fires
    // with the fixture itself ({id,home,away,kickoffISO} — home/away are {code,name,colors,
    // flag}), same replay-cached-value-on-registration idiom as onSentiment/onMarket above.
    onFixtureInfo: function (fn) { cb.fixtureInfo.push(fn); if (lastFixtureInfo) try { fn(lastFixtureInfo); } catch (e) {} },
  };
  function flushCheer() { cheerTimer = null; var n = pendingCheer; pendingCheer = 0; if (n > 0 && mySide) send({ type: 'cheer', matchId: matchId, side: mySide, n: n, atMs: Date.now() }); }
  // trailing-edge throttle (~250ms, <=4 fires/s): view is mutated synchronously by every
  // caller above BEFORE publish() runs, so this only coalesces the notify-to-surfaces
  // fan-out — nothing is lost, a join replay's ~1,600 stands/score/odds messages just can't
  // each force a synchronous render (the main-thread block behind last night's reconnect
  // storm). Discrete signals (consensus/verdict/moment/momentResult/cheerEcho/market, plus
  // the direct fanNo assignment on 'welcome') fire via fire(cb.X, …) directly in onMsg, not
  // through publish() — they stay instant, untouched here.
  var publishTimer = null;
  function publish() {
    view.faithSide = trailing;
    if (publishTimer) return;
    publishTimer = setTimeout(function () { publishTimer = null; fire(cb.state, view); }, 250);
  }

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
      case 'welcome': if (m.matchId === matchId && m.anonId === me) window.__stands.fanNo = m.fanNo; break;
      case 'moment': if (m.matchId === matchId) fire(cb.moment, m); break;
      case 'momentResult': if (m.matchId === matchId) fire(cb.momentResult, m); break;
      case 'cheerEcho': if (m.matchId === matchId) fire(cb.cheerEcho, { side: m.side, atMs: m.atMs }); break;
      case 'nextGoalState': if (m.matchId === matchId) fire(cb.nextGoalState, m); break;
      case 'nextGoalVerdict': if (m.matchId === matchId && m.anonId === me) fire(cb.nextGoalVerdict, m); break;
      case 'sentiment': if (m.record && m.record.matchId === matchId) { lastSentiment = m.record; fire(cb.sentiment, m.record); } break;
      // fixtureInfo carries no top-level matchId (contracts/feed.ts — only odds/score/status/
      // ledger/feedState get server-stamped); the room itself is already scoped to matchId (one
      // room per connection), so no filter is needed here — same as loom-adapter.js/match-read.js's
      // existing 'fixtureInfo' handling.
      case 'fixtureInfo': if (m.fixture) { lastFixtureInfo = m.fixture; fire(cb.fixtureInfo, m.fixture); } break;
      case 'odds': {
        // Fix 4: guard by matchId when the server stamps one; tolerate its
        // absence (older server) by falling through to prior behavior.
        if (m.matchId && m.matchId !== matchId) break;
        var t = m.tick;
        if (t && t.period !== 'et') {
          lastTriple = { home: t.pHome, draw: t.pDraw, away: t.pAway };
          view.market = lastTriple;
          fire(cb.market, lastTriple);
          publish();
        }
        break;
      }
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

  // Single-flight + reconnect discipline. Last night: heavy replay processing blocked the
  // main thread, sockets died under backpressure, and MULTIPLE queued onclose handlers each
  // reconnected + reset backoff to 1s — a self-feeding storm (10 successful opens logged in
  // ~1s vs 2 expected). Fix: `connecting` guards against ever having two concurrent
  // attempts (opening OR open); `reconnectTimer` guards against ever having more than one
  // pending reconnect scheduled; backoff (1s→30s) resets to 1s only once a connection has
  // stayed open >=5s — a connect-die-connect flap keeps escalating instead of hammering.
  function scheduleReconnect() {
    if (reconnectTimer || connecting) return;
    reconnectTimer = setTimeout(function () { reconnectTimer = null; connect(); }, backoff);
  }
  function connect() {
    if (connecting) return;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    connecting = true;
    var url = wsBase + (wsBase.indexOf('?') >= 0 ? '&' : '?') + 'matchId=' + encodeURIComponent(matchId);
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
      hello(); flush();
      console.log('[stands-adapter] live wire →', matchId);
    };
    sock.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (_) { return; } try { onMsg(m); } catch (err) { console.warn('[stands-adapter]', err); } };
    function onSockClose() {
      if (sock !== ws || !connecting) return;
      if (watchdogTimer) { clearTimeout(watchdogTimer); watchdogTimer = null; }
      connecting = false;
      view.connected = false; publish();
      var stayedOpen = openedAtMs > 0 && (Date.now() - openedAtMs) >= 5000;
      backoff = stayedOpen ? 1000 : Math.min(backoff * 2, 30000);
      openedAtMs = 0;
      scheduleReconnect();
    }
    sock.onclose = onSockClose;
    sock.onerror = function () { try { sock.close(); } catch (_) {} };
  }
  connect();
  });
})();
