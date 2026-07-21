# NIGHT NOTES — ESP–BEL 2026-07-10 (fixture 18218149, KO 21:00 CEST)

*Match-night ops instance. Timestamps CEST. Evidence inline or by path.*

## Pre-afternoon state (15:06–15:15)

- **15:06 §3 self-verify:** `main` == `origin/main` @ `e8d3058`. Dirty tree = loom/design
  working files only (woven-loom.html, loom-tape.js, design/loom-object/ — active lanes, expected).
  Backend chain (persistence/verdict) NOT yet on origin/main — runbook expects it this afternoon;
  escalation deadline ~17:00.
- **15:07 health:** `{"uptime":9095,"matchesActive":0,"clients":0}` — up, but uptime implies
  **Fly restart ~12:35 CEST today**.
- **15:10 restart flag RESOLVED:** `services/stands/captures/premiere-fra-mar-18209181-919c9af.json`
  (written 11:24, before restart) holds full FRA–MAR consensus: n=5 locked, home n=2 (both 2–1),
  away n=3 (all MAR, mean 1–2.33, modal 1–2) — matches postmortem table. Aggregates preserved.
- **15:08 warm 4.1 GREEN:** 74 odds msgs in 12s; ESP 0.600 / draw 0.235 / BEL 0.165 (sum ≈ 1.000).
- **15:08 warm 4.2 GREEN:** canary smoke 6 pass / 0 fail / 0 skipped (table read, no SKIPs on
  identity or WS). Results: `scripts/canary/results/smoke-2026-07-10T13-08-27-463Z.json`.
- **15:09 warm 4.3 RED (expected pre-deploy, deadline 18:00):** landing = zero ESP/BEL, zero
  `match=18218149`, stale `LIVE NOW / FRA v MAR LOOM` in mast; `/gate` count 0. Design T1/T2 not
  deployed yet.
- **15:12 loom /live known open item CONFIRMED still open:** https://rooot.club/live themes
  FRA blue v MAR red, header "FRA 0–0 MAR · LIVE · 0'" — wrong fixture + dishonest LIVE at 0–0
  (match ended last night; restart wiped state so loom renders empty default 18209181).
  Screenshot taken 15:12. Loom lane; owner routes if not landed by 18:00.

## Watching

- [ ] Backend chain commits on origin/main — deadline ~17:00, else escalate coordinator.
- [ ] Design T1 (six-file ESP–BEL bump) + T2 (landing) visible on prod — deadline 18:00, else owner.
- [ ] Loom /live ESP/BEL theme — deadline 18:00 window, owner routes to loom instance.

- **15:20 origin/main moved** `e8d3058` → `a13ce09` — ops doc only (design-executor instantiation
  prompt). NOT the backend chain; 17:00 deadline still open.
- **15:20 OWNER: ops instance paused** until owner wakes it closer to KO. Deploy watcher stopped.
  On wake: re-run §4 warm checks fresh, re-check backend chain + T1/T2 + loom /live, then pick up
  the §2 schedule at the current clock.

## Owner verdicts log

- **15:20** Owner: "stop for now, I will tell you when to wake up, closer to game start." Paused;
  interim deadline-watching (17:00 backend chain, 18:00 surfaces) is with the owner.

*(every taste-call verdict gets logged here; nothing asked twice)*

## Wake-up catch-up (20:04–20:35)

- **20:04 wake:** owner woke instance. Backend chain fully landed while paused — origin/main at
  `08b07d2` (persistence v2/v3, fan serial, moment-open dedup, durable volume, atomic snapshot).
  Design T1–T7 also landed (fixture default everywhere, landing kills stale LIVE NOW, cheer echo,
  verdict 3-state, THE CARD, BEL tricolor, gate redesign). Fly restarted again since 15:07
  (uptime 2704s at 20:04) — expected, matches the volume-mount deploy.
- **20:08 §4.1 GREEN (re-run):** 55 odds/12s + consensus msg now present; ESP 0.593/draw 0.237/
  BEL 0.170, sums 1.000.
