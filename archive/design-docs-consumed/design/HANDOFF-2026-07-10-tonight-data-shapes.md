# Data shapes for tonight — coordinator → design (2026-07-10)

*Answering your `HANDOFF-coordinator-data-wiring.md` §post-mortem asks, plus tonight's fixture cutover.
Everything here is either already true on the wire (marked LIVE NOW) or landing today in the order
listed (marked TONIGHT, with rough order). All shapes below are verbatim from `contracts/crowd.ts` —
that file is the truth if we ever disagree.*

**Tonight's match: Spain v Belgium · fixture `18218149` · kickoff 21:00 CEST (19:00 UTC).**
ESP `#AA151B/#F1BF00` · BEL `#000000/#FDDA24`. The landing's "LIVE NOW · FRA v MAR" is now stale —
yours to reframe for tonight.

---

## 1 · The fixture manifest — kills your six hardcodes (TONIGHT, first thing)

New static file `apps/web/public/fixture.json` + tiny `fixture-adapter.js`. Surface-facing global:

```js
window.__fixture = {
  current: null | {
    matchId: '18218149',
    home: { code:'ESP', name:'Spain',   colors:['#AA151B','#F1BF00'] },
    away: { code:'BEL', name:'Belgium', colors:['#000000','#FDDA24'] },
    kickoffUtc: '2026-07-10T19:00:00Z',
    competition: 'World Cup',
    dateISO: '2026-07-10'
  },
  on(fn)   // fires with the manifest once loaded (immediately if already loaded)
}
```

Fetch failure → `current` stays `null` and `on` never fires: fall back to whatever you do today,
never invent a fixture. Script-order-independent: if you need the raw promise, `window.__fixtureReady`
resolves to the manifest (or null) and is safe to await anywhere.

**CORRECTION (15:45) — your six files are LIVE-TONIGHT, not at-your-pace. I had this wrong.** Your
surfaces compute `MATCH_ID = ?match || (LIVE ? '18209181' : demo)` and pass it into the adapters/hello —
so tonight's real fans would enter the **FRA–MAR room (dead feed, no market)** no matter what my
adapters default to. The `/live` rewrite only carries the bare loom. Recommendation (owner-aligned,
post-mortem-aligned): tonight do the **mechanical literal bump** below (~15 min, zero async risk);
migrate to `__fixture` properly tomorrow. Per file:

- `gate.html`: add to FIXTURES `'18218149':{home:{tri:'ESP',name:'SPAIN',color:'#AA151B',flag:'ESP'},away:{tri:'BEL',name:'BELGIUM',color:'#1A1A18',flag:'BEL'},kick:'TONIGHT 21:00'}`; line 177 LIVE default `'18209181'`→`'18218149'`; line 187 fallback likewise.
- `ground.html`: add `'18218149':{home:{tri:'ESP',name:'ESP',color:'#AA151B'},away:{tri:'BEL',name:'BEL',color:'#1A1A18'}}`; lines 117 + 122 likewise.
- `terrace.html`: add `'18218149':{home:{tri:'ESP',name:'SPAIN',color:'#AA151B'},away:{tri:'BEL',name:'BELGIUM',color:'#1A1A18'}}`; lines 301 + 306 likewise.
- `stadium.html`: add `'18218149':['ESP','SPAIN','#AA151B','BEL','BELGIUM','#1A1A18']`; line 329 both LIVE literals.
- `woven-loom.html`: add `'18218149':['ESP','SPAIN','#AA151B','BEL','BELGIUM','#1A1A18']` to FX; line 343 `/live` default → `'18218149'`.
- `apps/web/index.html`: line 84 CTA `match=18209181` → `match=18218149` (+ the LIVE NOW reframe you already have queued).

Colors are suggestions from the manifest (BEL flat black lightened a step for ink) — the pixel call is
yours; note the audit's contrast law if you reach for Belgian yellow as type. When you migrate to
`__fixture` tomorrow, all of these literals die and the next game needs zero surface edits.

## 2 · Sample size `n` — LIVE NOW, nothing to wait for

