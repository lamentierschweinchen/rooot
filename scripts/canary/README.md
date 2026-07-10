# ROOOT release-gate canary

Two-(then three-)browser acceptance test for the assembled live product
(post-mortem #4: nothing end-to-end was ever exercised automatically before
last night's live match). Own `package.json` (playwright + ws) — isolated
from every other lane's dependencies, per `.superpowers/sdd/task-5-brief.md`.

```
node scripts/canary/run.mjs --web <baseUrl> --ws <wsUrl> --mode full|smoke [--match <id>] [--out <path>] [--headed]
```

| flag | required | meaning |
|---|---|---|
| `--web` | yes | app base URL, e.g. `http://localhost:4180` or `https://rooot.club` |
| `--ws` | yes | stands WS base, e.g. `ws://localhost:8788/` or `wss://rooot-stands.fly.dev/` |
| `--mode` | yes | `full` (local stacks only) or `smoke` (production-safe, read-only) |
| `--match` | no | TxLINE fixture id (default `18218149`, tonight's `fixture.json` match) |
| `--out` | no | JSON results path (default `scripts/canary/results/<mode>-<timestamp>.json`) |
| `--headed` | no | run Chromium headed, for debugging |

Output: a printed PASS/FAIL/SKIPPED/PROVISIONAL table, a JSON results file, and
a **nonzero exit code iff any step FAILed** (SKIPPED/PROVISIONAL never fail the
run by themselves).

## Install

```
cd scripts/canary
npm install               # playwright + ws — own lockfile, doesn't touch the root/apps/web/services/stands trees
npx playwright install chromium   # if the postinstall hook didn't already fetch it
```

## Running against your own local stack

Two terminals, from the worktree root:

```
# terminal 1 — the web app
cd apps/web && npx vite --port 4180

# terminal 2 — the stands service
cd services/stands && PORT=8788 npm start
```

Then, from `scripts/canary/`:

```
node run.mjs --web http://localhost:4180 --ws ws://localhost:8788/ --mode full  --match 18218149
node run.mjs --web http://localhost:4180 --ws ws://localhost:8788/ --mode smoke --match 18218149
```

Against a bare `services/stands` (no `REPLAY_FILE`, no live TxLINE ingest),
`full` mode's side-pick/predict/cheer/lens-switch/late-join steps still run
for real (they only need a live crowd, not a live match feed) — the
full-time-verdict and market steps will correctly print **SKIPPED** with a
reason, because there is no match feed to reach FULL_TIME or carry odds. See
below for how to exercise those two for real with a recorded fixture.

## Enabling full-time replay (and goals, for the late-join step)

`services/stands` can replay a recorded `fixtures/*.jsonl` capture through the
exact same parser the live feed uses (`services/stands/src/ingest/replay.ts`),
fanned out on the same WebSocket as everything else. One file, one fixture id,
sped up:

```
cd services/stands
PORT=8788 \
REPLAY_FILE=/Users/ls/Documents/rooot/fixtures/sui-col-scores-20260707.jsonl \
REPLAY_FIXTURE=18202783 \
REPLAY_SPEED=60 \
npm start
```

then run the canary with `--match 18202783` (the fixture id must match
`REPLAY_FIXTURE`, and the app's own hardcoded `gate.html`/`ground.html`
`FIXTURES` table already knows `18202783` as SUI v COL). The whole file is
~1360 real messages spanning ~230 real minutes; replay timing is
reconstructed from consecutive `receivedAtMs` deltas divided by speed, capped
at 5s/gap (see `replay.ts`) — at `REPLAY_SPEED=60` that's kickoff through
full time and a penalty shootout in ~3.3 minutes wall-clock. Recorded
fixtures are read-only and **never copied into the repo**
(`/Users/ls/Documents/rooot/fixtures/*.jsonl`, gitignored at the main
checkout).

**Don't push the speed too high.** Predictions LOCK at kickoff — real product
behavior (`services/stands/src/server.ts`'s `predictLifecycle`) — and this
fixture's own kickoff/first-half status lands only ~20-25s into the replay
regardless of speed (most of the pre-kickoff gap is heartbeats/scheduling
noise that hits the 5s/line cap, so it doesn't compress much further). The
canary's own gate.html setup for both fans runs concurrently and is normally
well under that, but at `REPLAY_SPEED=150`+ the margin gets tight enough to
occasionally lose the race under system load — seen firsthand while writing
this: a run where kickoff won the race left the "predict distinctness" step
legitimately FAILing (predict silently rejected by the now-locked match, not
a canary bug). `REPLAY_SPEED=60` was chosen for a comfortable margin; if you
push it faster, raise it knowingly.

**This specific recording has no goals** — SUI 0-0 COL after 90+30 minutes,
decided on penalties (4-3) — confirmed via
`services/stands/src/sentiment/*`'s own crystallized headline on replay. That
makes it a real, useful exercise of the **full-time-verdict** step (FULL_TIME
still fires off the final 0-0 scoreline) but the **late-join/GOOOL-suppression**
step will correctly print SKIPPED against it every time — there is genuinely
no goal to test suppression against. To see that step PASS for real, point
`REPLAY_FILE`/`REPLAY_FIXTURE` at a recorded fixture that does have a
confirmed goal in it.

## Enabling the market step

The scores fixture above has no odds — TxLINE serves odds and scores as two
**separate** SSE streams (`/api/odds/stream` vs `/api/scores/stream`), recorded
to two separate files, and `services/stands` replays exactly one `REPLAY_FILE`
per process. To exercise the market step for real, run a **second** stands
instance against the odds fixture instead:

```
PORT=8789 \
REPLAY_FILE=/Users/ls/Documents/rooot/fixtures/sui-col-odds-20260707.jsonl \
REPLAY_FIXTURE=18202783 \
REPLAY_SPEED=150 \
npm start
```

and point the canary at it (`--ws ws://localhost:8789/`). You'll get the
market step for real but the full-time/late-join steps will SKIP on that run
instead (no scores/ledger on this stream) — hence two runs, not one, to cover
every step for real against a single-process service. A run against a service
with **neither** replay configured correctly reports both as SKIPPED with a
reason, never fakes either. The predict-lock timing note above doesn't apply
here (odds carry no phase/status), so a higher speed is fine on this stream.

## `--mode smoke`

Production-safe, **read-only**. Loads `/`, `/live`, `/cabinet`, asserts zero
console errors, that a WebSocket reaches `/live`, and that **no write frame is
ever sent** — enforced in code (see "How the allowlist is enforced" below),
not by only avoiding clicks. Run it against your own local stack too (not
prod — the coordinator runs that):

```
node run.mjs --web http://localhost:4180 --ws ws://localhost:8788/ --mode smoke
```

`--mode smoke` never checks or refuses production hosts — it's designed to run
against `rooot.club`/`*.fly.dev` on purpose. `--mode full` is the one that
refuses them (see "Host safety" below).

## The `?ws=` override — the real mechanism, and its gap

`apps/web/public/stands-adapter.js` and `loom-adapter.js` both read
`new URLSearchParams(location.search).get('ws')`, falling back to
`wss://rooot-stands.fly.dev/` — that query param **is** the real, working way
to point any of these static surfaces at a local (or any other) stands
service. The canary uses it on every page it navigates to directly.

**Gap (found during this task, not fixed — out of `scripts/canary/**`'s file
wall):** the app's own *internal* navigations do not forward `&ws=`:

- `apps/web/public/gate.html`'s `#go` click handler builds its post-predict
  redirect as `'ground.html?from=gate' + MODE_Q`, where `MODE_Q` is built from
  `demo`/`live`/`match` only (`gate.html`, the `MODE_Q` assignment right above
  the `go.onclick` handler) — `ws` is never included.
- `apps/web/public/ground.html`'s `lensSrc(name)` builds each lens iframe's
  `src` as `base + '?embed=1' + (...&live=1&match=...&site=1&standsfeed=1&loomfeed=1&statsfeed=1...)`
  — again, no `&ws=`.

So a fan who is correctly pointed at a local stack via `?ws=` on `gate.html`
gets silently dropped back to `wss://rooot-stands.fly.dev/` the moment they
land on `ground.html` (via the timed redirect) or switch lenses (via the
iframe) — **unless the canary sets `?ws=` itself on every top-level
navigation it performs**, which is exactly what `lib/fullMode.mjs` does: it
never lets `gate.html`'s own redirect fire (it navigates to `ground.html`
itself, explicitly, right after confirming the `predict` frame was sent), and
it navigates `woven-loom.html` directly for the late-join context. What it
*cannot* do without either editing app code or intercepting/rewriting
requests (both out of scope — "report as a concern... rather than hacking one
in") is make `ground.html`'s own internal lens iframe inherit `ws=`. Two
consequences, both handled honestly rather than patched around:

1. **Safety net:** every page the canary controls has a host guard (see
   below) — any connection attempt to a host other than the one you passed via
   `--ws` is stubbed before it can reach the network, and logged. So a stray
   iframe reconnect-to-production attempt is neutralized, not silently
   allowed. The lens-switch step surfaces this evidence in its detail string
   if it happens.
2. **Test design:** the lens-switch step (task-5-brief.md: "A opens
   `ground.html` (spawns extra sockets) then navigates away/closes one lens →
   B's observed presence does not drop") still clicks the real dial (for
   coverage), but the actual "extra socket" the assertion depends on is a
   *raw* `ws` connection sharing fan A's real `anonId`/side (opened directly
   by the canary via the `ws` package) — a controllable stand-in for the
   socket the iframe would have opened had `ws=` reached it. This is
   documented here rather than silently substituted: if/when the `ws=`
   forwarding gap above is fixed, the dial click itself would start
   contributing a second *local* connection too, which only makes the
   real-UI coverage stronger, not weaker.

## Local `vite dev` vs production routing (smoke mode)

`vercel.json` has `cleanUrls: true` plus an explicit rewrite,
`{"source": "/live", "destination": "/woven-loom?match=..."}`, both
Vercel-only mechanisms. Plain `npx vite --port 4180` (what you run locally,
and what this canary's own verification used) does not replicate either —
Vite's dev server falls back unresolved paths to `index.html` (default
`appType: 'spa'`), and `apps/web/vite.config.ts` has no equivalent dev-time
rewrite. So when `--mode smoke` runs against a local `vite dev` server,
`/live` and `/cabinet` currently 404-fall-back to `index.html` instead of
serving `woven-loom.html` / `cabinet.html` — a real local/prod parity gap,
not a canary bug. The smoke report's `smoke: WS connects on /live` row names
this explicitly when it happens (via the loaded page's `<title>`, which will
read `"ROOOT - Matchday"` instead of `"THE LOOM — woven live"`). It does not
affect a real Vercel deployment or preview, and it does not affect `--mode
full` (which always navigates the literal `.html` files directly, never the
clean URLs, precisely because it must work the same locally and never touch
prod at all).

## How the allowlist is enforced (smoke mode)

`lib/wsTap.mjs`'s `initScript` is installed via `context.addInitScript` —
runs before any page script, on every page **and every iframe**, in every
context. It replaces `window.WebSocket` with a wrapper that intercepts every
outgoing `send()` call: the frame is `JSON.parse`d, and if
`enforceAllowlist` is on (smoke mode only) and the frame is anything other
than `{"type":"hello"}` **without** a `side` field, the wrapper returns
without ever calling the native `send()` — the frame physically never reaches
the network. This is enforced the same way regardless of what any calling
code does or forgets to do; smoke mode also never clicks/types on a page, so
in practice the only frame any page can generate on its own is exactly that
allowed hello. Every blocked attempt is still recorded
(`window.__canary.blockedSends`) so the report can show if a page ever tried.
The same file also enforces a **host guard** in both modes: `--ws`'s hostname
is the only one a real `WebSocket` may reach from any page in the run;
anything else gets a stub that never opens a real connection (see the `?ws=`
gap above).

## Host safety (full mode)

`--mode full` refuses to start at all — before opening a browser, before any
network call — if either `--web` or `--ws`'s hostname is `rooot.club` (or a
subdomain) or `*.fly.dev` (`lib/cli.mjs`'s `isProdHost`/
`assertFullModeHostSafety`, called first thing in `run.mjs`). Full mode
performs real `root`/`predict`/`cheer` writes; it must be structurally
incapable of reaching production, not just discouraged from it by
convention.

## The seven flow steps (full mode)

1. **gate: side pick (root reaches the crowd count)** — A picks home, B picks
   away on the real `gate.html` DOM (`.end[data-side="h"|"a"]`); asserted via
   the `stands` broadcast's `counts`, not the page's own narrow
   `window.__stands` view (which never exposes `counts` distinctly from
   `roar`... it does, but not `presence` — see step 4).
2. **gate: predict distinctness (consensus)** — A calls 2-1, B calls 1-2 (the
   score buttons + `#go`, which fires `root()`+`predict()` together in the
   real code); asserted via the `consensus` broadcast's `byRoot.home`/`.away`
   means.
3. **ground: cheer signal (A -> B, <=2s)** — tries `window.__stands.onCheer`
   first (Task 2, not landed as of this writing); falls back to a roar-delta
   check marked **PROVISIONAL**, exactly as the brief specifies.
4. **ground: presence resilience (lens-switch)** — see the `?ws=` gap section
   above for exactly how the "extra socket" is constructed and why.
5. **woven-loom: GOOOL suppressed on late join** — waits for a confirmed goal
   on a read-only background feed connection, then opens a fresh context and
   asserts `#gooool` never gains its `on` class for a goal replayed with
   `_replay: true`. SKIPS (not fakes) if no goal is observed in time.
6. **full-time: personal side-aware verdict** — waits (concurrently with step
   5's wait, not after it) for A and B's own connections to receive their own
   `predictVerdict`; SKIPS with a reason if the local stack never reaches
   `FULL_TIME`.
7. **pre-match: market renders** — checks the same background feed connection
   for an `odds` tick with a full (non-`et`) de-vigged triple; SKIPS with a
   reason if the local feed carries no odds.

## Concerns / known limitations

- The `?ws=` forwarding gap and the local-routing parity gap above are both
  real findings from this task, not fixed here (outside `scripts/canary/**`).
- `services/stands` replays exactly one `REPLAY_FILE` per process, and odds
  vs scores are separate recorded files — a single canary run cannot exercise
  both the market step and the full-time/late-join steps for real against the
  same service instance. See "Enabling the market step" above.
- The lens-switch step's presence assertion depends on
  `services/stands/src/match-state.ts`'s presence bookkeeping (currently
  `connected: Set<string>`, one entry per `anonId`; `markDisconnected` deletes
  the `anonId` unconditionally on ANY connection close). Tonight's Task 2 plan
  targets exactly this (`connected: Set<string> -> Map<string, number>`,
  refcounted). Read literally, until that lands this step can genuinely FAIL
  against real server behavior — that is the canary doing its job, not a bug
  in it; see the step's own FAIL detail string for the exact file/reasoning
  when it happens.
- `predict`/`cheer`/`root` all key off `localStorage`'s `rooot.anonId` /
  `rooot.pass` on the SAME origin as `--web`; running two contexts against
  different origins would break the flow (not a supported configuration).
- Every fresh `--mode full` run uses brand-new Chromium contexts (fresh
  `localStorage`, fresh `anonId`s), so repeated runs against a long-lived
  local `services/stands` process accumulate additional predictions/roots on
  the same `matchId` rather than colliding — the consensus mean assertions
  stay correct regardless (every run submits the identical 2-1 / 1-2), but
  `counts`/`presence` numbers in the printed evidence will climb across
  repeated runs. Restart `services/stands` (or use a fresh `--match`) for a
  clean baseline.
