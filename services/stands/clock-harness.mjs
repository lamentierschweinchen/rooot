// Loads the REAL loom-adapter.js with mocked globals and drives the clock paths.
// Proves: (A) a phase-only status pre-kickoff never ticks a phantom minute;
// (B) a real kickoff ticks live; (C) warmup ledger chatter never anchors;
// (D) a mid-join ledger minute surfaces immediately.
import fs from 'node:fs';
const SRC = fs.readFileSync(new URL('../../apps/web/public/loom-adapter.js', import.meta.url), 'utf8');

function run(label, drive) {
  let NOW = 1_700_000_000_000;
  const clockCalls = [];
  const tickFns = [];
  const DateMock = { now: () => NOW };
  const win = {};
  win.__loom = {
    live() {}, odds() {}, tempo() {}, event() {}, score() {}, phase() {},
    pressure() {}, possession() {}, chalkOff() {},
    clock(m, r) { clockCalls.push({ m: +m.toFixed(3), r, at: NOW }); },
  };
  let wsInstance = null;
  function FakeWS() { this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null; wsInstance = this; }
  FakeWS.prototype.close = function () {};
  const loc = { search: '?site=1&match=18202701', pathname: '/live' };
  const setIntervalMock = (fn) => { tickFns.push(fn); return { unref() {} }; };
  const setTimeoutMock = () => 0;
  const fn = new Function(
    'window', 'location', 'WebSocket', 'console', 'setInterval', 'clearInterval', 'setTimeout', 'Date', 'URLSearchParams',
    SRC,
  );
  fn(win, loc, FakeWS, console, setIntervalMock, () => {}, setTimeoutMock, DateMock, URLSearchParams);
  if (wsInstance && wsInstance.onopen) wsInstance.onopen();
  const send = (obj) => wsInstance.onmessage({ data: JSON.stringify(obj) });
  const advance = (ms) => { NOW += ms; };
  const tick = (times = 1) => { for (let i = 0; i < times; i++) tickFns.forEach((f) => f()); };
  drive({ send, advance, tick });
  return clockCalls;
}

let pass = true;
const ok = (c, msg) => { console.log(`  ${c ? 'PASS' : 'FAIL'}: ${msg}`); if (!c) pass = false; };

// A — PHANTOM: phase-only status (no minute), then 3 real minutes of ticking.
{
  const calls = run('phantom', ({ send, advance, tick }) => {
    send({ type: 'status', ev: { phase: 'FIRST_HALF' } }); // running inferred, NO minute, no raw
    advance(3 * 60_000); tick(4);
  });
  const maxM = calls.reduce((m, c) => Math.max(m, c.m), 0);
  console.log('A) phase-only status, +3min:');
  ok(maxM === 0, `clock never surfaces a minute > 0 (max=${maxM}, calls=${calls.length}) — was freezing at ~2 before`);
}

// B — REAL KICKOFF: status FIRST_HALF, minute 0, Running true; then 90s.
{
  const calls = run('kickoff', ({ send, advance, tick }) => {
    send({ type: 'status', ev: { phase: 'FIRST_HALF', minute: 0, raw: { Clock: { Running: true, Seconds: 0 } } } });
    advance(90_000); tick(1);
  });
  const maxM = calls.reduce((m, c) => Math.max(m, c.m), 0);
  console.log('B) real kickoff (min 0, running), +90s:');
  ok(Math.abs(maxM - 1.5) < 0.05, `clock ticks live to ~1.5 (got ${maxM})`);
}

// C — WARMUP ledger must NOT anchor.
{
  const calls = run('warmup', ({ send, advance, tick }) => {
    send({ type: 'ledger', msg: { type: 'event', ev: { kind: 'warmup', minute: 2, id: 'w1', side: null } } });
    advance(3 * 60_000); tick(4);
  });
  const maxM = calls.reduce((m, c) => Math.max(m, c.m), 0);
  console.log('C) warmup ledger @min 2, +3min:');
  ok(maxM === 0, `warmup never anchors the clock (max=${maxM})`);
}

// D — MID-JOIN: a live ledger event carries the current minute -> surfaces at once.
{
  const calls = run('midjoin', ({ send }) => {
    send({ type: 'ledger', msg: { type: 'event', ev: { kind: 'shot', minute: 35, id: 's1', side: 'home', detail: '' } } });
  });
  const got = calls.some((c) => Math.abs(c.m - 35) < 0.01);
  console.log('D) mid-join shot @min 35:');
  ok(got, `minute surfaces immediately at 35 (calls=${JSON.stringify(calls.map((c) => c.m))})`);
}

console.log(pass ? '\nALL PASS' : '\nSOME FAILED');
process.exit(pass ? 0 : 1);