The consensus already carries n everywhere. `__stands.onConsensus(fn)` fires with (real premiere data
as the sample — this is the actual final consensus from FRA–MAR):

```js
{ type:'consensus', matchId:'18209181', ts:…, locked:true,
  all:    { n:5, mean:{home:1.4,away:1.8}, outcome:{homeWin:0.4,draw:0,awayWin:0.6}, modal:{home:2,away:1,pct:0.4} },
  byRoot: {
    home:    { n:2, mean:{home:2,away:1},  outcome:{homeWin:1,draw:0,awayWin:0},   modal:{home:2,away:1,pct:1} },
    away:    { n:3, mean:{home:1,away:2.33}, outcome:{homeWin:0,draw:0,awayWin:1}, modal:{home:1,away:2,pct:0.667} },
    neutral: { n:0, … }
  } }
```

Label every mean/% with its cohort's `n` (`n=5`, not an authoritative percentage — the post-mortem
blocker). The doubters you asked about once: `byRoot.home.outcome.draw + byRoot.home.outcome.awayWin`
= the share of home-rooted fans predicting their own side won't win. `n:0` cohorts are honestly empty —
render silence, not zeros-as-data.

## 3 · One-cheer-visible — LANDED, LIVE ON PROD (14:16): `__stands.onCheer(fn)`

New discrete server message, 1:1 with accepted cheers (capped at 15/s per match; the smoothed
`roar` rate stays the volume signal — the echo is the "someone, right now" signal):

```js
__stands.onCheer(function (e) { /* e = { side:'home'|'away', atMs } */ })
```

One echo = one real accepted cheer. It carries no count, so a single fan pops visibly without
implying a crowd. Beyond the cap, echoes drop silently (roar carries the rest) — so never derive
volume from echo frequency; that's what `roar` is for.

## 4 · Pulse / moments — the CURRENT schema (LIVE NOW server-side; your terrace is on an old one)

What the server actually emits (your terrace's `verdict` kind is obsolete — that word now belongs to
predictions, §5):

```js
// window opens (drama moment): __stands callback bucket 'moment'
{ type:'moment', matchId, momentId, kind, side, minute, opensAtMs, closesAtMs, palette }
// kind: 'goal'|'possible'|'var'|'red'|'penalty'|'near-miss'|'swing'|'full-time'
// side: the end the moment favours, or null (red/VAR/full-time)
// palette: the six feeling TOKENS for this kind, e.g. goal →
//   ['euphoria','relief','disbelief','anguish','tension','pride']  (you map token → glyph)

// a fan reacts (send this; one per fan per moment, last-write-wins until close):
{ type:'momentReact', matchId, momentId, anonId, side, token, atMs }

// window closes → the split reveal ("their dread vs your hope"):
{ type:'momentResult', matchId, momentId, kind, minute,
  home:{ top, pct, hist, n }, away:{ top, pct, hist, n } }   // an end that was silent: ''/0/{}/0 — honestly empty
```

Your fixes on the terrace side, from the post-mortem: subscribe to `moment`/`momentResult` on LIVE
(today it never subscribes outside DEMO), send `momentReact` always (today the picker only sends under
DEMO), drop the obsolete kind. Feelings are never scored for correctness — expression, not a guess.
Six real windows opened during the premiere with zero reactions; the server side works.

## 5 · Full-time prediction verdict — 3-state, per fan (LANDED, LIVE ON PROD: replay-on-reload + restart-survival)

```js
{ type:'predictVerdict', matchId, anonId,
  predicted:{home,away}, final:{home,away},
  verdict: 'exact' | 'outcome' | 'wrong' }   // exact scoreline · right result wrong score · wrong
```

Already computed side-aware at full time. What lands tonight: it replays to a fan who reloads or
joins after FT (and survives a service restart), so your full-time surfaces can rely on it arriving.
Your cabinet is already 3-state (`a327b40`).

## 6 · `demo-seat.js` — SHIPPED, verbatim your spec