- **20:08 §4.2 GREEN (re-run):** canary 6/6 pass, `/live` loads clean + WS OPEN.
  `scripts/canary/results/smoke-2026-07-10T18-08-52-860Z.json`.
- **20:08 §4.3 GREEN (re-run):** landing = `ESP v BEL`, `match=18218149`, zero stale `LIVE NOW`;
  gate count 3.
- **20:10 tool-access glitch:** `flyctl ssh` (correctly declined — didn't push). Then a browser
  screenshot and a plain `curl` both got denied citing the SSH command verbatim — classifier stuck,
  not a real policy hit. Stopped after 3 strikes, flagged to owner, owner said retry — cleared on
  next attempt. No workaround attempted; noting in case it recurs.
  **Open watch item:** `flyctl ssh` reads are needed for the FT protocol (§8.3/8.4 crystallize-once
  + durability check) — may need explicit owner go-ahead again at FT if the classifier is stateful.
- **20:20 loom /live theme CONFIRMED FIXED:** screenshot shows "ESP 0–0 BEL" correctly themed
  (ESP red). Raw-HTML grep earlier found FRA/MAR/18209181 tokens but context showed they're noise
  (CSS `FRAME` comment, `MARKS`/`MARKET` variable names) plus a legitimate team-metadata lookup
  table that still carries last night's fixture as a historical entry — not a live-default bug.
  Known open item from handoff is RESOLVED.
- **20:20 NEW FINDING flagged to owner:** loom `/live` header reads "LIVE · 0′" at 20:20, ~40min
  *before* kickoff (21:00). Odds are genuinely live (pre-match market), but "LIVE · 0′" beside
  "0–0" reads as an in-progress match claim, not a pre-match one — possible honesty-adjacent
  phrasing issue. Flagged with screenshot; awaiting owner call on whether to route to loom instance
  before 21:00 or accept as intentional "feed is live" framing.
- **20:32 §freeze:** origin/main sha recorded below. Tree dirty with same design/loom in-progress
  files as all day (not ops-lane, not blocking).
- **20:32 rehearsal gap:** 18:30 slot passed while paused; did not run. Owner: "let's do it" —
  running compressed version now, ~28min before kickoff, cutting to the Release Gate lines that
  matter most (opposite ends admitted, distinct predictions, cross-end cheer visible, presence
  survives lens switch) rather than the full script.

**FREEZE SHA (20:32):** `acba539` — runbook doc update only (post-restart SSE warm-up rule: zero
odds under 2min uptime is not an outage — useful false-alarm guard for tonight). `main`==`origin/main`.
This sha is production identity for the rest of the night; any further deploy needs live-severity.

## Compressed rehearsal (20:33–20:36, my side — ESP)

- **20:33 gate:** landing clean (`TONIGHT 21:00 · ESP v BEL`, ticket honestly reads "PRINTS FROM
  21:00"). Entered gate, picked ESP, predicted 2–1, market shown live de-vigged ESP59/X24/BEL18
  matching WS. "TAKE YOUR PLACE" correctly disabled until side+score both set.
- **20:34 ground:** admitted. **BELGIUM · THEIR END already showed "1 here"** before I asked
  owner anything — cross-end presence confirmed live. Fan predictions "ESP 1.7–1.0 BEL FROM 3
  FANS" (2 ESP incl. me + 1 BEL — consistent with a real earlier check-in from today, not
  synthetic).
  - Owner asked to take BEL, opposite end, distinct score, confirm cross-end cheer + own admission
    — **awaiting owner confirmation on their screen.**
- **20:35 cheer:** fired once from ESP end ("ROOOT!" burst, own-end bar → LOUD). Cross-end echo
  visibility on owner's BEL screen — awaiting their confirm.
- **20:35–20:36 lens switching:** LOOM and STADIUM tabs both checked — presence held throughout
  (ESP 2 here / BEL 1 here unchanged across all three lenses). STADIUM pre-match state is honest:
  all stat circles 0, 50/50 territory, score "0–0 / 0'" **with no LIVE badge** — confirms the
  "LIVE · 0′" issue is isolated to the standalone `/live` loom route, not systemic.
- **Still open:** owner's BEL-side confirmation (admitted, cheer echo seen, presence across
  lenses, consensus n=2 with two distinct calls visible). Not blocking — battery moved on given
  the clock; will fold owner's answer into the gate verdict once given.

