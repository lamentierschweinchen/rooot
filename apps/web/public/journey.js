/*
 * ROOOT — JOURNEY (coordinator lane: this device's history -> window.__journey).
 *
 * matchday.js owns MATCH state (is this fixture upcoming, live, over?). Nothing
 * owned VISITOR state, so every surface inferred it: the gate's pass here, a
 * keepsake there, a bare anonId elsewhere. Each inferred slightly differently,
 * and all of them read "no pass" as "side = home" — which is how a stranger who
 * had never been here opened the finished final and was shown SPAIN · YOUR END,
 * seated in a row and a seat, holding a card that said 0 cheers, 0 minutes.
 *
 * This module answers ONE question the others can't: is this match YOURS, or are
 * you just looking at it? Everything else here is sugar on top of that bit.
 *
 * Beats, per match (phase × mine):
 *   COLD           no pass, never been — the promise, before the ask
 *   TICKETED       you hold a pass, it hasn't kicked off
 *   IN_IT          you hold a pass, the match is live
 *   SEALED_MINE    it's over, and you were here — the keepsake means something
 *   SEALED_THEIRS  it's over, and you weren't — the record, not a souvenir
 *
 * THE PASS IS A SINGLE SLOT. rooot.pass is one global key the next match's gate
 * overwrites, so "do you hold a pass for match A" goes false the moment you walk
 * through the door for match B. Reading attendance off the slot alone would
 * demote genuine attendees to SEALED_THEIRS and take away the keepsake they
 * earned — worse than the bug this fixes. So the gate now mirrors each pass to
 * rooot.pass.<matchId>, this module rescues an un-mirrored slot on load, and
 * `mine` also counts the traces attending leaves behind: a keepsake, a woven
 * cloth, or in-play calls. Passes destroyed by overwrites before the mirror
 * existed are gone; nothing here invents them back.
 *
 * THE WALKTHROUGH IS A REHEARSAL, NOT A NIGHT. Demo passes carry live:false
 * (gate.html). Outside a ?demo=1 document they are ignored everywhere, so
 * stamping the walkthrough door can never put a prediction, a point, or a match
 * lived into the real ledger.
 *
 * Honesty: this module reads; it never writes a record of anything happening.
 * Its one write is the rescue mirror of a pass this device already holds.
 *
 * Note on timing: `mine`/`passFor` read storage only and are correct immediately.
 * `beat` additionally needs matchday's phase, which arrives with fixture.json —
 * before that a sealed match reads COLD. Gate on `mine` for decisions that must
 * be right on the first frame; subscribe with `on()` for anything that renders a
 * beat.
 */
(function () {
  'use strict';

  var DEMO = /[?&]demo=1/.test(location.search);   // this document's own posture, never another's

  function readJSON(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  function sameId(a, b) { return String(a) === String(b); }

  // a rehearsal's pass/keepsake is real INSIDE the walkthrough and invisible outside it
  function rehearsal(rec) { return !!(rec && (rec.live === false || rec.demo === true)) && !DEMO; }

  function slotPass() { return readJSON('rooot.pass'); }
  function mirrorPass(id) { return readJSON('rooot.pass.' + id); }

  /* The pass for THIS match, wherever it survives: the live slot if it still
   * holds this match, else the per-match mirror the gate wrote at issuance. */
  function passFor(id) {
    if (id == null) return null;
    var slot = slotPass();
    var p = (slot && sameId(slot.matchId, id)) ? slot : mirrorPass(id);
    return rehearsal(p) ? null : (p || null);
  }

  /* Were you here? A pass proves you came through the door; a keepsake, a cloth,
   * or in-play calls prove it after the slot has moved on. Any one is enough. */
  function isMine(id) {
    if (id == null) return false;
    if (passFor(id)) return true;
    var kept = readJSON('rooot.kept.' + id);
    if (kept && !rehearsal(kept)) return true;
    var cloth = readJSON('rooot.cloth.' + id);
    if (cloth && !rehearsal(cloth)) return true;
    var calls = readJSON('rooot.calls.' + id);
    return !!(calls && calls.length);
  }

  function beat(id) {
    var phase = null;
    try { phase = window.__matchday ? window.__matchday.phaseOf(id) : null; } catch (e) {}
    if (phase === 'FULL_TIME') return isMine(id) ? 'SEALED_MINE' : 'SEALED_THEIRS';
    if (passFor(id)) return phase === 'LIVE' ? 'IN_IT' : 'TICKETED';
    return 'COLD';   // also the honest answer before the manifest lands: nothing claimed yet
  }

  /* THE RESCUE. A pass stamped before the mirror existed (or by a build that
   * predates it) lives only in the slot, one gate visit from deletion. Copy it
   * across, once, idempotently. Never from a rehearsal — the walkthrough must
   * not be able to mint a permanent record of a night you didn't attend. */
  function rescueMirror() {
    if (DEMO) return;
    var slot = slotPass();
    if (!slot || !slot.matchId || slot.live === false) return;
    var key = 'rooot.pass.' + slot.matchId;
    try {
      if (localStorage.getItem(key) == null) localStorage.setItem(key, JSON.stringify(slot));
    } catch (e) {}   // private mode / quota — the slot still works, we just can't harden it
  }

  var subs = [];
  function fire() { for (var i = 0; i < subs.length; i++) { try { subs[i](jn); } catch (e) {} } }

  var WATCHED = ['rooot.pass', 'rooot.pass.', 'rooot.kept.', 'rooot.cloth.', 'rooot.calls.'];
  function watched(k) {
    if (!k) return true;   // storage cleared wholesale — assume everything moved
    for (var i = 0; i < WATCHED.length; i++) if (k === WATCHED[i] || k.indexOf(WATCHED[i]) === 0) return true;
    return false;
  }

  var jn = {
    DEMO: DEMO,
    beat: beat,
    isMine: isMine,
    passFor: passFor,
    refresh: fire,   // this document just wrote a pass/keepsake — no storage event fires for us
    on: function (fn) {
      subs.push(fn);
      return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); };
    }
  };

  rescueMirror();

  // another tab wrote a pass or a keepsake; or the match itself turned over
  window.addEventListener('storage', function (e) { if (watched(e && e.key)) fire(); });
  try { if (window.__matchday) window.__matchday.on(fire); } catch (e) {}

  window.__journey = jn;
})();
