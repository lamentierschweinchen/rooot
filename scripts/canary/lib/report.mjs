/**
 * PASS/FAIL/SKIPPED/PROVISIONAL table + JSON results file, per task-5-brief.md
 * point 4. One Report is built per run (one mode per process) and printed +
 * written at the end; the process exit code is nonzero iff any step FAILed
 * (SKIPPED/PROVISIONAL are informative, not failures).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const STATUS = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  SKIPPED: 'SKIPPED',
  PROVISIONAL: 'PROVISIONAL',
});

const VALID = new Set(Object.values(STATUS));

export class Report {
  constructor({ mode, web, ws, match }) {
    this.mode = mode;
    this.web = web;
    this.ws = ws;
    this.match = match;
    this.startedAt = new Date().toISOString();
    this.finishedAt = null;
    this.steps = [];
  }

  /** Record one flow-step result. Returns `status` so call sites can
   * `return report.add(...)` tersely. */
  add(name, status, detail = '', evidence) {
    if (!VALID.has(status)) throw new Error(`invalid status "${status}" for step "${name}"`);
    this.steps.push({ name, status, detail, evidence, atIso: new Date().toISOString() });
    return status;
  }

  finish() {
    this.finishedAt = new Date().toISOString();
    return this;
  }

  summary() {
    const s = { PASS: 0, FAIL: 0, SKIPPED: 0, PROVISIONAL: 0 };
    for (const step of this.steps) s[step.status] += 1;
    return s;
  }

  /** Nonzero exit iff at least one step FAILed — matches the brief exactly
   * ("nonzero exit on FAIL"): SKIPPED/PROVISIONAL never fail the run alone. */
  exitCode() {
    return this.steps.some((s) => s.status === STATUS.FAIL) ? 1 : 0;
  }

  printTable() {
    const header = ['STATUS', 'STEP', 'DETAIL'];
    const rows = this.steps.map((s) => [s.status, s.name, s.detail || '']);
    const wStatus = Math.max(header[0].length, ...rows.map((r) => r[0].length));
    const wStep = Math.max(header[1].length, ...rows.map((r) => r[1].length));
    const termWidth = process.stdout.columns || 120;
    const detailWidth = Math.max(20, termWidth - wStatus - wStep - 6);

    const line = (a, b, c) => `${String(a).padEnd(wStatus)}  ${String(b).padEnd(wStep)}  ${c}`;
    console.log('');
    console.log(`ROOOT canary — mode=${this.mode}  web=${this.web}  ws=${this.ws}  match=${this.match}`);
    console.log(`started ${this.startedAt}  finished ${this.finishedAt ?? '(running)'}`);
    console.log('-'.repeat(Math.min(termWidth, wStatus + wStep + detailWidth + 6)));
    console.log(line(...header));
    console.log('-'.repeat(Math.min(termWidth, wStatus + wStep + detailWidth + 6)));
    for (const [status, name, detail] of rows) {
      // wrap long details onto continuation lines rather than truncating evidence
      const words = String(detail).split(' ');
      let lineBuf = '';
      const chunks = [];
      for (const w of words) {
        if ((lineBuf + ' ' + w).trim().length > detailWidth) { chunks.push(lineBuf.trim()); lineBuf = w; }
        else lineBuf = (lineBuf + ' ' + w).trim();
      }
      if (lineBuf) chunks.push(lineBuf);
      console.log(line(status, name, chunks[0] ?? ''));
      for (const c of chunks.slice(1)) console.log(line('', '', c));
    }
    console.log('-'.repeat(Math.min(termWidth, wStatus + wStep + detailWidth + 6)));
    const s = this.summary();
    console.log(`${s.PASS} pass   ${s.FAIL} fail   ${s.SKIPPED} skipped   ${s.PROVISIONAL} provisional   (exit ${this.exitCode()})`);
    console.log('');
  }

  toJSON() {
    return {
      mode: this.mode,
      web: this.web,
      ws: this.ws,
      match: this.match,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      steps: this.steps,
      summary: this.summary(),
      exitCode: this.exitCode(),
    };
  }

  writeFile(path) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(this.toJSON(), null, 2));
    return path;
  }
}
