/**
 * Video capture. One SurfaceRecorder per continuous surface (loom, ground):
 * a loop of Playwright contexts at phone viewport (390x844, deviceScaleFactor
 * 2 -> 780x1688 video for crisp frames), each context recording ONE segment.
 * Playwright finalizes a recordVideo file only when its context closes, so
 * "new segment" = close context + reopen -- which is exactly the hygiene the
 * brief wants: a goal's segment gets closed (and is henceforth safe on disk)
 * ~20s after the goal, so a later rig death can never corrupt the file that
 * holds the money moment. Expect a ~2-4s capture gap at each rotation.
 *
 * Read-only discipline: every context gets lib/wsTap.mjs's init script
 * (allowlist ON, host pinned) before any page script runs; the rig never
 * clicks, types, or evaluates anything in the page beyond a liveness ping
 * (`1`) and reading the tap's own log.
 *
 * Resilience: page crash / unexpected close / hang (2 missed liveness pings)
 * ends the segment, salvages the video, logs it, and reopens with backoff.
 * A dead browser relaunches via BrowserHost (single-flight). The loop only
 * exits on shutdown()/disk-cap.
 */
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { initScript, isAllowedFrame, readTap, summarizeTap } from './wsTap.mjs';
import { safeStamp, sanitizeTag, sleep, withTimeout } from './util.mjs';

const VIEWPORT = { width: 390, height: 844 };
/** Video at the viewport's own size. Verified against production (Jul 11):
 * headless Chromium's screencast emits frames at CSS-pixel size regardless of
 * deviceScaleFactor, and Playwright pads (never upscales) into a larger
 * recordVideo.size -- a 780x1688 target produced a 390x844 image sitting in
 * a gray canvas. Full-frame 390x844 is the honest phone capture;
 * deviceScaleFactor 2 below still gives authentic mobile rendering (media
 * queries, 2x asset selection). */
const VIDEO_SIZE = { width: 390, height: 844 };
export const SEGMENT_MS = 10 * 60_000; // the timer rotation
export const POST_EVENT_ROLL_MS = 20_000; // keep the goal + its eruption INSIDE the closing file
const WATCHDOG_INTERVAL_MS = 25_000;
const WATCHDOG_TIMEOUT_MS = 8_000;
const NAV_TIMEOUT_MS = 30_000;
export const BEAUTY_SECONDS = 30;

function contextOptions(tmpDir) {
  return {
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    recordVideo: { dir: tmpDir, size: VIDEO_SIZE },
  };
}

/** Owns the one Chromium process; relaunches it (single-flight) if it dies. */
export class BrowserHost {
  constructor({ headed = false, log }) {
    this.headed = headed;
    this.log = log;
    this.browser = null;
    this.launching = null;
    this.closed = false;
  }

  async get() {
    if (this.closed) throw new Error('browser host closed');
    if (this.browser && this.browser.isConnected()) return this.browser;
    if (!this.launching) {
      const isRelaunch = this.browser !== null;
      this.launching = chromium
        .launch({ headless: !this.headed })
        .then((b) => {
          this.browser = b;
          this.launching = null;
          if (isRelaunch) this.log.log('browser-relaunch', {});
          b.on('disconnected', () => {
            if (this.browser === b) this.browser = null;
          });
          return b;
        })
        .catch((err) => {
          this.launching = null;
          throw err;
        });
    }
    return this.launching;
  }

  async close() {
    this.closed = true;
    const b = this.browser;
    this.browser = null;
    if (b) {
      try { await b.close(); } catch { /* already gone */ }
    }
  }
}

export class SurfaceRecorder {
  constructor({ surface, url, wsHost, log, host, onTap = () => {}, segmentsDir, tmpDir, segmentMs = SEGMENT_MS, postEventMs = POST_EVENT_ROLL_MS }) {
    this.surface = surface;
    this.url = url;
    this.wsHost = wsHost;
    this.log = log;
    this.host = host;
    this.onTap = onTap;
    this.segmentsDir = segmentsDir;
    this.tmpDir = tmpDir;
    this.segmentMs = segmentMs;
    this.postEventMs = postEventMs;
    mkdirSync(segmentsDir, { recursive: true });
    mkdirSync(tmpDir, { recursive: true });

    this.running = false;
    this.done = null;
    this.page = null; // exposed for --chaos-kill (verification only)
    this.closingOnPurpose = false;
    this.pendingTag = null;
    this.rotateTimer = null;
    this._wakeResolve = null;
    this._wokenWith = null;
  }