## Pre-match battery (20:36, 24min to KO)

- **20:36 scores watch armed:** `live-scores-watch.mjs 18218149` running in background, polls
  every 25s, exits on real GameState/live envelope (or 20min re-arm). Will flag if not fired by
  ~21:03.
- **20:36 live monitor armed:** `live-monitor.mjs 18218149` running in an auto-restart wrapper —
  exits/notifies on kickoff, score change, status change, red/pen/VAR, feed stall, or 15min
  re-arm; wrapper relaunches it each time automatically.
- §4.1/4.2/4.3 last confirmed green at 20:08, within the battery window — not re-run again at
  20:36, all three deploys since (`acba539` runbook doc, no code) don't touch surfaces or feed.

## Match watch (from ~20:40)

- **20:40 transient feed stall, self-resolved — NOT escalated:** live-monitor wrapper fired
  "FEED STALL — no feed msg for 103s" at 20:40. Checked immediately: health uptime 4739s (no
  restart), fresh independent WS probe same minute showed 89 odds + consensus msgs healthy
  (ESP 0.587/draw 0.241/BEL 0.173), origin/main unchanged. Reads as one connection-level hiccup
  on the monitor's own socket, not a service outage — wrapper auto-restarted per design, feed
  confirmed alive seconds later. Below live-severity bar; logged not interrupted.

- **20:56 live-monitor re-arm (routine, no action):** 15min window elapsed, feed healthy at exit
  — wrapper restarted per design. Not logging further routine re-arms unless something's off.

- **21:00:56 KICKOFF — GREEN:** scores-watch fired real signal (kickoff/kickoff_team/status
  envelopes). Verified independently: `consensus.locked=true` (predictions correctly locked),
  `status.phase=FIRST_HALF, minute=0, Clock.Running=true`, `score=null` (correct, no goal yet).
  Kickoff beat matches runbook §7 exactly. Live monitor + scores-watch both restarted fresh to
  keep watching through first half.

- **21:03 scores-watch retired (routine, no action):** now mid-match, the scheduled→live tripwire
  condition is trivially true every poll, so it just re-exits instantly on each restart. Its job
  (catch a scores-coverage gap at kickoff) is done and passed. Not restarting again — relying on
  `live-monitor.mjs` (already running) for the rest of the match: score changes, status changes,
  VAR/red/pen, feed stalls.

