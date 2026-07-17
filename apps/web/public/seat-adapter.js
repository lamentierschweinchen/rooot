/*
 * ROOOT — SEAT interface (coordinator lane: identity -> window.__seat).
 * Mirrors window.__stands/__match: surfaces read __seat, never touch WebAuthn/Privy.
 * Pure core (nextSeat/resolveMechanism) is Node-testable via scripts/_seat-test.mjs.
 *
 * claim() resolver (Task 11): passkey hero (window.seatPasskey, Task 10) -> Privy
 * fallback seam (window.__seatPrivyClaim, Task 7 -- DEFERRED, wired here but not
 * required) -> one central POST /seat/claim. The server derives side/call from
 * match-state (services/stands/src/seat/claim.ts) -- the client never parses a
 * gate pass itself (Task 2 review decision: the old bindPayload/rooot.pass
 * forwarding was dead code, removed here).
 *
 * SEAT reconciliation (docs/HANDOFF-2026-07-10-coordinator-session.md §5): this
 * adapter also owns window.__album -- design/HANDOFF-coordinator-data-wiring.md's
 * explicit ask is that no surface ever does a raw fetch('/seat/album') itself (the
 * your-seat branch's original cabinet.html did exactly that, which is one of the two
 * things this reconciliation drops -- see fetchAlbum below and its two call sites).
 */