  start() {
    if (this.done) return;
    this.running = true;
    this.done = this._run();
  }

  /** Graceful stop: ends + salvages the current segment, then exits the loop. */
  async shutdown(tag = 'end') {
    this.running = false;
    this._wake({ kind: 'shutdown', tag });
    if (this.done) await this.done;
  }

  /** Called on every goal/status event: rotate the segment `postEventMs`
   * later so the drama's aftermath lands INSIDE the file being closed.
   * One rotation pending at a time; a newer event just refreshes the tag. */
  requestRotate(tag) {
    if (!this.running) return;
    this.pendingTag = tag;
    if (this.rotateTimer) return;
    this.rotateTimer = setTimeout(() => {
      this.rotateTimer = null;
      this._wake({ kind: 'event', tag: this.pendingTag });
    }, this.postEventMs);
  }

  _wake(reason) {
    if (this._wakeResolve) {
      const r = this._wakeResolve;
      this._wakeResolve = null;
      r(reason);
    } else if (!this._wokenWith) {
      this._wokenWith = reason;
    }
  }

  _waitWake() {
    if (this._wokenWith) {
      const r = this._wokenWith;
      this._wokenWith = null;
      return Promise.resolve(r);
    }
    return new Promise((resolve) => {
      this._wakeResolve = resolve;
    });
  }

