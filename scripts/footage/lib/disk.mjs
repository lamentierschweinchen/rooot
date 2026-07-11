/**
 * Bounded disk: the rig must NEVER take the machine down. Polls the out dir's
 * total size; warns once past `warnBytes` (2GB), and past `stopBytes` (4GB)
 * stops ALL recording (the event watcher stays up -- events.jsonl is cheap
 * and the timeline should survive even a disk-capped night).
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fmtBytes } from './util.mjs';

const GB = 1024 ** 3;

function dirBytes(root) {
  let total = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue; // dir raced away (tmp video moved) -- fine
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(p);
      } else {
        try { total += statSync(p).size; } catch { /* raced away */ }
      }
    }
  }
  return total;
}

export class DiskGuard {
  constructor({ dir, log, warnBytes = 2 * GB, stopBytes = 4 * GB, pollMs = 30_000, infoEveryMs = 600_000, onStop = () => {} }) {
    this.dir = dir;
    this.log = log;
    this.warnBytes = warnBytes;
    this.stopBytes = stopBytes;
    this.pollMs = pollMs;
    this.infoEveryMs = infoEveryMs;
    this.onStop = onStop;
    this.warned = false;
    this.stopped = false;
    this.lastBytes = 0;
    this.lastInfoMs = 0;
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => this.check(), this.pollMs);
    this.timer.unref?.();
    this.check();
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  check() {
    let total;
    try {
      total = dirBytes(this.dir);
    } catch {
      return;
    }
    this.lastBytes = total;
    const now = Date.now();
    if (now - this.lastInfoMs >= this.infoEveryMs) {
      this.lastInfoMs = now;
      this.log.log('disk', { bytes: total, human: fmtBytes(total) });
    }
    if (total > this.warnBytes && !this.warned) {
      this.warned = true;
      this.log.log('disk-warn', { bytes: total, human: fmtBytes(total), warnAt: fmtBytes(this.warnBytes) });
    }
    if (total > this.stopBytes && !this.stopped) {
      this.stopped = true;
      this.log.log('disk-stop', {
        bytes: total,
        human: fmtBytes(total),
        stopAt: fmtBytes(this.stopBytes),
        action: 'stopping ALL recording now; the event watcher and events.jsonl stay up',
      });
      this.onStop();
    }
  }
}
