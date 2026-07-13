/**
 * eventlog-cap-check -- proves the two guards that close the Jul-13 OOM
 * follow-up on the real EventLog (lib/events.mjs), not a mock:
 *
 *   A. hot-loop collapse   -- 1,000,000 identical events must NOT become
 *                             1,000,000 lines (nor 1,000,000 console prints).
 *   B. hard byte ceiling   -- varied events past the ceiling must freeze the
 *                             file at the bound, ending with `event-log-capped`.
 *   C. healthy timeline     -- a normal run is untouched: every line lands,
 *                             nothing is capped, nothing is collapsed.
 *   D. append-failure freeze -- a file that can't be written (disk-full stand-in)
 *                             stops after APPEND_FAIL_LIMIT tries, never spins.
 *
 * Deterministic, no browser, no network. Exits non-zero on any failure.
 *   node dev/eventlog-cap-check.mjs   (or: npm run check:eventlog-cap)
 */
import { EventLog } from '../lib/events.mjs';
import { mkdtempSync, rmSync, statSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const results = [];
function check(name, pass, note = '') {
  results.push({ name, pass });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${note ? ' -- ' + note : ''}`);
}

// Silence + count console.{log,error} so a flood test doesn't spam the terminal
// AND so we can assert the console itself isn't hot-looping.
function withCountedConsole(fn) {
  const realLog = console.log, realErr = console.error;
  const c = { log: 0, err: 0 };
  console.log = () => { c.log += 1; };
  console.error = () => { c.err += 1; };
  try { fn(c); } finally { console.log = realLog; console.error = realErr; }
  return c;
}

const dir = mkdtempSync(path.join(tmpdir(), 'rooot-eventlog-'));
const lines = (p) => readFileSync(p, 'utf8').split('\n').filter(Boolean);

try {
  // ── A. hot-loop collapse ────────────────────────────────────────────────
  {
    const p = path.join(dir, 'a.jsonl');
    const log = new EventLog(p, { maxBytes: 256 * 1024 * 1024 });
    const N = 1_000_000;
    const c = withCountedConsole(() => { for (let i = 0; i < N; i++) log.log('page-reopen', { i }); });
    const ls = lines(p);
    const bytes = statSync(p).size;
    const hasTally = ls.some((l) => l.includes('event-repeat-collapsed'));
    check('A1 1e6 identical events -> < 1000 file lines', ls.length < 1000, `${ls.length} lines`);
    check('A2 console not hot-looped (< 1000 prints)', c.log < 1000, `${c.log} prints`);
    check('A3 file stays tiny (< 1 MB) despite 1e6 events', bytes < 1_000_000, `${bytes} bytes`);
    check('A4 folded events are accounted (event-repeat-collapsed present)', hasTally);
  }

  // ── B. hard byte ceiling ────────────────────────────────────────────────
  {
    const p = path.join(dir, 'b.jsonl');
    const cap = 64 * 1024;
    const log = new EventLog(p, { maxBytes: cap });
    // unique type every line so the repeat-collapse never engages -- isolates
    // the ceiling as the ONLY thing that can stop growth.
    withCountedConsole(() => { for (let i = 0; i < 20_000; i++) log.log(`evt-${i}`, { i, pad: 'xxxxxxxxxxxxxxxx' }); });
    const bytes = statSync(p).size;
    const txt = readFileSync(p, 'utf8');
    check('B1 file frozen at/under ceiling', bytes <= cap + 512, `${bytes} <= ${cap + 512}`);
    check('B2 capped flag set', log.capped === true);
    check('B3 ends with event-log-capped marker', txt.includes('event-log-capped'));
    check('B4 far fewer lines than the 20k attempted', lines(p).length < 20_000, `${lines(p).length} lines`);
  }

  // ── C. healthy timeline untouched ───────────────────────────────────────
  {
    const p = path.join(dir, 'c.jsonl');
    const log = new EventLog(p);
    const types = ['rig-start', 'segment-open', 'odds-sample', 'goal', 'segment-close',
      'crowd-sample', 'watcher-open', 'segment-open', 'status-change', 'segment-close'];
    withCountedConsole(() => { for (const t of types) log.log(t, { ok: true }); });
    const ls = lines(p);
    check('C1 every healthy line lands', ls.length === types.length, `${ls.length}/${types.length}`);
    check('C2 nothing capped', log.capped === false);
    check('C3 nothing collapsed', !ls.some((l) => l.includes('event-repeat-collapsed')));
  }

  // ── D. append-failure freeze (disk-full stand-in) ───────────────────────
  {
    const p = path.join(dir, 'd.jsonl');
    const log = new EventLog(p);
    log.log('rig-start', {}); // creates the file
    let froze = false;
    try {
      chmodSync(p, 0o000); // now every append throws EACCES, like ENOSPC would
      withCountedConsole(() => { for (let i = 0; i < 40; i++) log.log(`evt-${i}`, { i }); });
      froze = log.capped === true;
    } finally {
      try { chmodSync(p, 0o644); } catch { /* best effort for cleanup */ }
    }
    check('D1 unwritable file freezes after the fail limit (no spin)', froze);
  }
} finally {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp dir */ }
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${failed === 0 ? 'ALL GREEN' : failed + ' FAILED'} -- ${results.length - failed}/${results.length} checks passed`);
process.exit(failed === 0 ? 0 : 1);