  async _run() {
    let backoff = 3000;
    while (this.running) {
      let wake = null;
      try {
        wake = await this._recordOneSegment();
        if (wake && (wake.kind === 'timer' || wake.kind === 'event' || wake.kind === 'shutdown')) backoff = 3000;
      } catch (err) {
        this.log.log('recorder-error', { surface: this.surface, err: String((err && err.stack) || err).slice(0, 500) });
      }
      if (!this.running) break;
      const troubled = !wake || wake.kind === 'crash' || wake.kind === 'hang' || wake.kind === 'nav-fail';
      if (troubled) {
        this.log.log('page-reopen', { surface: this.surface, afterMs: backoff, reason: wake ? wake.kind : 'error' });
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 30_000);
      }
    }
  }

  async _recordOneSegment() {
    const browser = await this.host.get();
    const startedIso = safeStamp();
    const startMs = Date.now();
    const context = await browser.newContext(contextOptions(this.tmpDir));
    let video = null;
    let wake = { kind: 'error', tag: 'error' };
    let crashed = false;
    const consoleErrors = [];
    let segTimer = null;
    let watchdog = null;

    try {
      await context.addInitScript(initScript, { wsHost: this.wsHost, enforceAllowlist: true });
      const page = await context.newPage();
      this.page = page;
      video = page.video();
      page.on('console', (msg) => {
        if (msg.type() === 'error' && consoleErrors.length < 20) consoleErrors.push(msg.text().slice(0, 200));
      });
      page.on('pageerror', (err) => {
        if (consoleErrors.length < 20) consoleErrors.push(String(err).slice(0, 200));
      });
      page.on('crash', () => {
        crashed = true;
        this._wake({ kind: 'crash', tag: 'crash' });
      });
      page.on('close', () => {
        if (!this.closingOnPurpose) {
          crashed = true;
          this._wake({ kind: 'crash', tag: 'crash' });
        }
      });

      let navError = null;
      try {
        await page.goto(this.url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
      } catch (err) {
        navError = String(err).slice(0, 300);
      }

      if (navError && !crashed) {
        wake = { kind: 'nav-fail', tag: 'nav-fail' };
        this.log.log('nav-fail', { surface: this.surface, url: this.url, err: navError });
      } else {
        this.log.log('segment-open', { surface: this.surface, startedIso, url: this.url });
        segTimer = setTimeout(() => this._wake({ kind: 'timer', tag: 'timer' }), this.segmentMs);
        let misses = 0;
        const livenessTick = async () => {
          if (crashed || !this.running) return;
          const ok = await Promise.race([
            page.evaluate('1').then(() => true).catch(() => false),
            sleep(WATCHDOG_TIMEOUT_MS).then(() => false),
          ]);
          if (ok) {
            misses = 0;
            return;
          }
          misses += 1;
          if (misses >= 2 && !crashed) {
            crashed = true;
            this._wake({ kind: 'hang', tag: 'hang' });
          }
        };
        watchdog = setInterval(() => { void livenessTick(); }, WATCHDOG_INTERVAL_MS);
        wake = await this._waitWake();
      }
    } finally {
      if (segTimer) clearTimeout(segTimer);
      if (watchdog) clearInterval(watchdog);
      if (this.rotateTimer) { clearTimeout(this.rotateTimer); this.rotateTimer = null; }
      this.pendingTag = null;
      const tag = wake.tag || wake.kind;

      // evidence first: read the tap off the page (guarded -- may be hung/dead)
      let tap = null;
      if (this.page && !this.page.isClosed()) {
        tap = await withTimeout(readTap(this.page), 5000, null);
      }

      this.closingOnPurpose = true;
      try { await context.close(); } catch { /* browser may be gone */ }
      this.closingOnPurpose = false;
      this.page = null;

      if (wake.kind === 'crash' || wake.kind === 'hang') {
        this.log.log('page-crash', { surface: this.surface, reason: wake.kind });
      }

      if (video) {
        const file = `${this.surface}-${startedIso}-${sanitizeTag(tag)}.webm`;
        const finalPath = path.join(this.segmentsDir, file);
        try {
          await video.saveAs(finalPath);
          await video.delete().catch(() => {});
          const bytes = statSync(finalPath).size;
          const tapSummary = summarizeTap(tap);
          this.onTap(tapSummary);
          if (tap) {
            // belt-and-suspenders: anything that DID reach the network must be allowlisted
            const leaked = tap.sends.filter((s) => !isAllowedFrame(s.data));
            if (leaked.length) {
              this.log.log('tap-violation', { surface: this.surface, leaked: leaked.slice(0, 3) });
            }
          }
          this.log.log('segment-close', {
            surface: this.surface,
            file,
            bytes,
            seconds: Math.round((Date.now() - startMs) / 1000),
            endTag: tag,
            consoleErrors: consoleErrors.length,
            firstConsoleErrors: consoleErrors.slice(0, 2),
            tap: tapSummary,
          });
        } catch (err) {
          this.log.log('segment-lost', { surface: this.surface, endTag: tag, err: String(err).slice(0, 300) });
        }
      }
    }
    return wake;
  }
}

/** One 30s pass over a still surface (home / gate / stadium) -- same
 * viewport, same tap, zero interaction; runs once at rig start. */
export async function beautyPass({ host, surface, url, wsHost, log, onTap = () => {}, segmentsDir, tmpDir, seconds = BEAUTY_SECONDS }) {
  mkdirSync(segmentsDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });
  const browser = await host.get();
  const startedIso = safeStamp();
  const context = await browser.newContext(contextOptions(tmpDir));
  let video = null;
  try {
    await context.addInitScript(initScript, { wsHost, enforceAllowlist: true });
    const page = await context.newPage();
    video = page.video();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    await sleep(seconds * 1000);
    const tap = await withTimeout(readTap(page), 5000, null);
    const tapSummary = summarizeTap(tap);
    onTap(tapSummary);
    try { await context.close(); } catch { /* salvage below regardless */ }
    const file = `beauty-${surface}-${startedIso}.webm`;
    const finalPath = path.join(segmentsDir, file);
    await video.saveAs(finalPath);
    await video.delete().catch(() => {});
    log.log('beauty-close', { surface, file, bytes: statSync(finalPath).size, seconds, tap: tapSummary });
  } catch (err) {
    try { await context.close(); } catch { /* already closed */ }
    if (video) {
      try { await video.saveAs(path.join(segmentsDir, `beauty-${surface}-${startedIso}-partial.webm`)); } catch { /* nothing to salvage */ }
    }
    throw err;
  }
}