(function (root) {
  'use strict';
  function nextSeat(state, ev) {
    var s = state || { status: 'anon', pubkey: null, method: null };
    if (!ev) return s;
    if (ev.type === 'reset') return { status: 'anon', pubkey: null, method: null };
    if (ev.type === 'claimed') return { status: 'claimed', pubkey: ev.pubkey, method: ev.method };
    return s;
  }

  // resolveMechanism(passkey, privyClaim, id): pick a wallet mechanism and resolve
  // {pubkey, method}. Pure w.r.t. its arguments (the browser wiring below passes
  // window.seatPasskey/window.__seatPrivyClaim; the Node test passes small fakes) --
  // this is what makes the error-handling nuance Node-testable without mocking
  // WebAuthn or fetch:
  //   - passkey absent, or supportsPrf() false -> straight to Privy.
  //   - passkeyClaim rejects 'prf-unsupported' (this device genuinely can't do PRF)
  //     -> falls through to Privy.
  //   - passkeyClaim rejects with anything else (a genuine WebAuthn rejection, e.g.
  //     the fan cancelled the biometric prompt) -> REJECTS the whole thing. That's
  //     a real "no", not a signal to quietly try a different mechanism.
  //   - no Privy resolver loaded either -> rejects 'claim-unavailable' (the honest
  //     "can't claim on this device yet" path; the fan stays anonymous).
  function resolveMechanism(passkey, privyClaim, id) {
    function tryPrivy() {
      if (typeof privyClaim !== 'function') return Promise.reject(new Error('claim-unavailable'));
      return Promise.resolve().then(function () { return privyClaim(id); });
    }
    if (passkey && typeof passkey.supportsPrf === 'function') {
      return Promise.resolve().then(function () { return passkey.supportsPrf(); }).then(function (supported) {
        if (!supported) return tryPrivy();
        return Promise.resolve().then(function () { return passkey.passkeyClaim(id); }).catch(function (err) {
          if (err && err.message === 'prf-unsupported') return tryPrivy();
          throw err; // genuine WebAuthn rejection -- surface it, never silently fall back
        });
      });
    }
    return tryPrivy();
  }

  root.nextSeat = nextSeat; root.resolveMechanism = resolveMechanism;
  if (typeof module !== 'undefined' && module.exports) module.exports = { nextSeat: nextSeat, resolveMechanism: resolveMechanism };
  if (typeof window === 'undefined') return;

  // Same base-URL convention as stands-adapter.js/stats-adapter.js/loom-adapter.js
  // (?ws= override, else the shared stands service) -- ws(s) -> http(s) for this
  // plain POST, since /seat/* is served off the SAME httpServer the WebSocket
  // upgrades on (services/stands/src/server.ts: `new WebSocketServer({server:
  // httpServer})`). Strip any trailing slash so + '/seat/claim' never double-slashes.
  var q = new URLSearchParams(location.search);
  var wsBase = q.get('ws') || 'wss://rooot-stands.fly.dev/';
  var SEAT_API = wsBase.replace(/^ws/, 'http').replace(/\/+$/, '');

  var state = nextSeat(undefined, { type: 'reset' });
  var subs = [];
  // Get-or-create, SAME key + generator shape as stands-adapter.js's anonId() -- both adapters
  // get-or-create on one key, so load order can never fork a fan's identity. Needed here because
  // the claim-token round-trip below must hello with a real session identity even on a page that
  // never loaded stands-adapter.
  function anonId() {
    try {
      var e = localStorage.getItem('rooot.anonId');
      if (e) return e;
      var f = 'anon-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('rooot.anonId', f);
      return f;
    } catch (_) { return null; }
  }
  function fire() { for (var i = 0; i < subs.length; i++) try { subs[i](snap()); } catch (e) {} }
  function snap() { return { status: state.status, pubkey: state.pubkey, method: state.method, anonId: anonId(), profile: window.__seat && window.__seat.profile || null }; }
  function publish() { window.__seat.status = state.status; window.__seat.pubkey = state.pubkey; window.__seat.method = state.method; window.__seat.anonId = anonId(); fire(); }
  // SEAT: GET /seat/me -- claim() already gets the profile back inline (its POST response
  // carries it), but a RESTORED pubkey (below, from a prior visit) never called claim() this
  // session, so __seat.profile would otherwise stay null forever until the fan re-claims.
  // Honors r.ok (review minor): a non-ok response keeps the LAST KNOWN profile rather than
  // touching anything -- retained state on a transient blip; a first-load failure stays null.
  function fetchMe(pubkey) {
    if (!pubkey) return;
    fetch(SEAT_API + '/seat/me?pubkey=' + encodeURIComponent(pubkey)).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (body) {
      if (body && body.profile) { window.__seat.profile = body.profile; publish(); }
    }).catch(function (_) {
      // leave profile as-is on a fetch hiccup -- never fabricate one.
    });
  }

  // SEAT: window.__album -- the adapter owns this global (design/HANDOFF-coordinator-data-wiring.md
  // §2: "not a raw fetch in the surface"). scarves/record/next mirror the AlbumScarf/record shapes
  // in that doc; record/next stay null here on purpose (the doc: "no /seat/me record fields needed" --
  // design derives record from scarves, and next has no fixtures source yet) -- only scarves is ever
  // populated over the wire. on(fn) fires immediately with the current snapshot, then again every
  // time fetchAlbum refreshes it (claim, or a restored pubkey on load) -- mirrors __seat's fire/publish.
  var albumSubs = [];
  function albumSnap() { return { scarves: window.__album.scarves, record: window.__album.record, next: window.__album.next }; }
  function fireAlbum() { for (var i = 0; i < albumSubs.length; i++) try { albumSubs[i](albumSnap()); } catch (e) {} }
  // Honors r.ok (review minor): a non-ok response (e.g. a transient 502 off a DAS blip) keeps the
  // LAST KNOWN scarves rather than replacing them with empty -- retained honest state; a first-load
  // failure stays honestly empty (the initial [] was never touched).
  function fetchAlbum(pubkey) {
    if (!pubkey) return;
    fetch(SEAT_API + '/seat/album?pubkey=' + encodeURIComponent(pubkey)).then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (body) {
      if (!body || !body.scarves) return; // non-ok / malformed -- keep the last known album
      window.__album.scarves = body.scarves;
      fireAlbum();
    }).catch(function (_) {
      // a fetch/network hiccup leaves the album exactly as it was -- never fabricate scarves,
      // never clear real ones out from under a fan on a transient failure.
    });
  }

  // requestSeatToken(matchId, id): the session-bound one-time claim token (review fix, risk 2 --
  // contracts/crowd.ts SeatTokenMsg/SeatTokenGrantMsg). Opens a short-lived WebSocket, hellos as
  // this fan (adopting the session identity -- the SAME trust anchor cheer/predict use), requests
  // the token, resolves with it, closes. The grant only ever answers the requesting socket, and
  // the token is single-use with a ~2 min expiry, so it is requested fresh per claim attempt.
  function requestSeatToken(matchId, id) {
    return new Promise(function (resolve, reject) {
      var sock;
      try { sock = new WebSocket(wsBase); } catch (e) { reject(new Error('token-unavailable')); return; }
      var done = false;
      function finish(err, token) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        try { sock.close(); } catch (_) {}
        if (err) reject(err); else resolve(token);
      }
      var timer = setTimeout(function () { finish(new Error('token-timeout')); }, 25000);   // a cold mobile TLS+WS handshake can exceed 8s -- don't burn a Face ID on it (Codex, 17 Jul)
      sock.onopen = function () {
        try {
          // hello adopts this anonId into the session (ws message order is preserved per
          // connection, so the seatToken request right behind it sees the adopted state).
          sock.send(JSON.stringify({ type: 'hello', matchId: matchId, anonId: id }));
          sock.send(JSON.stringify({ type: 'seatToken', matchId: matchId, anonId: id }));
        } catch (e) { finish(new Error('token-unavailable')); }
      };
      sock.onmessage = function (ev) {
        var m; try { m = JSON.parse(ev.data); } catch (_) { return; }
        if (m && m.type === 'seatTokenGrant' && m.matchId === matchId && m.anonId === id && m.token) finish(null, m.token);
      };
      sock.onerror = function () { finish(new Error('token-unavailable')); };
      sock.onclose = function () { finish(new Error('token-unavailable')); };
    });
  }

  // claim(opts): opts.matchId is the match being claimed at -- the PRESSING page passes it.
  // Resolves the wallet mechanism (passkey hero / Privy fallback -- the Face-ID moment), then
  // the session-bound claim token, then makes the ONE central POST. The token ceremony runs
  // AFTER the biometric so a fan pausing on the Face-ID prompt can never outlive the token's
  // expiry. The POST body is { token, pubkey, method } ONLY -- the server derives the anonId +
  // matchId being claimed from the token, never from anything the page asserts (review fix,
  // risk 2: a bare POST can no longer harvest another fan's side/call/verdict/serial).
  // one ceremony per session: the derived {pubkey, method} is public material, so a retry
  // (token timeout, mint pending) or a second match's claim reuses it instead of asking for
  // Face ID again (Codex, 17 Jul). The token stays fresh per attempt -- only the biometric is spared.
  var mechCache = null;
  function claim(opts) {
    var matchId = opts && opts.matchId;
    var id = anonId();
    if (!matchId) return Promise.reject(new Error('match-required'));
    if (!id) return Promise.reject(new Error('anon-required'));
    var mech = (mechCache && mechCache.id === id)
      ? Promise.resolve(mechCache.res)
      : resolveMechanism(window.seatPasskey, window.__seatPrivyClaim, id).then(function (res) { mechCache = { id: id, res: res }; return res; });
    return mech.then(function (res) {
      return requestSeatToken(matchId, id).then(function (token) {
        var payload = { token: token, pubkey: res.pubkey, method: res.method };
        return fetch(SEAT_API + '/seat/claim', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (r) {
          return r.json().then(function (body) {
            if (!r.ok) throw new Error((body && body.error) || ('seat claim failed: ' + r.status));
            return body;
          });
        }).then(function (body) {
          state = nextSeat(state, { type: 'claimed', pubkey: res.pubkey, method: res.method });
          // SEAT: persist the PUBLIC pubkey (+ method) only, so a reload doesn't drop back to
          // anon -- the derived secret is never touched here and never goes to localStorage.
          try { localStorage.setItem('rooot.seat.pubkey', res.pubkey); localStorage.setItem('rooot.seat.method', res.method); } catch (_) {}
          window.__seat.profile = body.profile;
          publish();
          fetchAlbum(res.pubkey); // a fresh claim may have just minted a new scarf -- refresh the album
          // DAS indexes the mint asynchronously -- one fetch can land BEFORE the new scarf
          // exists in the index (the Nº 027 empty-shelf sighting). Poll with backoff until
          // the asset appears (or give up quietly; the local keep is on the shelf either way).
          if (body.mint && body.mint.asset) {
            var want = body.mint.asset, delays = [2500, 5000, 10000, 20000];
            (function ensure(i) {
              if (i >= delays.length) return;
              setTimeout(function () {
                var have = (window.__album.scarves || []).some(function (s) { return s.asset === want; });
                if (have) return;
                fetchAlbum(res.pubkey);
                ensure(i + 1);
              }, delays[i]);
            })(0);
          }
          return { pubkey: res.pubkey, mint: body.mint };
        });
      });
    });
  }

  window.__seat = { status: state.status, pubkey: null, method: null, anonId: anonId(), profile: null, claim: claim, on: function (fn) { subs.push(fn); fn(snap()); } };
  window.__album = { scarves: [], record: null, next: null, on: function (fn) { albumSubs.push(fn); fn(albumSnap()); } };

  // SEAT: restore claimed status from a persisted pubkey (Task 8 review Fix 2) -- so a
  // returning fan's cabinet/album read-only views survive a reload without a fresh
  // Face-ID prompt. Only ever reads back the PUBLIC pubkey/method pair written in claim()
  // above; the derived secret is never persisted and is re-derived via the passkey the
  // next time something actually needs to sign.
  try {
    var pk = localStorage.getItem('rooot.seat.pubkey');
    if (pk) {
      state = nextSeat(state, { type: 'claimed', pubkey: pk, method: localStorage.getItem('rooot.seat.method') || 'passkey' });
      publish();
      fetchMe(pk);    // a returning fan's profile (displayName/sides/since) loads without a fresh claim
      fetchAlbum(pk); // a returning fan's album loads without a fresh claim
    }
  } catch (_) {}
})(typeof window !== 'undefined' ? window : this);
