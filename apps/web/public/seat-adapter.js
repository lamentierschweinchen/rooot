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
  function anonId() { try { return localStorage.getItem('rooot.anonId'); } catch (_) { return null; } }
  function fire() { for (var i = 0; i < subs.length; i++) try { subs[i](snap()); } catch (e) {} }
  function snap() { return { status: state.status, pubkey: state.pubkey, method: state.method, anonId: anonId(), profile: window.__seat && window.__seat.profile || null }; }
  function publish() { window.__seat.status = state.status; window.__seat.pubkey = state.pubkey; window.__seat.method = state.method; window.__seat.anonId = anonId(); fire(); }

  // claim(opts): opts.matchId is the match being claimed at -- the PRESSING page
  // (Task 8) passes it; YOUR SEAT's identity-only claim omits it. Resolves the
  // mechanism (passkey hero / Privy fallback), then makes the ONE central POST
  // that tells the server about the claim -- the server folds in the real
  // rooted-side/call when matchId names a live match (never invented client-side).
  function claim(opts) {
    var matchId = opts && opts.matchId;
    var id = anonId();
    return resolveMechanism(window.seatPasskey, window.__seatPrivyClaim, id).then(function (res) {
      var payload = { anonId: id, pubkey: res.pubkey, method: res.method };
      if (matchId) payload.matchId = matchId;
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
        window.__seat.profile = body.profile;
        publish();
        return { pubkey: res.pubkey, mint: body.mint };
      });
    });
  }

  window.__seat = { status: state.status, pubkey: null, method: null, anonId: anonId(), profile: null, claim: claim, on: function (fn) { subs.push(fn); fn(snap()); } };
})(typeof window !== 'undefined' ? window : this);
