#!/usr/bin/env node
/**
 * ROOOT footage rig -- read-only live capture of the real product during real
 * matches, producing the raw material for the demo video.
 *
 *   node run.mjs --match 18213979 [--until 240] [--out <dir>]
 *
 * What it does (see README.md for the full story):
 *   - records /live (the loom) and /ground continuously at phone viewport in
 *     ~10-minute .webm segments, rotating on every goal/status change so a
 *     money moment's file is finalized and safe on disk ~20s after it happens;
 *   - runs three 30s beauty passes (home / gate / stadium) once at start;
 *   - keeps one raw read-only WebSocket on the match room and writes the
 *     tagged timeline to events.jsonl (kickoff, goals, status changes, cheer
 *     bursts, Pulse moments/reveals, sparse odds + crowd samples);
 *   - survives page crashes/hangs (close + reopen, logged) and a dead browser
 *     (relaunch), bounded by a disk guard (warn 2GB / stop-recording 4GB) and
 *     a hard --until deadline, so an unattended run always ends by itself.
 *
 * WRITE-FREE, IN CODE: every recorded page runs under the WebSocket tap
 * adapted from scripts/canary/lib/wsTap.mjs -- outgoing frames beyond the
 * bare (side-less) hello a lurking visitor sends are hard-blocked before the
 * native send(); hosts other than --ws are stubbed. The rig's own watcher
 * socket contains no send call at all. No clicks, no typing, ever.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, validateArgs, resolveUntilMs, HELP } from './lib/cli.mjs';
import { EventLog } from './lib/events.mjs';
import { startWatcher } from './lib/watcher.mjs';
import { Tagger } from './lib/tagger.mjs';
import { BrowserHost, SurfaceRecorder, beautyPass } from './lib/recorder.mjs';
import { DiskGuard } from './lib/disk.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`error: ${err.message ?? err}`);
    console.error(HELP);
    process.exit(2);
  }
  if (args.help) {
    console.log(HELP);
    return;
  }
  const errors = validateArgs(args);
  if (errors.length) {
    for (const e of errors) console.error(`error: ${e}`);
    console.error(HELP);
    process.exit(2);
  }

  const untilMs = resolveUntilMs(args.until);
  if (args.chaosKillSec > 0 && untilMs - Date.now() > 15 * 60_000) {
    console.error('error: --chaos-kill is a verification-only flag; refusing to arm it on a run longer than 15 minutes (--until).');
    process.exit(2);
  }

  const outDir = path.resolve(args.out || path.join(SCRIPT_DIR, 'out', args.match));
  const segmentsDir = path.join(outDir, 'segments');
  mkdirSync(segmentsDir, { recursive: true });

  const log = new EventLog(path.join(outDir, 'events.jsonl'));
  const wsHost = new URL(args.ws).host;
  log.log('rig-start', {
    match: args.match,
    web: args.web,
    ws: args.ws,
    wsHost,
    out: outDir,
    untilIso: new Date(untilMs).toISOString(),
    pid: process.pid,
    node: process.version,
  });

  // ── which URL is the loom tonight ─────────────────────────────────────
  // /live is the real front door (the footage should be OF the front door),
  // but it follows the DEPLOYED fixture pin. Read the public manifest
  // (read-only GET); if it pins a different match than --match, fall back to
  // the explicit ?match= form so the footage is of the requested fixture --
  // loudly logged, never silent.
  const wsQ = 'ws=' + encodeURIComponent(args.ws);
  let loomUrl = `${args.web}/live?${wsQ}`;
  try {
    const res = await fetch(`${args.web}/fixture.json`, { signal: AbortSignal.timeout(8000) });
    const mf = res.ok ? await res.json() : null;
    if (mf && String(mf.matchId) === args.match) {
      log.log('loom-url', { using: loomUrl, deployedPin: String(mf.matchId) });
    } else {
      loomUrl = `${args.web}/woven-loom?loomfeed=1&match=${encodeURIComponent(args.match)}&${wsQ}`;
      log.log('loom-url-fallback', {
        deployedPin: mf ? String(mf.matchId) : null,
        reason: mf ? 'deployed manifest pins a different match' : 'manifest unreachable/malformed',
        using: loomUrl,
      });
    }
  } catch (err) {
    loomUrl = `${args.web}/woven-loom?loomfeed=1&match=${encodeURIComponent(args.match)}&${wsQ}`;
    log.log('loom-url-fallback', { reason: `manifest fetch failed: ${String(err).slice(0, 200)}`, using: loomUrl });
  }

  const host = new BrowserHost({ headed: args.headed, log });

  // run-wide write-proof aggregate, reported at rig-stop
  const tapAggregate = { sends: 0, blockedSends: 0, blockedConnections: 0, sendTypes: {} };
  const onTap = (t) => {
    tapAggregate.sends += t.sends;
    tapAggregate.blockedSends += t.blockedSends;
    tapAggregate.blockedConnections += t.blockedConnections;
    for (const [k, v] of Object.entries(t.sendTypes)) tapAggregate.sendTypes[k] = (tapAggregate.sendTypes[k] || 0) + v;
  };

  const mkRecorder = (surface, url) =>
    new SurfaceRecorder({
      surface,
      url,
      wsHost,
      log,
      host,
      onTap,
      segmentsDir,
      tmpDir: path.join(outDir, '.tmp', surface),
    });

  const loomRec = mkRecorder('loom', loomUrl);
  const groundRec = mkRecorder('ground', `${args.web}/ground?live=1&match=${encodeURIComponent(args.match)}&${wsQ}`);
  const recorders = [loomRec, groundRec];

  let shuttingDown = false;

  for (const r of recorders) r.start();

  // ── beauty passes: home / gate / stadium, 30s each, once, sequential ──
  let beautyDone = Promise.resolve();
  if (!args.skipBeauty) {
    const passes = [
      ['home', `${args.web}/?${wsQ}`],
      ['gate', `${args.web}/gate?live=1&match=${encodeURIComponent(args.match)}&${wsQ}`],
      ['stadium', `${args.web}/stadium?live=1&match=${encodeURIComponent(args.match)}&${wsQ}`],
    ];
    beautyDone = (async () => {
      for (const [name, url] of passes) {
        if (shuttingDown) return;
        try {
          await beautyPass({ host, surface: name, url, wsHost, log, onTap, segmentsDir, tmpDir: path.join(outDir, '.tmp', `beauty-${name}`) });
        } catch (err) {
          log.log('beauty-fail', { surface: name, err: String(err).slice(0, 300) });
        }
      }
    })();
  }

  // ── the timeline: read-only watcher + tagger; money events rotate segments ──
  const tagger = new Tagger(log, {
    onMoneyEvent: (tag) => {
      for (const r of recorders) r.requestRotate(tag);
    },
  });
  const watcher = startWatcher({
    wsBase: args.ws,
    matchId: args.match,
    onMsg: (m) => {
      try {
        tagger.handle(m);
      } catch (err) {
        log.log('tagger-error', { err: String(err).slice(0, 300) });
      }
    },
    onLifecycle: (state, detail) => log.log(`watcher-${state}`, detail),
  });

  // ── bounded disk: warn 2GB, stop recording 4GB (watcher stays) ──
  const disk = new DiskGuard({
    dir: outDir,
    log,
    onStop: () => {
      for (const r of recorders) void r.shutdown('disk-cap');
    },
  });
  disk.start();

  // ── chaos (verification only): force-close the loom page mid-run ──
  let chaosTimer = null;
  if (args.chaosKillSec > 0) {
    chaosTimer = setTimeout(() => {
      const p = loomRec.page;
      log.log('chaos-kill', { surface: 'loom', pageAlive: !!(p && !p.isClosed()) });
      if (p && !p.isClosed()) void p.close().catch(() => {});
    }, args.chaosKillSec * 1000);
  }

  const untilTimer = setTimeout(() => void shutdown('until-reached'), Math.min(untilMs - Date.now(), 2 ** 31 - 1));

  async function shutdown(reason, code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    log.log('rig-stopping', { reason });
    clearTimeout(untilTimer);
    if (chaosTimer) clearTimeout(chaosTimer);
    disk.stop();
    await Promise.allSettled(recorders.map((r) => r.shutdown('end')));
    await Promise.allSettled([beautyDone]);
    watcher.close();
    await host.close();
    disk.check(); // final on-disk figure
    log.log('rig-stop', { reason, bytesOnDisk: disk.lastBytes, tap: tapAggregate });
    process.exit(code);
  }

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    try { log.log('rig-error', { err: String((err && err.stack) || err).slice(0, 800) }); } catch { /* logging must never re-throw */ }
    void shutdown('uncaughtException', 1);
  });
  process.on('unhandledRejection', (err) => {
    try { log.log('rig-error', { unhandledRejection: String((err && err.stack) || err).slice(0, 800) }); } catch { /* ditto */ }
  });
}

void main();
