# NIGHT NOTES — NOR–ENG / ARG–SUI double-header 2026-07-11

*Match-night ops instance. Timestamps CEST. Evidence inline or by path.*

## Pre-kickoff catch-up — game 1, Norway v England (18213979)

- **22:39 wake/start:** Read `docs/RUNBOOK-double-header-2026-07-11.md` and
  `docs/NOTES-esp-bel-2026-07-10.md`. Current clock was already inside the 22:30
  freeze window, so I ran the still-useful checks immediately rather than treating
  the earlier 21:30/22:00 slots as pending.
- **22:40 §3 self-verify:** `main` == `origin/main` at `6156ea9` (`ops: codex
  match-captain kickoff prompt - fix authority bounded, live state inventory,
  owner protocol`). Dirty tree present and expected: `apps/web/public/terrace.html`
  plus design/checkin/generated assets and this notes file. Local
  `apps/web/public/fixture.json` = NOR/ENG `18213979`.
- **22:40 health:** `{"uptime":2637,"matchesActive":1,"clients":1}` — service up.
- **22:41 §4.1 GREEN after local DNS retry:** sandboxed WS probe first hit local
  `getaddrinfo ENOTFOUND rooot-stands.fly.dev`; escalated read-only retry succeeded:
  `feedState=connected`, `odds=56` in 12s, market NOR `0.22282`, draw
  `0.24618`, ENG `0.53107` (sum ~= 1.00007).
- **22:41 §4.2 GREEN after local browser retry:** first canary attempt failed before
  page load because bundled Chromium aborted under sandboxed execution. Escalated
  write-proof retry: **6 pass / 0 fail / 0 skipped**, including `/`, `/live`,
  `/cabinet`, WS open on `/live`, and write-block self-test. Result:
  `scripts/canary/results/smoke-2026-07-11T20-41-37-725Z.json`.
- **22:42 rendered fixture check GREEN:** production `/live?match=18213979` rendered
  `NOR 0-0 ENG`, `KICKOFF 23:00 · MARKET OPEN`, and "THE LOOM · THE MATCH, WOVEN".
  Screenshot: `/tmp/rooot-live-18213979.png`.
- **22:42 quick-call state:** production `/ground?live=1&match=18213979` rendered
  the live ground with NOR/ENG crowd state. Text probe found **no** `QUICK CALL`, no
  `NEXT CORNER?`, and no `XP`. `NEXT GOAL?` was also not visible in this no-pass
  read, but the old scripted quiz was not reachable. Screenshot:
  `/tmp/rooot-ground-18213979.png`.
- **22:48 quick-call state corrected / RED:** top-document text probe missed the
  embedded terrace frame. Frame probe on
  `https://rooot.club/terrace?embed=1&live=1&match=18213979&site=1&standsfeed=1&loomfeed=1&statsfeed=1`
  found `● QUICK CALL — NO STAKE`, `WHO WINS THE NEXT CORNER?`, and XP text still
  reachable in production live mode. This is the exact handoff tripwire. Per
  tonight's runbook lane wall I did not edit/deploy; recommended immediate
  Design/coordinator hotfix: disable the scripted mini-prediction world whenever
  `live=1`, leaving only the live `NEXT GOAL?` slot.
- **23:10 quick-call post-kickoff follow-up / PARTIAL RECOVERY:** monitor began
  receiving `nextGoalState` messages. Fresh rendered frame probe showed the terrace
  card now says `NEXT GOAL?`; `QUICK CALL` and `NEXT CORNER?` are gone. `XP` still
  appears in the terrace frame footer, so remaining issue is stale XP/gamification
  copy residue, not the scripted card itself.
- **22:42 surface nuance logged:** production `fixture.json` is correct for NOR/ENG.
  Static fallback HTML still contains stale fallback copy (`ESP/BEL` on `/`,
  `SUI/COL` in gate markup), but rendered live pages resolve through the manifest
  to NOR/ENG. Not live-severity while rendered state is correct; worth cleanup.
- **22:42 footage rig started:** `scripts/footage/run.mjs --match 18213979 --until
  240`; output dir `scripts/footage/out/18213979`, deployed pin `18213979`. The
  script interprets `--until 240` as a four-hour window; leaving it alive for the
  game-1 capture.
- **22:44 monitors armed:** `live-monitor.mjs 18213979` opened WS. First attempt at
  `live-scores-watch.mjs` from repo root failed because its token path is relative;
  restarted from `services/stands`, now seeing scheduled-match envelopes
  (`lineups`, `players_warming_up`, venue/weather).
- **22:45 live-monitor pre-kickoff feed stall, self-resolved / not escalated:**
  monitor exited `FEED STALL — no feed msg for 105s`. Required SCORE PROBE before
  restart showed `score=null status=null minute=null` with `feedState=1`, `odds=60`
  in 5s, and `stands=19`. Scores-watch still saw scheduled envelopes and footage
  still saw odds. Read as monitor-socket stall, not service outage. Monitor
  restarted immediately.
