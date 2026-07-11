/**
 * events.jsonl -- the tagged timeline the editor scrubs instead of hours of
 * video. One line per event: { tMs, iso, type, detail } (tMs/type/detail per
 * the brief; iso added so a human can read the file raw). Appends are
 * synchronous so a line is on disk before anything else happens -- if the rig
 * dies, the timeline is complete up to the death.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export class EventLog {
  constructor(filePath) {
    this.path = filePath;
    mkdirSync(path.dirname(filePath), { recursive: true });
  }

  log(type, detail = null) {
    const rec = { tMs: Date.now(), iso: new Date().toISOString(), type, detail };
    try {
      appendFileSync(this.path, JSON.stringify(rec) + '\n');
    } catch (err) {
      console.error(`[rig] events.jsonl append failed: ${err}`);
    }
    const d = detail == null ? '' : ' ' + JSON.stringify(detail);
    console.log(`[rig] ${rec.iso} ${type}${d}`);
    return rec;
  }
}
