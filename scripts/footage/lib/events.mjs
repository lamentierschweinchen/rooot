/**
 * events.jsonl -- the tagged timeline the editor scrubs instead of hours of
 * video. One line per event: { tMs, iso, type, detail } (tMs/type/detail per
 * the brief; iso added so a human can read the file raw). Appends are
 * synchronous so a line is on disk before anything else happens -- if the rig
 * dies, the timeline is complete up to the death.
 *
 * BOUNDED BY CONSTRUCTION (Jul 13, post-OOM). Every subsystem -- watcher,
 * recorder, tagger, disk guard -- funnels through log(), which had no ceiling.
 * During the OOM nights an upstream flood (a thrashing service spraying frames;
 * an ENOSPC append spinning) wrote here without bound and grew ONE events.jsonl
 * to ~200 GB, filling a quarter of the disk. Two guards now cap it, both here
 * so no caller has to remember them:
 *
 *   1. Hard byte ceiling (RIG_EVENTLOG_MAX_MB, default 256 MB). Past it the
 *      file is frozen: one `event-log-capped` line, then nothing. The console
 *      keeps printing and the rest of the rig (recording, disk guard, watcher)
 *      is untouched -- only the file stops growing.
 *   2. Hot-loop collapse. The SAME event type hammering with nothing else
 *      interleaved is a subsystem failing in a loop, not a timeline. The first
 *      few are kept as evidence; the rest fold into a periodic
 *      `event-repeat-collapsed` tally instead of a million identical lines --
 *      so the ceiling is never wasted on a hot loop, and neither is the console.
 *
 * A legitimate multi-hour timeline is a few MB; the ceiling sits far above that
 * and ~1000x below the blowout.
 */
import { appendFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_MAX_MB = Number(process.env.RIG_EVENTLOG_MAX_MB) || 256;
const REPEAT_LIMIT = 50;      // same type this many times in a row -> start folding
const REPEAT_FLUSH = 10_000;  // ...emitting a running tally at most this often
const APPEND_FAIL_LIMIT = 20; // consecutive disk-write failures -> stop trying

export class EventLog {
  constructor(filePath, { maxBytes = DEFAULT_MAX_MB * 1024 * 1024 } = {}) {
    this.path = filePath;
    this.maxBytes = maxBytes;
    mkdirSync(path.dirname(filePath), { recursive: true });
    // Seed from any existing file so the ceiling is on real file size, not just
    // this process's contribution (a rerun into the same out/ still stays capped).
    let existing = 0;
    try { existing = statSync(filePath).size; } catch { /* fresh file */ }
    this.bytesWritten = existing;
    this.capped = false;
    this._appendFails = 0;
    this._repeatType = null;
    this._repeatCount = 0;
  }

  /** Append one already-serialized line to disk, honoring the ceiling. Never
   * throws, never recurses through the guards. */
  _writeToFile(line) {
    if (this.capped) return;
    const len = Buffer.byteLength(line);
    if (this.bytesWritten + len > this.maxBytes) {
      this.capped = true;
      const note = JSON.stringify({
        tMs: Date.now(), iso: new Date().toISOString(),
        type: 'event-log-capped',
        detail: { maxBytes: this.maxBytes, bytesWritten: this.bytesWritten },
      }) + '\n';
      try { appendFileSync(this.path, note); } catch { /* nothing more we can do */ }
      console.error(`[rig] events.jsonl hit its ${Math.round(this.maxBytes / (1024 * 1024))}MB ceiling -- file frozen (console continues)`);
      return;
    }
    try {
      appendFileSync(this.path, line);
      this.bytesWritten += len;
      this._appendFails = 0;
    } catch (err) {
      // Disk full / IO error: don't spin. After a few tries, freeze the file so
      // a failing append can't become its own hot loop.
      if (++this._appendFails >= APPEND_FAIL_LIMIT && !this.capped) {
        this.capped = true;
        console.error(`[rig] events.jsonl: ${APPEND_FAIL_LIMIT} consecutive append failures (${err}) -- file frozen (console continues)`);
      }
    }
  }

  /** Write a record to file (through the ceiling) and, when asked, to console. */
  _emit(rec, toConsole) {
    this._writeToFile(JSON.stringify(rec) + '\n');
    if (toConsole) {
      const d = rec.detail == null ? '' : ' ' + JSON.stringify(rec.detail);
      console.log(`[rig] ${rec.iso} ${rec.type}${d}`);
    }
  }

  log(type, detail = null) {
    const rec = { tMs: Date.now(), iso: new Date().toISOString(), type, detail };

    if (type === this._repeatType) {
      // A streak of the same type. Keep the first REPEAT_LIMIT for evidence,
      // then hold the rest behind an occasional tally (file AND console).
      this._repeatCount += 1;
      if (this._repeatCount <= REPEAT_LIMIT) {
        this._emit(rec, true);
      } else if (this._repeatCount % REPEAT_FLUSH === 0) {
        this._emit({ tMs: rec.tMs, iso: rec.iso, type: 'event-repeat-collapsed',
          detail: { repeatedType: type, count: this._repeatCount } }, true);
      }
      return rec;
    }

    // Type changed: if we were holding a folded streak, close it with a final
    // tally so the count is never silently lost. Then record this event.
    if (this._repeatCount > REPEAT_LIMIT) {
      this._emit({ tMs: rec.tMs, iso: rec.iso, type: 'event-repeat-collapsed',
        detail: { repeatedType: this._repeatType, count: this._repeatCount, final: true } }, true);
    }
    this._repeatType = type;
    this._repeatCount = 1;
    this._emit(rec, true);
    return rec;
  }
}