- **22:49 second live-monitor pre-kickoff feed stall, self-resolved / not escalated:**
  monitor exited the same `FEED STALL` path. Required 5s SCORE PROBE saw no messages,
  so I ran a longer feed probe before restarting: health `uptime=3217`,
  `matchesActive=1`, `clients=2`; 12s WS probe returned `feedState=connected`,
  `odds=65`, `stands=45`, market NOR `0.22432`, draw `0.24618`, ENG `0.52966`.
  Monitor restarted.
- **23:01 KICKOFF — GREEN:** monitor saw `status=FIRST_HALF`, `minute=0`,
  ledger `kickoff`; scores-watch exited `SCORES LIVE` after `kickoff/status`
  envelopes appeared; footage logged kickoff and closed kickoff-tagged ground/loom
  segments with zero console errors. First 8s kickoff probe saw no messages, so I
  discarded it and reran longer. **23:02 kickoff probe 2:** `status=FIRST_HALF`,
  `minute=0`, `score=null` (correct, no goal yet), `consensus.locked=true`, all
  calls `n=5`, home end `n=3`, away end `n=2`. Market-open baseline: NOR
  `0.22457`, draw `0.25654`, ENG `0.51894`.
- **23:06 routine monitor re-arm:** 15-minute re-arm exited healthy. Required SCORE
  PROBE before restart: `score=null status=FIRST_HALF minute=0`, with `odds=119`,
  `spell=52`, `ledger=14`, `stands=31` in 8s. Monitor restarted.
- **23:22–23:26 LIVE-SEVERITY escalation — Fly service path unresponsive from ops:**
  routine 15-minute monitor re-arm exited healthy, but required follow-up probes
  failed to receive data. Evidence: 23:23 8s SCORE PROBE = 0 messages; 23:23
  15s WS probe = 0 messages; 23:24 `curl -m 8 https://rooot-stands.fly.dev/health`
  timed out; 23:24 bounded WS check = 0 messages; after a 60s wait, 23:25 retry
  still `curl (28)` timeout and WS count 0. `https://rooot.club` returned HTTP
  200 at 23:24, so not general internet from ops. Footage rig also stopped printing
  fresh odds after ~23:21/23:22. Escalated to coordinator with recommendation to
  check Fly health/logs/replacement state immediately.
- **23:27 Fly status evidence:** `flyctl status -a rooot-stands` (read-only)
  showed machine `080e997dfed138` in `iad`, state `started`, version `36`, with
  `1 total, 1 critical` health check. `flyctl logs --no-tail` did not return output
  promptly and was stopped.
- **23:28 outage persists:** bounded retry still `curl (28)` timeout on `/health`
  and WS count `0`. This is now >5min from the first failed post-rearm probe, still
  live-severity.
- **23:30 restart authorized + attempted:** with service path unresponsive >5min,
  requested explicit approval through the tool and restarted Fly machine
  `080e997dfed138`. CLI waited several minutes on `(started, 0/1)` and was stopped
  after it stayed stuck; lease released.
- **23:33 machine status after restart:** `flyctl machine status 080e997dfed138`
  showed state `started`, HostStatus `ok`, service check **passing** with
  `{"uptime":64,"matchesActive":0,"clients":0}` and restart event at
  `23:30:54 CEST`. Public `/health` still timed out from ops, but a fresh WS probe
  recovered: opened, returned `consensus`, `nextGoalState`, `feedState=connected`,
  `status FIRST_HALF minute 31`, odds, total 29 messages in 15s.
- **23:34 recovery SCORE PROBE + monitor restart:** `score=null`,
  `status=FIRST_HALF`, `minute=31`, consensus locked `n=5`, market NOR `0.18808`,
  draw `0.28927`, ENG `0.52274`. Live monitor restarted. Footage watcher recovered
  at `23:34:53` and received odds/counts again. Public `/health` remains suspicious
  from ops, but the match WS is back.