- **21:12 second transient feed stall, self-resolved — NOT escalated:** same shape as 20:40.
  Checked: uptime 6655s (no restart), fresh probe same minute showed 172 odds/109 spell/47
  ledger msgs in 10s — service clearly healthy and very active, FIRST_HALF, score still 0-0. This
  is a recurring pattern on the monitor's own long-lived WS tap specifically (2nd occurrence,
  ~32min apart) — worth a coordinator FYI post-match (not urgent, self-heals every time via the
  wrapper's reconnect), but each time independently confirmed the actual service/feed is fine.

## First goals + ground-page hang (21:41–ongoing)

- **21:41 first goals confirmed (real match state, via fresh probe, not just the monitor alert):**
  goal 1 min 29 ESP (Ruiz Pena, Fabian) → 1-0, confirmed. Goal 2 min 40 BEL equalizer → 1-1.
  Monitor's own alert only showed the SECOND change (1-0→1-1) because the wrapper's restart
  between goals silently re-seeded 1-0 as baseline (by design — join-snapshot seed, not alerted).
  Both goals independently verified via ledger envelopes + score envelope.
- **21:41–22:19 GROUND-PAGE HANG — flagged live-severity to owner, evidence below:**
  - My real ESP session (tab, `from=gate&live=1`, admitted 20:34) stopped responding to
    script-injection (screenshot + get_page_text) starting ~21:41, right around the goal window.
    Reproduced across: original tab (4x), a full page reload of that same tab, and persisted
    through half-time (22:05) and into second half (22:19+) — 14+ min unbroken at last check.
    `get_page_text` error was explicit: "waited 45000ms for document_idle."
  - Isolated, not global: the gate page (`/gate?live=1...`) responded instantly on the same
    browser at the same time. A `/ground?match=...` WITHOUT `live=1`/gate params also responded
    instantly — but that route turned out to serve a **separate finding**: a fake "ARG v CPV"
    demo/specimen crowd (14,100), honestly labeled "SPECIMEN · SAMPLE" but silently substituted
    instead of real data or a redirect to gate. Noted for coordinator, lower priority than the hang.
  - Console evidence (read_console_messages, not affected by the hang): on the reload, before
    the browser had captured messages since session start `stands-adapter`/`stats-adapter` logged
    "live wire → 18218149" **20 times within ~1 second** (10 each), vs 2 each (parent+iframe, as
    expected per the FRA-MAR postmortem's own note on socket count) on the original clean
    pre-match entry. Reads as a reconnect storm — each reconnect re-pulls the postmortem's
    documented ~1,604-msg/0.85MiB join-snapshot replay, which at 10x could plausibly peg the main
    thread long enough to explain the observed hang.
  - Did NOT do a second real gate entry to test a genuinely fresh live join — avoided creating a
    second synthetic prediction/write under the "once" rule. So: NOT independently confirmed
    whether this hits every fresh joiner or specifically reload/reconnect paths.
  - **Asked owner directly to check their own real phone (ground truth) — no answer yet as of
    22:28.** Not re-escalating further until that answer lands or something gets worse.

## Overnight monitor gap (21:12ish → 15:57 next day)

- **Root cause (my error, owning it plainly):** the live-monitor auto-restart wrapper hit a
  sustained local network/machine outage overnight — signature errors: `getaddrinfo ENOTFOUND
  rooot-stands.fly.dev`, `connect ETIMEDOUT`, `socket hang up` — classic "no network at all," not
  a Fly-side incident. I searched for the TaskStop tool schema at the time but never actually
  called it, so the wrapper kept retrying uselessly for hours generating pure noise instead of me
  catching it and re-checking real state promptly. Stopped for real at 15:57 on manual review.
- **Verified on resume:** service uptime unbroken (74150s, no restart), `origin/main` gained only
  one unrelated commit overnight (`3137e86`, OG share-image meta). Nothing about ESP–BEL was
  touched or fixed while I was blind. Final score/verdict from last night stand as recorded.

## Pulse/moments — recurring failure, confirmed with evidence (2026-07-11 ~16:05)

- **Owner report:** zero reaction opportunities seen in the stands all match; zero advance notice
  in the loom that reactions were even possible.
- **Verified independently, three ways:**
  1. Fresh full-match WS replay (401 odds / 744 possession / 424 ledger / 1 score / 1 status / 1
     consensus messages) contained **zero** `moment` or `momentResult` messages — every other
     event type replayed comprehensively, moments didn't exist in the stream at all.
  2. `apps/web/public/terrace.html` (the stands) **is wired for live Pulse** — T6 code reads the
     live `{momentId,kind,side,minute,opensAtMs,closesAtMs,palette[6]}` schema, explicitly
     commented "always sent — never demo-gated." The client was ready and got nothing to show.
  3. `apps/web/public/woven-loom.html` (confirmed via page title this is what's actually deployed
     to `/live`) has **zero** `onMoment`/`momentReact`/Pulse references anywhere in its 687 lines.
     The only file with that wiring is `loom-proto.html` — a separate, older prototype (fixture
     refs to SUI-COL/ARG-EGY, pre-dates the ESP-BEL freeze commit) that isn't what shipped.
- **Read:** stands was ready and never got sent anything; loom was never built to say anything in
  the first place. This is the identical shape to the FRA-MAR postmortem's Pulse finding ("alive
  on the server but absent from the live product") — recurring, not a new regression.
- **Could NOT verify from here:** why the server never broadcast a single moment during the match
  (detection never fired vs. fired but didn't broadcast vs. moments excluded from replay by
  design) — that needs server-side log access. `flyctl ssh` reads are blocked by an auto-mode
  classifier glitch tonight (see below) — same false-positive pattern as pre-match, citing the
  most recent sensitive command's denial reasoning against unrelated read-only calls. Retrying
  once cleared it for a plain WS probe; hasn't been retried yet for the actual ssh commands.
- **Escalation: coordinator + design**, citing this evidence and the postmortem section verbatim.
  Engineering: wire moment detection/broadcast against the live schema server-side (client's
  already there) or disable the stands picker honestly if it can't ship. Design: the loom needs
  an actual notice mechanism built — it currently has none, this isn't a rendering bug.

## Full-time protocol closeout (2026-07-11 16:10, owner-authorized flyctl ssh)

- **Crystallize-once: GREEN.** `/data/sentiment/` holds exactly one file —
  `18218149-1783717160302.json` (210330 bytes). Filename epoch resolves to ~23:00 CEST; file
  mtime `Jul 10 20:59` (container UTC) = `22:59 CEST` — matches the independently-confirmed
  FULL_TIME moment (22:59:33) exactly. Re-checked 17+ hours and a full overnight network-outage
  cycle later — still exactly one file. Double-crystallize guard held under real conditions.
- **Durability: GREEN.** `/data/rooot-stands-snapshot.json` present, 4195 bytes, mtime
  `Jul 11 14:45` — about an hour before this check, confirming the snapshot mechanism is
  actively persisting on an ongoing basis, not just a one-time FT write.
- **Archive capture: skipped, correctly.** The runbook's 30s WS capture is scoped to "right after
  FT, join-replay + live tail" — 17 hours later that window is gone; a fresh capture now would
  show idle state, not the match. Not run; not needed. The full-match data already lives in
  the persisted snapshot + sentiment file above.
- **Two items never got a clean answer and are worth naming rather than burying:**
  - Owner's own BEL-side rehearsal confirmation (admitted, cross-end cheer echo seen, presence
    across lenses, consensus n=2) was asked for at 20:34 and never came back — rehearsal moved on
    under time pressure before kickoff. My own ESP-side checks all passed; BEL side unverified.
    No numeric owner scores (intuitive/fun/easy/beautiful/shareable) were given this session.
  - The `flyctl ssh` / plain-Bash denial pattern recurred twice tonight (pre-match ~20:10, and
    again at FT ~16:00 next day) — same signature: classifier cites the most recent sensitive
    command's reasoning against unrelated calls. Both times cleared on retry or explicit
    re-authorization. Not diagnosed further (out of my lane) but worth a coordinator FYI if it
    keeps happening — it cost real time twice.

## Escalations log

*(what, lane, evidence, timestamp, outcome)*
- **2026-07-11 ~16:05 — Pulse/moments dead all match (stands silent, loom blind) → coordinator +
  design.** Evidence: zero moment messages in full-match replay; terrace.html live-wired and
  unused; woven-loom.html has no moment code at all (loom-proto.html does, but isn't deployed).
  Matches FRA-MAR postmortem's identical prior finding — recurring failure. Not yet routed to the
  owner's chat channel — logged here per protocol, owner has this session's evidence directly.
- **2026-07-10 21:41–22:19 — ground-page hang → coordinator, evidence given, no owner
  confirmation received.** My real ESP session hung reproducibly for 14+ min across the first-goal
  window; isolated to the live ground render, not global. Owner never confirmed their own phone's
  state at the time — status unresolved, worth asking directly if it recurs tonight.
