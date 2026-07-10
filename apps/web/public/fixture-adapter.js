/*
 * ROOOT — FIXTURE ADAPTER (coordinator lane: /fixture.json -> window.__fixture).
 *
 * ONE manifest fetch, script-order-independent: window.__fixtureReady ||= fetch(...)
 * is the shared idiom every consumer uses (loom-adapter.js / stands-adapter.js /
 * stats-adapter.js / match-read.js each set this up too, so whichever script runs
 * first on a page does the ONE network fetch; this file does the same thing early
 * and additionally exposes the surface-facing sugar:
 *   window.__fixture.current  — the parsed manifest once loaded, else null
 *   window.__fixture.on(fn)   — fires now if already loaded, else once on load
 * for Design surfaces to build against when they migrate off their own hardcoded
 * fixture tables (not tonight's cutover — see vercel.json's /live rewrite note).
 *
 * Honesty: a fetch failure leaves `current` null forever — we never invent a
 * fixture. Consumers fall back to their own existing defaults.
 */
(function () {
  'use strict';
  window.__fixtureReady = window.__fixtureReady || fetch('/fixture.json')
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; });

  var listeners = [];
  var api = window.__fixture || {
    current: null,
    on: function (fn) {
      if (api.current) { try { fn(api.current); } catch (e) {} }
      else listeners.push(fn);
    }
  };
  window.__fixture = api;

  window.__fixtureReady.then(function (fx) {
    api.current = fx || null;   // fetch failure -> stays null, never a fake fixture
    if (fx) {
      var ls = listeners; listeners = [];
      for (var i = 0; i < ls.length; i++) { try { ls[i](fx); } catch (e) {} }
    }
  });
})();
