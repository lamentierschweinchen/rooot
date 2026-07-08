# Full Demo — Playable Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable full-loop demo (GATE → GROUND → FULL-TIME) driven by the sui-col recording + a reactive simulated crowd, so design's three questions become feelable and the submission gets a spine.

**Architecture:** A new `crowd-sim.js` is a **drop-in replacement for `stands-adapter.js`** — it consumes the same match feed the loom/stats adapters do and implements the exact `window.__stands` pub/sub interface with *simulated* crowd data. A tiny `match-read.js` publishes a read-model `window.__match` (score/clock/market/phase) so gate/terrace/ground can read match state (the `__loom` API is push-in, not readable). A `demo.js` orchestrator sequences pre-match → play-through → full-time on one clock behind a `?demo=1` entry. Dev drives the feed via the server replay; ship bakes it client-side. The crowd *model* is pure, Node-testable functions; the browser glue is thin.

**Tech Stack:** vanilla ES5-style browser JS (matches existing adapters — no build step for `public/`), Node + tsx for headless model tests, the existing `services/stands` server replay for dev feed, `contracts/normalize.ts` for FeedMsg parsing.

## Global Constraints

- **Honesty law:** crowd = counts/splits, never a false %. Market = a real number, shown *beside* the crowd, never blended. The sim crowd is labeled "simulated" on every surface. (Spec §8.)
- **Parallel design lane:** design edits terrace/ground/gate/woven-loom/stadium in parallel. New files carry the logic; surface edits are surgical + additive + committed immediately; `git status` + `design/QUEUE` checked before touching any surface; never `vercel --prod` over an uncommitted tree that may be design's newer work. (Spec §13.)
- **Secrets:** never in argv/logs; devnet only; `fly secrets set` is owner-run (out of scope here — no on-chain in this plan).
- **`__stands` interface is fixed** (from `stands-adapter.js`): commands `root(side)`, `cheer()`, `predict(home,away)`, `momentReact(momentId,token)`; subscriptions `onState(fn{rooted,roar,faithSide,connected})`, `onConsensus(fn)`, `onVerdict(fn)`, `onMoment(fn{kind,side,palette,closesAtMs})`, `onMomentResult(fn)`; plus `anonId`, `matchId`. The sim MUST match these names/shapes exactly.
- **Commit trailer:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. No backticks in `-m`.
- **Out of scope (own plans):** the PRESSING devnet mint (#12); THE ALBUM.

---

## File Structure

- **Create `apps/web/public/crowd-sim.js`** — the simulated `__stands`. Consumes the feed (WS or baked), runs the pure model, fires the `__stands` callbacks. ES5 browser style + a `module.exports` tail so the model is Node-testable.
- **Create `apps/web/public/match-read.js`** — publishes `window.__match` (read-model: `{score:{home,away}, clock:{min,phase,running}, market:{home,draw,away}, teams, done}`) by consuming the feed. Small; gate/terrace/ground read it.
- **Create `apps/web/public/demo.js`** — the orchestrator: on `?demo=1`, sequences gate → ground → full-time on one clock; owns demo pacing.
- **Create `scripts/_crowd-backtest.mjs`** — headless harness: replays a recording through the crowd model, asserts the arc. (Temp/dev; keep in `scripts/`.)
- **Modify `apps/web/public/terrace.html`** — replace scripted `EVENTS`/`PREDS`/`M` drive with `__match` (score/clock) + `__stands` subscriptions. Surgical.
- **Modify `apps/web/public/ground.html`** — thread match params into the loom/stadium iframes; drive the crowd frame from `__stands`; read score from `__match`.
- **Modify `apps/web/public/gate.html`** — read fixture + market from `__match`; on "take your place", call `__stands.root(side)` + `__stands.predict(h,a)` and route to `?demo=1` ground.
- **Bake (Task 9):** `scripts/bake-demo.ts` → `apps/web/public/plate/demo-suicol.js` (client-side feed) + a `demo-feed.js` player.

---

### Task 0: Announce the build + lock the contracts

**Files:**
- Modify: `design/QUEUE-jul7.md` (append a coordination note)
- Read only: `apps/web/public/stands-adapter.js`, `terrace.html`, `ground.html`, `gate.html`, `loom-adapter.js`

**Interfaces:**
- Produces: a written contract note that later tasks treat as canonical — the exact `__stands` method/shape list (already in Global Constraints) + the `__match` read-model shape.

- [ ] **Step 1: Check for design's in-flight work**

Run: `cd /Users/ls/Documents/ROOOT && git status --short && git log --oneline -5`
Expected: note any modified `terrace/ground/gate/woven-loom/stadium` — if design has uncommitted changes there, coordinate (do not stage them) before Task 5+.

- [ ] **Step 2: Append the coordination note to the design queue**

Add to `design/QUEUE-jul7.md`:
```markdown
## COORDINATOR BUILD IN FLIGHT (Jul 8) — the full demo (mock crowd + loop)
Wiring terrace/ground/gate to live data via NEW files (crowd-sim.js, match-read.js,
demo.js) — logic lives there, not in your surfaces. Surface edits I need are surgical:
terrace reads window.__match (score/clock) + subscribes to window.__stands; ground threads
match params into its iframes + reads __stands; gate reads __match market + calls
__stands.root/predict. If you expose a small input hook per surface I'll attach instead of
edit. Spec: docs/superpowers/specs/2026-07-08-full-demo-mock-crowd-design.md. Ping before
big terrace/ground/gate rewrites so we don't collide.
```

- [ ] **Step 3: Commit**

```bash
git add design/QUEUE-jul7.md
git commit -m "coordination: announce the full-demo build + the surface seams I need

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 1: `crowd-sim.js` — feed consumption + `__stands` skeleton (empty model)

**Files:**
- Create: `apps/web/public/crowd-sim.js`
- Test: `scripts/_crowd-backtest.mjs`

**Interfaces:**
- Consumes: the match feed (WS `FeedMsg` from `services/stands`, or a baked player later). Activation gate mirrors `stats-adapter.js`: on `?demo=1` or `?crowdsim=1`.
- Produces: `window.__stands` implementing the fixed interface (Global Constraints). Exports (Node): `createModel(tune)`, `model.ingest(feedMsg)`, `model.tick(nowMs)`, `model.snapshot()` → `{rooted, roar, faithSide, connected, consensus, moments}`.

- [ ] **Step 1: Write the failing model test**

`scripts/_crowd-backtest.mjs`:
```js
import assert from 'node:assert';
import { createModel } from '../apps/web/public/crowd-sim.js';
const m = createModel();                       // default TUNE
m.ingest({ type: 'score', ev: { home: 0, away: 0, minute: 0 } });
const s = m.snapshot();
assert.ok(s && s.rooted && typeof s.rooted.home === 'number', 'snapshot has rooted counts');
assert.ok(s.roar && typeof s.roar.home === 'number', 'snapshot has roar');
console.log('OK skeleton snapshot', JSON.stringify(s));
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd /Users/ls/Documents/ROOOT && node scripts/_crowd-backtest.mjs`
Expected: FAIL — `Cannot find module .../crowd-sim.js` or `createModel is not a function`.

- [ ] **Step 3: Implement the skeleton**

`apps/web/public/crowd-sim.js`:
```js
(function (root) {
  'use strict';
  var TUNE = {
    homeSize: 8203, awaySize: 14100,   // fabricated crowd sizes (labeled "simulated")
    homeBias: 0.14, reactivity: 1.0, regression: 0.02, roarDecay: 0.90,
    divergenceGain: 1.0, crescendo: 0.82
  };
  function createModel(tune) {
    var T = Object.assign({}, TUNE, tune || {});
    var st = {
      home: 0, away: 0, minute: 0, phase: 'PRE', done: false,
      market: { home: 0.34, draw: 0.33, away: 0.33 },
      belief: { home: 0.5, away: 0.5 },     // each camp's hope for ITS team
      roar: { home: 0, away: 0 }, moments: [], consensus: null
    };
    function ingest(msg) {
      if (!msg || !msg.type) return;
      if (msg.type === 'score' && msg.ev) { st.home = msg.ev.home; st.away = msg.ev.away; if (typeof msg.ev.minute === 'number') st.minute = msg.ev.minute; }
      else if (msg.type === 'status' && msg.ev) { st.phase = msg.ev.phase || st.phase; }
      else if (msg.type === 'odds' && msg.tick) { st.market = { home: msg.tick.pHome, draw: msg.tick.pDraw, away: msg.tick.pAway }; }
      // ledger events (goal/shot/danger) handled in Task 2/3
    }
    function tick() { /* decay etc. in Task 3 */ }
    function snapshot() {
      return {
        rooted: { home: T.homeSize, away: T.awaySize },
        roar: { home: st.roar.home, away: st.roar.away },
        faithSide: null, connected: true,
        consensus: st.consensus, moments: st.moments.slice()
      };
    }
    return { ingest: ingest, tick: tick, snapshot: snapshot, _st: st, _T: T };
  }
  root.createModel = createModel;
  if (typeof module !== 'undefined' && module.exports) module.exports = { createModel: createModel };
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `node scripts/_crowd-backtest.mjs`
Expected: `OK skeleton snapshot {...}`

- [ ] **Step 5: Add the browser `__stands` glue (feed + pub/sub) below `createModel`**

Append inside the IIFE, after `root.createModel`:
```js
  if (typeof window === 'undefined') return;
  var q = new URLSearchParams(location.search);
  if (q.get('demo') !== '1' && q.get('crowdsim') !== '1') return;   // demo-only
  var matchId = q.get('match') || '18202783';
  var wsBase = q.get('ws') || 'wss://rooot-stands.fly.dev/';
  var model = createModel();
  var cb = { state: [], consensus: [], verdict: [], moment: [], momentResult: [] };
  var me = 'sim-' + matchId, mySide = null;
  function fire(list, v) { for (var i = 0; i < list.length; i++) try { list[i](v); } catch (e) {} }
  function publish() { var s = model.snapshot(); fire(cb.state, { rooted: s.rooted, roar: s.roar, faithSide: s.faithSide, connected: true }); if (s.consensus) fire(cb.consensus, s.consensus); }
  window.__stands = {
    anonId: me, matchId: matchId,
    root: function (side) { mySide = side === 'away' ? 'away' : 'home'; publish(); },
    cheer: function () { if (mySide) { model._st.roar[mySide] = Math.min(1, model._st.roar[mySide] + 0.18); publish(); } },
    predict: function (h, a) { model._st.userPredict = { home: h, away: a }; },
    momentReact: function (id, token) { model._st.userReact = { id: id, token: token }; },
    onState: function (fn) { cb.state.push(fn); publish(); },
    onConsensus: function (fn) { cb.consensus.push(fn); },
    onVerdict: function (fn) { cb.verdict.push(fn); },
    onMoment: function (fn) { cb.moment.push(fn); },
    onMomentResult: function (fn) { cb.momentResult.push(fn); }
  };
  // feed: reuse the WS the other adapters use
  var url = wsBase + (wsBase.indexOf('?') >= 0 ? '&' : '?') + 'matchId=' + encodeURIComponent(matchId);
  (function connect() {
    var ws; try { ws = new WebSocket(url); } catch (e) { setTimeout(connect, 1000); return; }
    ws.onmessage = function (e) { var m; try { m = JSON.parse(e.data); } catch (_) { return; } try { model.ingest(m); publish(); } catch (err) {} };
    ws.onclose = function () { setTimeout(connect, 1000); };
    ws.onerror = function () { try { ws.close(); } catch (_) {} };
  })();
  setInterval(function () { model.tick(); publish(); }, 500);
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/public/crowd-sim.js scripts/_crowd-backtest.mjs
git commit -m "crowd-sim: feed consumer + simulated __stands skeleton (empty model)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The belief model — two camps, divergence from the market

**Files:**
- Modify: `apps/web/public/crowd-sim.js` (the `ingest`/model math)
- Modify: `scripts/_crowd-backtest.mjs` (replay assertion)

**Interfaces:**
- Consumes: `createModel`, `model.ingest`, `model._st` from Task 1.
- Produces: `model._st.belief.{home,away}` updated per event; `snapshot().consensus = { all:[h,a], byRoot:{home:[h,a],away:[h,a]}, market:[pH,pD,pA] }` (the crowd's predicted scoreline split, beside the market).

- [ ] **Step 1: Add the feed-normalizer helper the harness needs**

Create `scripts/_tofeed.mjs` (converts a recording to the FeedMsg stream the sim ingests, via the real normalizer):
```js
import fs from 'node:fs';
import { parseScoreMessage, parseStatusMessage, parseLedgerMessage, parseOddsMessage } from '../contracts/normalize.ts';
export function toFeed(file) {
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim(); if (!t) continue;
    let o; try { o = JSON.parse(t); } catch { continue; }
    if (o.event === 'heartbeat') continue;
    const raw = typeof o.data === 'string' ? o.data : JSON.stringify(o.data);
    const at = o.receivedAtMs || 0;
    const sc = parseScoreMessage(raw, at, 'replay'); if (sc) out.push({ type: 'score', ev: sc });
    const stt = parseStatusMessage(raw, at, 'replay'); if (stt) out.push({ type: 'status', ev: stt });
    const led = parseLedgerMessage(raw, at, 'replay'); if (led) out.push({ type: 'ledger', msg: led });
    const od = parseOddsMessage(raw, at, 'replay'); if (od) out.push({ type: 'odds', tick: od });
  }
  return out;
}
```
Run to confirm it parses: `cd /Users/ls/Documents/ROOOT && npx tsx -e "import('./scripts/_tofeed.mjs').then(m=>console.log(m.toFeed('fixtures/sui-col-scores-20260707.jsonl').length,'msgs'))"`
Expected: a positive message count printed.

- [ ] **Step 2: Write the failing divergence test**

Append to `scripts/_crowd-backtest.mjs`:
```js
import { toFeed } from './_tofeed.mjs';
const feed = toFeed('fixtures/sui-col-scores-20260707.jsonl');
const M = createModel();
let maxGap = 0;
for (const msg of feed) { M.ingest(msg); M.tick(); const s = M._st; maxGap = Math.max(maxGap, Math.abs(s.belief.home - s.market.home)); }
assert.ok(maxGap > 0.05, 'crowd belief diverges from market by >0.05 somewhere (got ' + maxGap.toFixed(3) + ')');
console.log('OK divergence maxGap=', maxGap.toFixed(3));
```

- [ ] **Step 3: Run, verify it fails**

Run: `npx tsx scripts/_crowd-backtest.mjs`
Expected: FAIL — the empty model never moves belief, so `maxGap ≈ 0` and the assertion trips.

- [ ] **Step 4: Implement the belief math in `crowd-sim.js`**

In `ingest`, after score/odds handling, add danger/shot/goal impulses and a belief update. Replace the `tick` no-op and extend `ingest`:
```js
    function sideOf(msg) { var s = msg.msg && msg.msg.ev && msg.msg.ev.side; return s === 'home' ? 'home' : s === 'away' ? 'away' : null; }
    function impulse(side, mag) { if (!side) return; var other = side === 'home' ? 'away' : 'home';
      st.belief[side] = clamp01(st.belief[side] + mag * T.reactivity); st.belief[other] = clamp01(st.belief[other] - mag * 0.5 * T.reactivity); }
    // inside ingest, add:
    else if (msg.type === 'ledger' && msg.msg && msg.msg.type === 'event') {
      var k = msg.msg.ev.kind, sd = sideOf(msg);
      if (k === 'danger') impulse(sd, 0.015);
      else if (k === 'shot') impulse(sd, 0.03);
      else if (k === 'goal' && msg.msg.ev.confirmed) impulse(sd, 0.12);
    }
```
Add helpers + the market-anchored regression + consensus in `tick`:
```js
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  // in createModel scope:
  function marketFor(side) { return side === 'home' ? st.market.home : st.market.away; }
  function biasedTarget(side) { return clamp01(marketFor(side) + T.homeBias); }   // hope sits above the market
  st.tick = function () {
    ['home', 'away'].forEach(function (side) {
      st.roar[side] = st.roar[side] * T.roarDecay;                       // decay (Task 3 adds spikes)
      st.belief[side] += (biasedTarget(side) - st.belief[side]) * T.regression;   // drift toward hopeful baseline
    });
    // consensus: crowd's predicted scoreline = current score + expected-more from belief (kept simple)
    st.consensus = {
      all: [Math.round((st.home + st.belief.home) * 10) / 10, Math.round((st.away + st.belief.away) * 10) / 10],
      market: [st.market.home, st.market.draw, st.market.away]
    };
  };
  // wire snapshot.consensus and tick() to st.tick
```
(Update `tick()` to call `st.tick()`, and `snapshot()` to return `consensus: st.consensus`.)

- [ ] **Step 5: Run, verify pass**

Run: `npx tsx scripts/_crowd-backtest.mjs` (tsx so the `.ts` normalizer import resolves)
Expected: `OK divergence maxGap= 0.1xx` (a real gap — the two buses).

- [ ] **Step 6: Commit**

```bash
git add apps/web/public/crowd-sim.js scripts/_crowd-backtest.mjs scripts/_tofeed.mjs
git commit -m "crowd-sim: belief model — two hopeful camps that diverge from the market

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Cheer/roar spikes + the crescendo + faith

**Files:** Modify `apps/web/public/crowd-sim.js`, `scripts/_crowd-backtest.mjs`

**Interfaces:**
- Produces: `snapshot().roar.{home,away}` spikes on attacking events + decays; `snapshot().faithSide` = the losing end (or null); a `crescendo` flag when roar crosses `TUNE.crescendo`.

- [ ] **Step 1: Failing test — a goal spikes the scorer's roar; the trailing end is the faithSide**

Add to harness:
```js
const G = createModel();
G.ingest({ type: 'score', ev: { home: 1, away: 0, minute: 10 } });
G.ingest({ type: 'ledger', msg: { type: 'event', ev: { kind: 'goal', side: 'home', confirmed: true } } });
G.tick();
assert.ok(G.snapshot().roar.home > 0.3, 'goal spikes home roar (got ' + G.snapshot().roar.home.toFixed(2) + ')');
assert.equal(G.snapshot().faithSide, 'away', 'trailing end keeps faith');
console.log('OK roar+faith');
```

- [ ] **Step 2: Run, verify fail** — `npx tsx scripts/_crowd-backtest.mjs` → FAIL on roar assertion.

- [ ] **Step 3: Implement** — in `ingest`, on attacking events add a roar spike; in `st.tick`, compute `faithSide` + `crescendo`:
```js
  // in impulse-handling for danger/shot/goal, also:
  if (sd) st.roar[sd] = Math.min(1, st.roar[sd] + (k === 'goal' ? 0.7 : k === 'shot' ? 0.25 : 0.12));
  // in st.tick, after roar decay:
  st.faithSide = st.home < st.away ? 'home' : st.away < st.home ? 'away' : null;
  st.crescendo = (st.roar.home > T.crescendo) || (st.roar.away > T.crescendo);
```
Add `faithSide` + `crescendo` to `snapshot()`.

- [ ] **Step 4: Run, verify pass** — `OK roar+faith`.

- [ ] **Step 5: Commit** — `git commit -m "crowd-sim: roar spikes + crescendo + faith on the trailing end"` (+ trailer).

---

### Task 4: Moments (VAR/pen verdict windows + mini-predictions) + verdict at full-time

**Files:** Modify `apps/web/public/crowd-sim.js`, `scripts/_crowd-backtest.mjs`

**Interfaces:**
- Produces: `onMoment` fires `{momentId, kind:'verdict'|'predict', side, palette, closesAtMs}` when a VAR/pen or a lull window opens; `onMomentResult` fires the split; `onVerdict` fires your gate/mini prediction result at full-time (`{predicted:[h,a], actual:[h,a], hit:bool}`).

- [ ] **Step 1: Failing test — a VAR event opens a verdict moment; full-time fires a verdict**

```js
const V = createModel();
let moment = null, verdict = null;
V.onMoment = function (f) { V._m = f; };   // model exposes hooks for the harness
V.ingest({ type: 'ledger', msg: { type: 'event', ev: { kind: 'var', side: 'home' } } });
assert.ok(V.pullMoment(), 'VAR opens a moment');
V._st.userPredict = { home: 1, away: 0 };
V.ingest({ type: 'score', ev: { home: 0, away: 0, minute: 120 } });
V.ingest({ type: 'status', ev: { phase: 'FULL_TIME' } });
const vr = V.pullVerdict();
assert.equal(vr.hit, false, 'predicted 1-0, actual 0-0 → miss');
console.log('OK moments+verdict');
```

- [ ] **Step 2: Run, verify fail.**

- [ ] **Step 3: Implement the moment queue + verdict**

Add `lullTicks: 20` to `TUNE`. In `createModel` scope:
```js
  var momentSeq = 0, quietTicks = 0, pendingMoments = [], lastVerdict = null;
  st.pullMoment = function () { return pendingMoments.shift() || null; };
  st.pullVerdict = function () { return lastVerdict; };
```
In `ingest`, extend the ledger branch — a VAR/pen opens a verdict window; any event resets the lull:
```js
      if (k === 'var' || k === 'penalty-kick' || (k === 'possible' && msg.msg.ev.detail === 'penalty'))
        pendingMoments.push({ momentId: ++momentSeq, kind: 'verdict', side: sd, palette: k === 'var' ? 'var' : 'pen', closesAtMs: st.minute });
      quietTicks = 0;
```
In `ingest`, on the status branch, settle at full-time:
```js
      if (msg.ev.phase === 'FULL_TIME' || msg.ev.phase === 'PENALTIES') {
        if (st.userPredict) lastVerdict = { predicted: [st.userPredict.home, st.userPredict.away], actual: [st.home, st.away],
          hit: st.userPredict.home === st.home && st.userPredict.away === st.away };
        st.done = true;
      }
```
In `st.tick`, open a predict window after a lull in open play:
```js
    if (st.phase === 'FIRST_HALF' || st.phase === 'SECOND_HALF') { quietTicks++;
      if (quietTicks === T.lullTicks) pendingMoments.push({ momentId: ++momentSeq, kind: 'predict', side: null, palette: 'predict', closesAtMs: st.minute }); }
```
Expose `pullMoment`/`pullVerdict` on the returned model object; in `publish()`, drain `model._st.pullMoment()` → `fire(cb.moment, …)` and `model._st.pullVerdict()` → `fire(cb.verdict, …)` (once).

- [ ] **Step 4: Run, verify pass.**

- [ ] **Step 5: Commit** — `"crowd-sim: verdict/predict moments + full-time verdict"` (+ trailer).

---

### Task 5: `match-read.js` — the `__match` read-model

**Files:** Create `apps/web/public/match-read.js`; add a Node assertion to the harness.

**Interfaces:**
- Produces: `window.__match = { score:{home,away}, clock:{min,phase,running}, market:{home,draw,away}, teams:{home,away}, done, on(fn) }` — consumes the same feed, publishes for gate/terrace/ground.

- [ ] **Step 1: Failing test** — feeding score/odds/status yields the expected `__match` snapshot (reuse the model-free reducer; test the pure reducer `reduceMatch(state,msg)`).
- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement** `reduceMatch` (pure) + the browser glue (feed WS + `window.__match` with `on(fn)` subscription), activation on `?demo=1`. Mirror `crowd-sim.js`'s feed/connect block (extract a shared `connectFeed(url,onMsg)` if it reads cleanly — else duplicate the ~8 lines; do not over-abstract).
- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit** — `"match-read: __match read-model (score/clock/market) from the feed"` (+ trailer).

---

### Task 6: Wire the terrace to `__match` + `__stands`

**Files:** Modify `apps/web/public/terrace.html` (surgical — see Global Constraints on the design lane).

**Interfaces:** Consumes `window.__match` (score/clock) + `window.__stands` (onState → roar/faith/counts, onConsensus → crowd calls, onMoment → the pop-ups, onVerdict). Its scripted `EVENTS`/`PREDS` self-play is disabled under `?demo=1`.

- [ ] **Step 1: Check design's current terrace** — `git status --short apps/web/public/terrace.html`; if modified by design, pause and coordinate.
- [ ] **Step 2: Add the adapter scripts + a demo guard** — before `</body>` add `<script src="match-read.js"></script><script src="crowd-sim.js"></script>`, and gate the self-playing `requestAnimationFrame(step)` behind `if(!/demo=1/.test(location.search))` so live data drives it under `?demo=1`.
- [ ] **Step 3: Subscribe** — under `?demo=1`, replace the internal `M` updates: `window.__match.on(function(m){ M.score=[m.score.home,m.score.away]; M.t=m.clock.min; ...render })` and `window.__stands.onState(function(s){ M.rY=s.roar.home; M.rT=s.roar.away; faith from s.faithSide; counts from s.rooted })`, `onConsensus`→the crowd-calls line, `onMoment`→`showPred`/verdict pop.
- [ ] **Step 4: Verify** — start the server replay (sui-col), open `http://localhost:5173/terrace.html?demo=1&ws=ws://localhost:8787&match=18202783`; screenshot; assert the crowd reacts (roar moves, crowd calls shift, a moment pops) and console is clean. (Use the preview flow from tonight.)
- [ ] **Step 5: Commit** — `"terrace: wire to live __match + simulated __stands under ?demo=1"` (+ trailer).

---

### Task 7: Wire the ground composite (embeds + crowd frame)

**Files:** Modify `apps/web/public/ground.html` (surgical).

**Interfaces:** Threads `match`/`ws`/`demo=1` into the loom + stadium iframe `src`; frame reads `__match` (score) + `__stands` (crowd strips, cheer).

- [ ] **Step 1: Check design's current ground** (git status; coordinate if modified).
- [ ] **Step 2: Thread params into `LENS`** — change `LENS.loom`/`LENS.stadium` to append `location.search`'s `match`/`ws` + `&loomfeed=1`/`&statsfeed=1` so the embeds show the replayed match, not the demo seed.
- [ ] **Step 3: Drive the frame** — add `<script src="match-read.js"></script><script src="crowd-sim.js"></script>`; `__match.on`→ the top scoreline; `__stands.onState`→ the your-end/their-end counts + cheer fill; the tap handler calls `__stands.cheer()`.
- [ ] **Step 4: Verify** — open `ground.html?demo=1&ws=ws://localhost:8787&match=18202783`; screenshot LOOM tab (real replayed match, not the demo) + crowd strips reacting; console clean.
- [ ] **Step 5: Commit** — `"ground: thread match params into embeds + drive the crowd frame from __stands"` (+ trailer).

---

### Task 8: Wire the gate + the demo orchestrator (`demo.js`, `?demo=1` entry)

**Files:** Modify `apps/web/public/gate.html`; Create `apps/web/public/demo.js`.

**Interfaces:** Gate reads `__match.market` (pre-match 1X2) + fixture; "take your place" calls `__stands.root(side)` + `__stands.predict(h,a)` then routes to `ground.html?demo=1&...`. `demo.js` (loaded by the gate) sets the demo match + pacing.

- [ ] **Step 1: Check design's current gate** (git status; coordinate).
- [ ] **Step 2: Gate reads the market** — add `match-read.js` + under `?demo=1` set the fixture (SUI v COL) + fill "THE MARKET READS" from `__match.market` when it arrives (fallback to the current sample if no feed yet).
- [ ] **Step 3: Gate locks + routes** — on the CTA: `window.__stands && __stands.root(side); __stands.predict(predH,predA);` then `location.href='ground.html?demo=1&match=18202783&ws='+ws`.
- [ ] **Step 4: `demo.js`** — a thin script (loaded on gate + ground under `?demo=1`) that pins the demo match id + the replay `ws` (dev) and the pacing note; no heavy logic (the server replay owns match pacing; this just carries params + labels "SIMULATED CROWD").
- [ ] **Step 5: Verify the loop** — with the replay running: open `gate.html?demo=1&ws=...`; pick SUI, set a score, take your place → lands on the ground with the match playing + crowd live; screenshot gate + ground + (fast-forward) full-time verdict; console clean.
- [ ] **Step 6: Commit** — `"gate+demo: read market, lock the pick, open the ground (?demo=1 loop)"` (+ trailer).

---

### Task 9: Bake for ship (serverless demo) + deploy

**Files:** Create `scripts/bake-demo.ts` → `apps/web/public/plate/demo-suicol.js`; Create `apps/web/public/demo-feed.js`; wire the `?demo=1` feed to the baked player when no `ws` is given.

**Interfaces:** `demo-feed.js` replays `demo-suicol.js` (a baked, timestamped FeedMsg array) into the same `onMsg` path the WS uses — so `crowd-sim.js`/`match-read.js` need no change (they call `connectFeed`, which picks baked when `?ws` is absent).

- [ ] **Step 1: Failing check** — open `gate.html?demo=1` (no `ws`) → today nothing feeds; assert the loop is empty (baseline).
- [ ] **Step 2: Bake** — `scripts/bake-demo.ts` runs `toFeed('fixtures/sui-col-…')` → writes `window.__DEMO_SUICOL = [ {atMs, msg}, ... ]` to `plate/demo-suicol.js`. Run it; confirm the file exists + has entries.
- [ ] **Step 3: `demo-feed.js`** — when `?demo=1` and no `?ws`, plays `__DEMO_SUICOL` on a clock (whole match in ~150s — the pacing constant `DEMO_SECONDS`), calling the registered `onMsg`. Make `connectFeed(url,onMsg)` choose: `ws` present → WebSocket; else → `demo-feed`.
- [ ] **Step 4: Verify serverless** — open `gate.html?demo=1` (NO ws) → full loop plays with no server; screenshot; console clean.
- [ ] **Step 5: Deploy + verify prod** — `git status` (ensure no design WIP clobbered), `vercel --prod --yes`, then `curl -sL https://rooot.club/gate?demo=1` sanity + open it.
- [ ] **Step 6: Commit** — `"demo: bake sui-col client-side + serverless player — the shippable loop"` (+ trailer).

---

## Notes for the executor

- **Tune by feel, not by test.** The tests assert *structural* properties (divergence exists, roar spikes on goals, faith on the trailing end, verdict resolves). Whether it *feels* right is the owner's call — the `TUNE` block is one edit. Do not chase a "correct" crowd number.
- **The pressing (devnet mint) is a separate plan.** This loop ends at the full-time verdict; the on-chain keepsake bolts on after (#12).
- **Every surface edit:** check `git status` + `design/QUEUE` first; commit immediately; never deploy over design's uncommitted work.
- **Server replay for dev** (Tasks 1–8), **baked feed for ship** (Task 9) — same `connectFeed` seam, downstream unchanged.