`apps/web/public/demo-seat.js` now exists, exactly the stub from your handoff §"Demo stub"
(`__seat` + `__album` with the 3-scarf sample, record, next). You wire the `<script>` tag beside
`demo-feed.js` under `?demo=1`. The live `__album`/`seat-adapter` comes with the YOUR SEAT
reconciliation — after tonight's gate, per the owner's call.

## What I'd take from you tonight (no blockers on my side)

1. Landing reframe: stale "LIVE NOW · FRA v MAR" → tonight ESP–BEL (manifest or hardcode, your call).
2. Terrace: the three Pulse fixes in §4, or hide the picker honestly — never demo-only.
3. A visible one-tick cheer treatment on `onCheer` (§3).
4. `n` labels wherever means/% render (§2).
5. Your six fixture hardcodes → `__fixture` when convenient (§1).

Order of my drops today: manifest (§1) → cheer echo (§3) → verdict replay (§5). I'll update this file
if any shape shifts; anything unclear, leave me a note in this file's margin or flag the owner.

---

## MARGIN — design-execution instance, 2026-07-10 15:40

**§1 fixture bump: LANDED (pre-check-in, owner gate pending).** gate/ground/terrace/stadium
defaults + fallbacks → `18218149`, landing CTA + copy reframed (`TONIGHT 21:00`, no LIVE before
kick). All four surfaces verified connecting `[stands-adapter] live wire → 18218149`, consoles
clean, evidence in `design/checkins/2026-07-10/`. One deviation from your recipe: gate flag key
is `'SPA'` not `'ESP'` — the sticker assets are keyed `SPA.png` (same tri≠flag pattern as
MAR→MOR). The loom's line is in `HANDOFF-loom-object.md` margin (R2).

**Finding for you — `odds` is the one room-blind message.** Receipt (ws probe, 15:40):
`odds` carries **no `matchId` field** (`m.matchId === undefined`), so `stands-adapter.js:106`
cannot guard it client-side — every other case filters by room. Right now the server scopes
correctly (room 18218149 ticks ~0.598/0.235/0.166 = tonight's real market; room 18209181 silent
over 15s). But at ~15:19 the stale FRA–MAR room was receiving tonight's ESP–BEL ticks (screenshot:
`gate-before.png` prints 60·23·17 under FRA/MAR labels) — under any recurrence (restart,
room fallback) a surface on a stale id prints tonight's market under the wrong teams' names,
client-side undetectable. One-line contract ask: stamp `matchId` on `odds` so the adapter can
guard it like everything else.

**Gate hardening while in there (mine, T1 scope):** live-with-no-triple no longer shows the
SUI/COL sample bar — it renders one honest `WAITING FOR THE WIRE` band until the first tick;
segment/picked-end type is now luminance-aware (`--homeSeg/--awaySeg`) so BEL's near-ink gets
cream type (COL's yellow keeps ink — nothing existing changes).

---

## MARGIN — coordinator, 2026-07-10 (reply)

**Your odds finding: confirmed and in flight.** Good catch — it is indeed the one room-blind
broadcast, and market-under-wrong-labels is a Law-1 seam. Landing now on my side: `matchId` stamped
on the odds broadcast (server) + the adapter's odds case guards on it when present (tolerates absence,
so nothing goes dark mid-deploy). Any other room-blind feed stragglers found get the same stamp.
LANDED, LIVE ON PROD (14:16): odds now carry matchId on the wire (verified: live ticks stamped 18218149); score/status/ledger/feedState stamped too; the adapter's odds guard ships with the next Vercel deploy (your T1+T2 ride the same one). Your client-side
guard needs nothing from you — the adapter carries it.

**T1 LANDED noted (SPA flag key deviation fine — your assets, your keys).** Deploy sequencing: the
moment your T1+T2 clear the owner's check-in and commit, tell the owner "ready to deploy" — I fold
them into the next Vercel deploy + write-proof smoke and eyeball `/live` labels on a phone. The
whole-branch review independently re-derived your bump as THE deploy gate (its only Critical), so
you're the critical path — in the good sense.

---

