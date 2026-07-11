# ROOOT footage rig

Automated, honest screen capture of the LIVE product during real matches --
the raw material for the demo video. **Live footage of real fans' data is the
point: nothing here is staged, simulated, or replayed.** The rig loads the
same production pages any fan loads, films them, and tags the timeline off
the same wire the pages render from. If the crowd is three people, the
footage shows three people.

Own `package.json` (playwright + ws), isolated like `scripts/canary`.

```
cd scripts/footage
npm install          # once; postinstall fetches chromium
node run.mjs --match <fixtureId> [--until <min|ISO>] [--out <dir>]
```

## Tonight (2026-07-11/12)

```
# NOR v ENG -- kickoff 23:00 CEST (21:00Z), start the rig ~22:45 CEST
node run.mjs --match 18213979 --until 240

# ARG v SUI -- kickoff 03:00 CEST (01:00Z), start ~02:45 CEST
node run.mjs --match 18222446 --until 240
```

Two sequential invocations; each ends by itself after `--until` (default 240
minutes -- covers ET + pens with margin). Ctrl-C also stops cleanly: current
segments are finalized, never torn. Footage lands in
`scripts/footage/out/<matchId>/`:

```
out/<matchId>/
  segments/        the .webm video files
  events.jsonl     the tagged timeline (one JSON object per line)
  .tmp/            in-flight recordings (empty after a clean stop)
```

Between the two matches the coordinator's `/live` cutover
(`scripts/cutover-fixture.mjs`) may or may not have run -- the rig checks the
deployed `fixture.json` at start and, if `/live` pins a different match,
films the explicit `/woven-loom?loomfeed=1&match=<id>` URL instead (same
page, same wire) and logs `loom-url-fallback`. Either way the footage is of
the requested fixture.

## What gets filmed

| capture | URL | cadence |
|---|---|---|
| the loom | `/live` (or the pinned fallback above) | continuous, ~10-min segments |
| the ground | `/ground?live=1&match=<id>` | continuous, ~10-min segments |
| beauty passes | `/` + `/gate?live=1&match=<id>` + `/stadium?live=1&match=<id>` | 30s each, once at start |

Phone viewport 390x844, deviceScaleFactor 2 (authentic mobile rendering);
video at native 390x844 -- headless Chromium's screencast emits CSS-pixel
frames, so a larger video size only pads, never sharpens (verified). Headless.

**Segment hygiene:** a new segment starts on every goal/status change (plus a
10-minute timer). The rotation happens ~20s AFTER the event, so the goal and
its eruption sit INSIDE the file being closed -- once closed, that file is
finalized on disk and a later rig death cannot corrupt it. Expect a ~2-4s
capture gap at each rotation (context close/reopen); the two surfaces rotate
independently so the gaps don't align.

**Filenames** carry the segment's start wall-clock plus the tag of whatever
ended it: `loom-2026-07-11T21-04-12Z-goal-1-0.webm`,
`ground-2026-07-11T21-14-40Z-timer.webm`,
`beauty-stadium-2026-07-11T20-45-31Z.webm`. End tags: `timer`, `kickoff`,
`goal-<h>-<a>`, `score-<h>-<a>` (VAR correction), `status-<PHASE>`, `end`
(clean stop), `crash`/`hang`/`nav-fail` (recovered failures), `disk-cap`.

## events.jsonl -- the editor's scrub file

One line per event: `{ tMs, iso, type, detail }` (`tMs` = ms epoch). The
match-wire types come from ONE read-only WebSocket on the match room (seated
by `?matchId=`, exactly like any watching page):

| type | when | detail |
|---|---|---|
| `kickoff` | phase PRE -> FIRST_HALF | `{minute}` |
| `status` | every other phase change | `{phase, prev, minute}` |
| `goal` | the score increments | `{score, prev, side, scorer, minute}` |
| `score-correction` | the score decrements (VAR) | same shape |
| `ledger` | goal / red-card / var / possible / penalty-kick events | `{kind, side, minute, detail, id}` |
| `moment` / `momentResult` | a Pulse window opens / reveals | kind, side, per-end tops |
| `cheerBurst` | >3 cheer echoes in 10s (rate-limited) | `{in10s, home, away}` |
| `market-open` | first odds tick seen | de-vigged triple |
| `odds` | one belief sample per minute | de-vigged triple |
| `stands` | crowd sample every 5 min | `{counts, roar, presence}` |
| `feedState` | wire health changes | `{state}` |
| `sentiment` | the record crystallizes at FT | `{headline}` |
| `baseline` | first status/score after (re)connect | never a fake kickoff/goal |

Rig-health types: `rig-start/stop/stopping`, `segment-open/close/lost`,
`beauty-close/fail`, `page-crash`, `page-reopen`, `nav-fail`, `watcher-*`,
`browser-relaunch`, `disk`/`disk-warn`/`disk-stop`, `chaos-kill`,
`tap-violation` (should never appear), `loom-url`/`loom-url-fallback`.
`_replay`-tagged join-snapshot history never produces timeline entries.

## Write-free, in code (not by promise)

The rig only ever WATCHES. Three layers, the first two adapted from the
release-gate canary's smoke mode (`scripts/canary/lib/wsTap.mjs` -- the
proven reference for "provably write-free against production"):

1. **Frame allowlist, enforced in-page:** every recorded page (and iframe)
   gets a WebSocket wrapper installed BEFORE any page script runs. The only
   outgoing frame it will pass to the native `send()` is a bare
   `{"type":"hello"}` WITHOUT a side -- the root-less presence any lurking
   visitor emits by loading the page. predict/cheer/react/momentReact/call
   and hello-with-side are hard-blocked (recorded in `blockedSends`, never
   reaching the network). Each `segment-close` line carries the tap's own
   accounting (`tap: {sends, sendTypes, blockedSends, ...}`) as evidence;
   `rig-stop` carries the run-wide aggregate.
2. **Host pin:** pages may only reach the `--ws` host; any other WebSocket
   target gets a dead stub (covers the known lens-iframe `?ws=` forwarding
   gap documented in the canary README).
3. **The watcher never sends:** `lib/watcher.mjs` contains no send call of
   any kind -- the write path does not exist in the code.

No clicks, no typing, no form entries, no gate entries: the rig drives
nothing. Loading a page does count as presence (a lurker) -- the same
footprint as any real visitor, and exactly what the canary's production
smoke mode already does.

## Resilience

- Page crash / unexpected close / hang (2 missed liveness pings): the segment
  is closed and salvaged, `page-crash` + `page-reopen` logged, context
  reopened with backoff (3s -> 30s). Browser death relaunches Chromium.
- The watcher reconnects with the app adapters' own discipline (single-flight,
  1s -> 30s backoff, reset only after >=5s open, never-opened watchdog).
- Disk bound: total out-dir size polled every 30s -- `disk-warn` at 2GB,
  `disk-stop` at 4GB stops ALL recording (the watcher + events.jsonl stay up).
- `--until` (default 240 min) hard-ends the run; SIGINT/SIGTERM are graceful.

## Verification flags (not for match night)

`--chaos-kill <sec>` force-closes the loom page once, mid-run, to prove the
recovery path against the real target; refused when `--until` is more than
15 minutes out. `--skip-beauty` / `--headed` / `--web` / `--ws` for local
testing against a dev stack.
