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
   * `demoSeconds` of wall-clock time. Returns { stop() }. Pure enough to be
   * Node-callable (no window/document reads) — only Date.now()/setInterval
   * are used, both available in Node too.
   */
  function play(feed, onMsg, demoSeconds) {
    var secs = typeof demoSeconds === 'number' && demoSeconds > 0 ? demoSeconds : DEMO_SECONDS;
    if (!feed || !feed.length) return { stop: function () {} };
    var t0 = feed[0].atMs;
    var span = Math.max(1, feed[feed.length - 1].atMs - t0); // guard a degenerate single-tick feed
    var startWall = Date.now();
    var i = 0;
    var timer = setInterval(function () {
      var elapsedMs = Date.now() - startWall;
      var playheadAtMs = t0 + (elapsedMs / (secs * 1000)) * span; // wall-clock -> original timeline
      while (i < feed.length && feed[i].atMs <= playheadAtMs) {
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
    };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { play: play, DEMO_SECONDS: DEMO_SECONDS };

  if (typeof window === 'undefined') return;
  // ONE shared playback, many subscribers — so every consumer in a window (crowd-sim,
  // match-read, loom-adapter, stats-adapter) rides the SAME clock instead of each spinning
  // its own drifting playback. Consumers all subscribe at page load, before the first 100ms
  // tick fires, so none miss the opening messages.
  var subs = [], player = null;
  function ensurePlaying() {
    if (player || !window.__DEMO_SUICOL) return;
    player = play(window.__DEMO_SUICOL, function (msg) {
      for (var i = 0; i < subs.length; i++) { try { subs[i](msg); } catch (e) {} }
    }, DEMO_SECONDS);
  }
  window.__demoFeed = {
    DEMO_SECONDS: DEMO_SECONDS,
    subscribe: function (onMsg) { subs.push(onMsg); ensurePlaying(); return { stop: function () {} }; },
    start: function (onMsg) { return this.subscribe(onMsg); }, // alias — shares the one playback
  };
})(typeof window !== 'undefined' ? window : this);