- **23:36 / 35' GOAL NOR — 1-0:** footage logged `goal {"score":{"home":1,
  "away":0},"side":"home","scorer":null,"minute":35}` and a goal moment
  `18213979:299`. Independent GOAL SCORE PROBE at 23:37 confirmed `score=[1,0]`,
  `status=FIRST_HALF`, `minute=35`, with ledger tail showing home shot on target
  at 34' then goal id `18213979:299` at 35'. Wire filled the scorer a little later:
  **35' NOR Schjelderup, Andreas**. Live monitor updated its running line to
  `score=[1,0]` but did not exit on a separate score-change alert.
- **Pulse/moments tonight are alive:** footage captured a `possible` moment at 27'
  (`side=away`, id `18213979:238`) and a `goal` moment at 35' (`side=home`, id
  `18213979:299`). The 27' `momentResult` showed silence honestly (`n=0`, empty
  top tokens), not invented counts. This is a positive change from the ESP-BEL
  failure mode.
- **23:44 recurring service wedge after partial recovery:** fresh `/health` timed
  out and fresh WS returned 0 messages again after the post-restart recovery. Fly
  machine status showed state `started`, HostStatus `ok`, but health check
  **critical** with `context deadline exceeded (Client.Timeout exceeded while
  awaiting headers)`, last updated ~3m24s earlier. This looks like the app starts
  and briefly serves the live wire, then wedges again under live load. Not looping
  restarts blindly; needs coordinator-level diagnosis.
- **23:45 nuance:** existing sockets are partly alive even while fresh joins/health
  fail — monitor and footage both received a 43' `possible` moment (`18213979:362`)
  and silent `momentResult`. So the failure shape is not a simple all-sockets-dead
  outage; it is health/new-connection wedging while some established live taps keep
  receiving.
- **23:48 / 46' GOAL ENG — 1-1:** monitor exited `SCORE CHANGE 1-0 -> 1-1 at
  36'` (monitor minute stale; footage/ledger minute = 46). Footage logged away goal
  id `18213979:390`, score `1-1`; scorer filled moments later as **46' ENG
  Bellingham, Jude**. Required fresh SCORE PROBE and 15s follow-up both got zero
  messages because fresh joins are still wedged; monitor restart attempted but hung
  before `WS open`. Footage's existing watcher remains the live witness. Goal
  segments closed with zero console errors, but new page/socket opens in those
  segments reported `opens=0`, matching the fresh-join failure.
- **23:51 monitor restart abandoned until fresh joins recover:** restarted monitor
  produced two `Unexpected server response: 503` errors, then exited `FEED STALL`
  with no messages. Required post-stall probe also got zero messages. Not spinning
  monitor restarts; footage's established watcher is still receiving odds and is the
  live witness until fresh joins recover.
- **23:52 / 48' ENG event — ROOOT feed says 1-2, external sources say HT 1-1
  (HONESTY ESCALATION):** footage watcher logged away goal id `18213979:410`,
  score `1-2`, scorer `null`, then status `HALF_TIME`. Fresh WS join check still
  returned 0 messages. External checks at ~00:05 CEST found Guardian key events
  `HALF TIME: Norway 1-1 England` and `GOAL! Norway 1-1 England (Bellingham 45+2)`,
  plus a 45+4 note that Kane put the ball in the net but was flagged offside; AP
  also reports HT 1-1. Sources:
  `https://www.theguardian.com/football/live/2026/jul/11/norway-v-england-world-cup-2026-quarter-final-live`
  and `https://apnews.com/article/f246f138c3a8563cb5a0e3f4037e930a`. Treat the feed's 48' score `1-2` as **unverified / likely
  disallowed Kane offside** until coordinator confirms the TxODDS correction path.
  This is live-severity if any ROOOT surface displays 1-2 as real. HT segment closed
  cleanly with zero console errors, but page/socket opens remained `0` in the
  post-wedge segments.
- **23:55 half-time Fly status:** machine still `started` / HostStatus `ok`, but
  health check critical for >6m: `context deadline exceeded (Client.Timeout
  exceeded while awaiting headers)`. Recommendation stands: don't repeat the same
  restart loop blindly; it briefly restored WS then wedged again. Needs coordinator
  app-level diagnosis/different mitigation before second half.
- **00:29 owner report: live loom broken — INVESTIGATION:** backend had been
  restarted again at `00:25:30 CEST` (machine status showed new uptime ~67s and
  health passing). Fresh WS recovered and `/live` rendered cleanly with one WS open
  and no console/page errors; screenshot `/tmp/rooot-live-investigate-18213979.png`.
  But the rendered loom showed `NOR 2-1 ENG · LIVE · 67'`. That is the break:
  Guardian/AP say HT was 1-1 and Guardian says Norway's 55' second-half goal was
  nullified by VAR. Live wire proof: ledger has `goal` id `18213979:490`, minute
  54, side home, `Confirmed:false`, score `{home:2,away:1}`, followed by VAR id
  `18213979:492` at 55/56 with `Outcome: Overturned`. Server `parseScoreMessage()`
  (`contracts/normalize.ts`) emits `score` for every `Action:'goal'` regardless of
  `Confirmed`, while `loom-adapter.js` trusts `type:'score'` as authoritative.
  Result: unconfirmed/overturned goal poisoned `joinSnapshots.score`, and every
  fresh loom shows 2-1. **Fix belongs coordinator/server parser:** never broadcast
  an unconfirmed goal as authoritative score; keep/broadcast confirmed score only,
  and explicitly roll back/chalk off on `var_end Outcome:Overturned` if a held-goal
  score escaped. Client already has `chalkOff()` support, but it needs a corrected
  score message from the server.

**FREEZE SHA (22:40):** `6156ea9` — `main` == `origin/main`.