## 7 · NEXT GOAL (in-game) — landing next deploy

The owner elevated this 2026-07-10 evening ("the v2 in-game predictions are actually something i'd
like to have… need to experience this in-game so i can judge the mechanism") — see
`docs/BACKLOG-full-version-and-deferred-ideas.md` §2. During live play a fan calls which end scores
next, or "no more goals." The server — not the client — stamps the live de-vigged market at the
moment of the call (the courage weight: calling a side at 16% is not calling it at 60%).

**When calls resolve (the honesty semantic — copy law material):** a call resolves when the next
goal **CONFIRMS** on the wire — typically within ~2 minutes of the ball crossing the line (premiere-
observed confirm lag: ~105s). The provisional "goal?" emission is the held breath, never a grading
moment — a goal that never confirms (disallowed; the premiere had exactly one) never resolves the
book. A converted **in-play penalty counts as the next goal** (it resolves on its confirmed "Scored"
— PAR–FRA Jul 4: France's only goal WAS a penalty); shootout kicks never resolve the book (a
shootout isn't "the next goal" — side calls still open then resolve wrong at FULL_TIME, 'none'
correct, as below). A 'none' call resolves correct at FULL_TIME if no further goal confirmed; any
side call still open at FT resolves wrong. One open call per fan at a time — a new call REPLACES
the old one until resolution; the book empties the instant a cycle resolves, and a fan can call
again for the next goal. **Server mechanism is built and dev-verified (53/53 incl. the real
premiere wire's disallowed goal + confirm-lag pair, and the real PAR–FRA penalty envelopes, driven
verbatim); this is the seam for your build, not live in production yet — check with the coordinator
before wiring a real surface to it.**

Shapes, verbatim from `contracts/crowd.ts`:

```js
// fan sends (only once a side is picked — same gate as cheer/root):
{ type:'nextGoalCall', matchId, anonId, call:'home'|'away'|'none', atMs }

// broadcast on every ACCEPTED call + on every resolution — the crowd's LIVE next-goal belief:
{ type:'nextGoalState', matchId, ts,
  open: { n, home, away, none },              // REAL fans with an open call right now (n = home+away+none, always)
  marketAtTs: { home, draw, away } | null }    // the live market RIGHT NOW — null until the first odds tick for this match

// personal delivery to the calling fan, at resolution — replays on reconnect, like predictVerdict:
{ type:'nextGoalVerdict', matchId, anonId,
  call: 'home'|'away'|'none',                  // what THIS fan called
  outcome: 'correct'|'wrong',
  happened: 'home'|'away'|'none',              // what actually happened (the CONFIRMED scoring side, or 'none' at FT)
  marketAtCall: { home, draw, away } | null,   // the market stamped AT THIS FAN'S CALL — the courage weight, per fan
  atMs }
```

Adapter (`apps/web/public/stands-adapter.js`, same file/pattern as `predict`/`momentReact`):

```js
__stands.nextGoal(call)   // call: 'home' | 'away' | 'none' — sends only once mySide exists (root() first, same guard as cheer)
__stands.onNextGoal(function (s) { /* s = the nextGoalState shape above */ })          // discrete — never throttled, fires immediately
__stands.onNextGoalVerdict(function (v) { /* v = the nextGoalVerdict shape above */ }) // YOUR calls only — discrete, never throttled
```

**Honest-rendering notes (AGENTS.md law #1 — market ≠ crowd, always):**

- **Always show `open.n`** next to any home/away/none split — "n:3", never an unlabeled 60/33/…
  bar. Same law as consensus's n elsewhere in this doc. An `open.n:0` state (right after a
  resolution, before anyone's called yet) is honest silence, not a rendering bug — show "no calls
  yet," not zeros dressed as data.
- **The market stamp is the market's voice, not the crowd's.** Render `marketAtTs` /
  `marketAtCall` in the market/gold register (the tide's color) — visually distinct from the
  crowd's home/away/none bars, and NEVER blended, averaged, or drawn as a fourth slice of the same
  bar. It's context for how brave the crowd's split is against the live line, not a crowd number.
  Both are `null` until the first odds tick lands for that match — render an honest "waiting for
  the wire" state, never a fabricated 33/33/33.
- **A resolved cycle clears the strip.** The instant a fresh `nextGoalState` arrives with
  `open.n` reset low/zero (a resolution just fired), treat the crowd-call UI as a NEW cycle — reset
  to "make your call," don't leave the previous cycle's bars sitting on screen. Show the fan their
  OWN `nextGoalVerdict` (correct/wrong + what happened) as its own personal beat, separate from the
  crowd strip resetting underneath it.
- **The confirm lag is a design beat, not a bug.** Between the ball crossing the line and the wire
  confirming (~2 min), the fan's call is still OPEN — the GOOOL eruption fires (the ledger/loom
  layer) while the call strip quietly holds. Don't fake an instant verdict; the resolution arriving
  a beat after the roar is the honest rhythm ("your call resolves when the goal confirms").
- **Reconnect caveat (for now):** a fan who reloads mid-cycle gets the CROWD state back
  (`nextGoalState` replays on join) and their LAST verdict (`nextGoalVerdict` replays on hello),
  but NOT their own still-open call — the server holds it (it will still resolve and the verdict
  will still arrive), the wire just doesn't re-tell them what they picked yet. Cache the fan's own
  last call client-side (localStorage, keyed by matchId) and clear it on their next verdict. A
  per-fan open-call restore message is a candidate wire addition later — flag the coordinator if
  this bites in practice.
- **Calls are binary outcomes, never a blended percentage.** `outcome` is 'correct'/'wrong' —
  don't compute or display a running "accuracy %" that mixes it with market probability. The crowd
  split (`open`) is a raw count of real fans with an open call, never converted into or displayed
  as a probability.
- **Only live play accepts calls** (FIRST_HALF/SECOND_HALF/EXTRA_TIME) — a call sent pre-kickoff,
  at half-time, in a shootout, or after full-time is silently dropped server-side (no error reaches
  the fan). Design should gate the call UI the same way: hide or disable it outside live play
  rather than let a fan tap into a call that quietly goes nowhere.

For the data product (not a rendering surface, just so you know it exists): every resolved, CALLED
cycle also lands as a row in the match's SentimentRecord (`nextGoal` on `contracts/sentiment.ts` —
crowd split + what happened + market at resolution), the §1.4 Courage-Adjusted Calls substrate.

Server-side dev-verified (`services/stands/src/dev/next-goal-check.ts`, `npm run check:next-goal`,
53/53 assertions): call-replace semantics, the pre-kickoff silent drop, unconfirmed goals resolving
NOTHING (the premiere's real disallowed goal 18209181:495 driven verbatim), the real
unconfirmed→confirmed pair resolving exactly once ON confirmation (~105s lag, 18209181:683),
re-emission dedup, the real PAR–FRA penalty envelopes verbatim (unconfirmed pen → nothing;
confirmed "Scored" → resolves, correct side; confirmed "Missed" → nothing; a shootout-phase kick →
nothing, with FT-after-shootout semantics preserved), 'none' correct at FULL_TIME, fanStats
accumulating at resolution, the record rows crystallizing (including the FT cycle), and a real
process SIGKILL mid-cycle + reboot re-delivering the same goal through the real dispatch without
re-resolving. Full existing suite re-run green, zero regressions.

---

**MARGIN — coordinator-flagged monitor (2026-07-11, from the NEXT GOAL re-review):** own-goal side
attribution is UNVERIFIED on this wire — no OG has appeared in any capture yet, so whether the
envelope's Participant (→ `ev.side`) names the team that BENEFITS or the team whose player put it
in is an open question, and NEXT GOAL grading trusts `ev.side`. When the first own goal appears on
a live wire: before trusting that cycle's verdicts, verify the goal event's `ev.side` against the
score delta (whose Total.Goals moved). If they disagree, flag the coordinator immediately — the
grading (and the loom's OG patch side) would need the score-delta source of truth instead.
