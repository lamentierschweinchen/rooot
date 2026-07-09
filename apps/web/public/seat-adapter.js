/*
 * ROOOT — SEAT interface (coordinator lane: identity -> window.__seat).
 * Mirrors window.__stands/__match: surfaces read __seat, never touch WebAuthn/Privy.
 * Pure core (nextSeat/bindPayload) is Node-testable via scripts/_seat-test.mjs.
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
  function bindPayload(anonId, passRaw) {
    var out = { anonId: anonId, side: null, call: null };
    try { var p = JSON.parse(passRaw); if (p && typeof p === 'object') { out.side = p.side || null; out.call = p.call || null; } } catch (_) {}
    return out;
  }
  root.nextSeat = nextSeat; root.bindPayload = bindPayload;
  if (typeof module !== 'undefined' && module.exports) module.exports = { nextSeat: nextSeat, bindPayload: bindPayload };
  if (typeof window === 'undefined') return;

  var state = nextSeat(undefined, { type: 'reset' });
  var subs = [];
  function anonId() { try { return localStorage.getItem('rooot.anonId'); } catch (_) { return null; } }
  function fire() { for (var i = 0; i < subs.length; i++) try { subs[i](snap()); } catch (e) {} }
  function snap() { return { status: state.status, pubkey: state.pubkey, method: state.method, anonId: anonId(), profile: window.__seat && window.__seat.profile || null }; }
  function publish() { window.__seat.status = state.status; window.__seat.pubkey = state.pubkey; window.__seat.method = state.method; window.__seat.anonId = anonId(); fire(); }

  // claim(): passkey hero first (Task 11 wires the resolver); Privy fallback (Task 7).
  // Until those land, claim() rejects so callers degrade to honest-anonymous.
  function claim() {
    var resolver = root.__seatClaimResolver;
    if (typeof resolver !== 'function') return Promise.reject(new Error('no claim mechanism available'));
    return resolver({ anonId: anonId(), pass: (function () { try { return localStorage.getItem('rooot.pass'); } catch (_) { return null; } })() })
      .then(function (res) { state = nextSeat(state, { type: 'claimed', pubkey: res.pubkey, method: res.method }); if (res.profile) window.__seat.profile = res.profile; publish(); return res.pubkey; });
  }

  window.__seat = { status: state.status, pubkey: null, method: null, anonId: anonId(), profile: null, claim: claim, on: function (fn) { subs.push(fn); fn(snap()); } };
})(typeof window !== 'undefined' ? window : this);
