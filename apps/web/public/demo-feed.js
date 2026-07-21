/*
 * ROOOT — DEMO FEED PLAYER (the serverless transport for ?demo=1 with no ?ws).
 *
 * Plays the baked apps/web/public/plate/demo-suicol.js timeline
 * (window.__DEMO_SUICOL — a FeedMsg array as { atMs, msg }, sorted by atMs;
 * see scripts/bake-demo.ts) on a wall clock: the whole recorded match
 * (spans the original receivedAtMs range) is compressed into DEMO_SECONDS of
 * real time. Each entry's `msg` is handed to a registered onMsg callback at
 * its scaled moment — the exact same FeedMsg shape a live WebSocket message
 * carries, so crowd-sim.js / match-read.js need no per-transport branching
 * beyond picking WHICH source to call (see their connectFeed()).
 *
 * Ticks at 10Hz (every 100ms) rather than scheduling one setTimeout per
 * message — the baked feed carries ~4k entries; a single interval with a
 * cursor is simpler to reason about and immune to timer-pileup than
 * thousands of individually-scheduled timeouts.
 */
(function (root) {
  'use strict';

  var DEMO_SECONDS = 150; // the whole match plays out over this many real seconds

  /**
   * Play `feed` (sorted { atMs, msg }[]) into `onMsg`, compressed into
   * `demoSeconds` of wall-clock time — with dead-air gaps between messages
   * capped (see GAP_CAP_MS below) so a long stall in the recording (half-time,
   * a recorder reconnect) doesn't stall the weave. Returns { stop() }. Pure
   * enough to be Node-callable (no window/document reads) — only Date.now()/
   * setInterval are used, both available in Node too.
   */
  function play(feed, onMsg, demoSeconds) {
    var secs = typeof demoSeconds === 'number' && demoSeconds > 0 ? demoSeconds : DEMO_SECONDS;
    if (!feed || !feed.length) return { stop: function () {} };
    // The playhead runs over a COMPRESSED timeline, not raw receivedAtMs: the empty stretches in
    // the recording (the half-time break — a real ~226s dead gap in the eng-arg capture — and the
    // recorder's reconnect/rotation gaps) are capped so the weave never stalls on dead air. This
    // mirrors the live replay's own gap cap (services/stands/src/ingest/replay.ts caps inter-line
    // gaps at 5s). Honest: real messages, real order — only the empty time between them shrinks,
    // so the whole match weaves at an even, genuinely-fast pace across `secs` (owner: extreme
    // fast-forward). eff[k] = cumulative CAPPED ms elapsed up to message k.
    var GAP_CAP_MS = 5000;
    var eff = new Array(feed.length);
    eff[0] = 0;
    for (var k = 1; k < feed.length; k++) {
      var g = feed[k].atMs - feed[k - 1].atMs;
      if (!(g > 0)) g = 0; // out-of-order / same-instant merge → no advance
      eff[k] = eff[k - 1] + Math.min(g, GAP_CAP_MS);
    }
    var span = Math.max(1, eff[feed.length - 1]); // guard a degenerate single-tick feed
    var startWall = Date.now();
    var i = 0;
    var timer = setInterval(function () {
      var elapsedMs = Date.now() - startWall;
      var playhead = (elapsedMs / (secs * 1000)) * span; // wall-clock -> compressed timeline
      while (i < feed.length && eff[i] <= playhead) {
        try {
          onMsg(feed[i].msg);
        } catch (e) {}
        i++;
      }
      if (i >= feed.length) clearInterval(timer);
    }, 100);
    return {
      stop: function () {
        clearInterval(timer);
      },
      // skip to the end: drain every remaining message NOW (same order, same
      // messages — only the waiting goes). The whole page lands on FULL TIME
      // together, since every consumer rides this one playback.
      finish: function () {
        clearInterval(timer);
        while (i < feed.length) {
          try { onMsg(feed[i].msg); } catch (e) {}
          i++;
        }
      },
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { play: play, DEMO_SECONDS: DEMO_SECONDS };

  if (typeof window === 'undefined') return;
  // ONE shared playback, many subscribers — so every consumer in a window (crowd-sim,
  // match-read, loom-adapter, stats-adapter) rides the SAME clock instead of each spinning
  // its own drifting playback. Consumers all subscribe at page load, before the first 100ms
  // tick fires, so none miss the opening messages.
  var subs = [], player = null, feedData = null, feedSecs = DEMO_SECONDS;
  function ensurePlaying() {
    // an explicit startFeed() feed wins; then the bake the loader declared for this
    // match (__REPLAY_BAKE — the walkthrough now plays the final, not SUI-COL);
    // else the original SUI-COL default, so any surface that hasn't declared one is
    // untouched.
    var declared = window.__REPLAY_BAKE && window[window.__REPLAY_BAKE.global];
    var data = feedData || declared || window.__DEMO_SUICOL;
    if (player || !data) return;
    player = play(data, function (msg) {
      for (var i = 0; i < subs.length; i++) { try { subs[i](msg); } catch (e) {} }
    }, feedSecs);
  }
  window.__demoFeed = {
    DEMO_SECONDS: DEMO_SECONDS,
    subscribe: function (onMsg) { subs.push(onMsg); ensurePlaying(); return { stop: function () {} }; },
    start: function (onMsg) { return this.subscribe(onMsg); }, // alias — shares the one playback
    // Play a SPECIFIC baked feed (e.g. window.__DEMO_ENGARG for the /live sealed replay) instead of
    // the SUI-COL walkthrough default, optionally compressed into a different wall-clock window
    // (the /live hero wants an extreme fast-forward weave, not the 150s walkthrough pace).
    startFeed: function (data, onMsg, demoSeconds) {
      if (data) feedData = data;
      if (typeof demoSeconds === 'number' && demoSeconds > 0) feedSecs = demoSeconds;
      subs.push(onMsg); ensurePlaying(); return { stop: function () {} };
    },
    // skip the shared playback to its end (the loom's SKIP control) — no-op before it
    // starts; returns whether there was a playback to drain (sealed-first polls on this)
    finish: function () { if (!player) return false; player.finish(); return true; },
  };
})(typeof window !== 'undefined' ? window : this);
