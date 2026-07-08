# The Full Demo + Reactive Crowd Engine — design

*Spec · 2026-07-08 · coordinator lane. Turns the ROOOT surfaces (gate · ground ·
terrace · loom · stadium) into one playable, feelable loop driven by mock game data,
so design's open questions can be answered and the submission demo has a spine.*

## 1. Purpose & success

**Job:** a playable full-loop demo — `GATE → GROUND → FULL-TIME → PRESSING` — driven by a
mock match + a reactive mock-crowd engine, so the whole experience can be *felt* (not just
screenshotted). Success = you can open one URL, pick a side, watch the match play out across
the loom/stadium/stands with a crowd that reacts, cheer and predict along the way, and reach
a full-time keepsake — in ~2–3 minutes, with no live match required.

**Immediate driver:** design's three questions (mini-predictions desirable? reading-the-game
gamification level? the ROOOT crescendo — keep or too much?) are body-feel questions,
unanswerable from a static prototype. This demo makes them answerable. It then hardens into
the hackathon submission demo (#5).

**Principle — build real, mock only the data.** The loop runs the *real* machinery: the
gate's prediction-lock and the full-time PRESSING mint (devnet, already proven) are the
actual product mechanisms (#12), needed regardless. Only two things are mock: the **match
feed** (a replayed recording) and the **crowd** (fabricated, clearly labeled). Nothing built
here is throwaway except those two inputs.

## 2. Scope

**In:** the full loop front-to-back; the reactive crowd engine; wiring terrace + ground +
gate to the shared data globals; a demo orchestrator (one clock, demo pace); resolving your
predictions at full-time; the devnet keepsake mint.

**Out / deferred:** THE ALBUM (matches-attended rail, #P2); real (non-simulated) crowd from
live users; the dynamic live-fixture default (#11) — the demo runs off an explicit mock
match, so it doesn't need it; production mint keys (devnet only, per standing constraint).

## 3. The spine — one mock match

The **sui-col recording** (`fixtures/…` / `apps/web/dist/replay/…`; 0–0 after ET → SUI won
4–3 on penalties). Real events, real odds — zero match-data authoring. Chosen because it is
maximally dramatic (0–0 into a shootout) and it exercises the shootout mode we just shipped.
The crowd narrative is authored *on top* (§5), so we get realism *and* narrative control
without scripting a fake match.

**Two feed modes, one contract.** The match reaches the page as `__loom` + `__stats` either
way; nothing downstream (crowd sim, surfaces) cares which:
- **Dev / iteration:** the **server replay mode** (`REPLAY_FILE`/`REPLAY_FIXTURE`, already
  used tonight to verify the CONTROL card + loom curation) — fast, reuses existing infra.
- **Ship:** the recording is **pre-baked into a client-side data file** (events, odds, stats
  timeline) and a small client player feeds the globals with **no server** — the loom already
  does exactly this with its `arg-cpv-data.js` demo seed. This makes the demo a **static,
  deployable, shareable page** (a submission-grade artifact, not a fragile server setup).

*Alternative considered:* a hand-scripted "perfect demo match" — rejected (fake events, more
work, and the crowd already gives us all the narrative control we need).

## 4. Architecture

```
        server replay (sui-col)                    crowd-sim.js  (NEW, client-side)
                │                                          │
      normalized FeedMsg over WS                  hooks match clock + events,
                │                                  computes crowd each tick
                ▼                                          │
   loom-adapter → window.__loom  ─────────────────────────┤ (reads score/events/odds)
   stats-adapter → window.__stats                          ▼
                                                  window.__stands  (root·cheer·predict·
                                                   consensus·roar·faith)  ← same shape the
                                                   real stands backend produces
                │                                          │
                ▼                                          ▼
     ┌─────────────────────── surfaces read the globals ───────────────────────┐
     gate.html   ground.html (composite, embeds loom/stadium)   terrace.html
     └──────────────────────────────────────────────────────────────────────────┘
                                    │
                        demo orchestrator (one clock: pre-match → kickoff →
                        play-through → whistle → pressing)
```

Key property: **the crowd engine exposes the same `window.__stands` the real backend does**,
so surfaces read it identically whether it's the sim or the server. The sim swaps out for the
real `__stands` the day there's a real crowd — surfaces don't change. Client-side (not
server-side) because we fabricate the crowd anyway; server-side would need real users and buys
nothing for a demo, while client-side is self-contained and per-viewer.

## 5. The reactive crowd engine (`crowd-sim.js`) — the heart

A client-side module. **Input:** the match clock + event stream (read from `__loom` — score,
ledger events, odds/market, phase) plus **your** interactions (cheer taps, gate prediction).
**Output:** `window.__stands`, recomputed each tick.

**Model — "believers + reactive" (personality c), two partisan camps** (your end / their end):

- **Belief** per camp = `homeBias` baseline (each end hopeful about *their* team, so it runs
  above the market) + `reactivity ×` recent-events impulse (danger/shots for/against nudge it,
  a goal jolts it) + slow `regression` toward the match reality. The gap between the camps'
  aggregate and the cool market line (from `__loom` odds) **is the "two buses."**
- **Cheer / roar** per end = event-driven noise: spikes on danger/shots/goals for the
  attacking end, decays with `roarDecay`; at peak, the **ROOOT crescendo** fires. Your taps
  add to *your* end.
- **Faith** = the losing end stays lit (STILL SINGING) — belief floored above zero when behind.
- **Crowd calls / consensus** = the aggregate belief split (e.g. `SUI 2.1 – 1.8 COL`),
  emitted beside the market, never blended with it.
- **Reading-the-game** = your mini-predictions resolve against the real (replayed) result →
  XP + the fan-team tally.
- **Counts** = fabricated but plausible per-end totals, **flagged "simulated"** (§8).

**Every behavior is a named tunable constant** — `homeBias`, `reactivity`, `roarDecay`,
`regression`, `divergenceGain`, crescendo threshold, camp sizes — in one `TUNE` block at the
top (mirrors the `WEAVE` curation pattern). "Whatever floats your boat for now" → dialing it
after you feel it is a one-line change, no logic surgery.

**Authoring the arc:** because the crowd is fabricated, the sim can place scripted *emphasis*
beats (raise divergence at chosen minutes, swell the crescendo into the shootout) layered over
the reactive baseline — the hand-tuned "two buses" story on real events.

## 6. Data contracts (grounded in the current code)

- **`window.__loom`** (exists; driven by `loom-adapter.js`): score, ledger events, odds/market
  (1X2), phase/clock, shootout state. The crowd sim **reads** this; the loom/stadium embeds
  render it.
- **`window.__stats`** (exists; `stats-adapter.js`): per-side families incl.
  `attacks.danger/highDanger`, `possessionPct`. Stadium reads it (CONTROL card already wired).
- **`window.__stands`** (exists; `stands-adapter.js` shape): `root · cheer · predict ·
  consensus · roar · faith` (+ counts). The crowd sim **produces** this. Terrace/ground map it
  onto their internal models — terrace's `M` tracks `rY/rT` (←`roar`), `score`/`t` (←`__loom`),
  `reads`/`xp` (←reading-the-game), replacing its scripted `EVENTS`/`PREDS`.

Exact field-by-field alignment (sim output ↔ stands-adapter shape ↔ each surface's reads) is a
first-task audit in the plan: read `stands-adapter.js` + terrace/ground/gate end-to-end and
match names before writing sim logic.

## 7. Loop wiring (the seams)

1. **GATE** — reads fixture (teams, kickoff) + opening **market** (pre-match de-vigged 1X2)
   from `__loom`; your side + score prediction + confidence **lock** → the real lock mechanism
   (in-memory for the demo, structured for #12's on-chain record). "The ground opens" → GROUND.
2. **GROUND (composite)** — thread the match params (`match`/`ws`/activation flag) into the
   loom + stadium **iframes** so the tabs show the *replayed* match (today they show the
   self-playing demo). The crowd sim drives the your-end/their-end frame + crowd calls. One
   shared clock via the orchestrator.
3. **TERRACE** — same crowd sim drives it (the expanded stands view); its scripted timeline is
   replaced by `__loom` events + the sim.
4. **FULL-TIME → PRESSING** — at the whistle: resolve predictions (right/wrong vs the mock
   result), settle the reading-the-game tally, and **mint the keepsake on devnet** (the proven
   Metaplex Core mint) capturing the match + your journey. Real pressing machinery (#12), mock
   match data.

## 8. Honesty & labeling

The honesty law holds. The crowd is **fabricated for the demo and labeled "simulated"** (as
the terrace footer already does — "crowd figures are sample") — never presented as live real
fans. The **market** stays a real number from the recording, shown *beside* the crowd, never
blended. Crowd figures stay counts/splits, never a false %. A demo is an honest demo.

## 9. Components & build order

1. **`crowd-sim.js`** — the reactive engine → `__stands`, driven by the match clock/events. The
   heart; build + tune first (verify against the sui-col **server replay** — fastest loop).
2. **Wire terrace + ground** to read real `__stands`/`__loom`; thread match params into the
   composite embeds.
3. **Wire the gate** — fixture/market in, prediction lock out.
4. **Demo orchestrator** — sequences pre-match → kickoff → play-through (~2–3 min) → whistle →
   pressing; one clock; a single entry (a `?demo=1` mode / route).
5. **PRESSING** — full-time → devnet keepsake mint (bolt on #12's proven mint).
6. **Bake for ship** — pre-process the sui-col recording into a client-side data file + player
   (per `arg-cpv-data.js`) so the shipped demo is static/serverless; deploy. (Dev uses the
   server replay throughout; this is the last step, for the shareable artifact.)

Each is independently verifiable (the engine against the replay before any surface; each
surface against the engine before the orchestrator). Steps 1–5 use the server replay; step 6
swaps the feed for baked data — downstream is unchanged (same globals).

## 10. Testing / verification

- **Crowd sim:** a headless harness replays the sui-col recording through the sim (as the
  loom/free-kick backtests did) and asserts the arc — divergence from market present, cheer
  spikes on goals, faith floor when behind, crescendo fires, prediction resolution correct.
- **Surfaces:** drive each against the sim via the server replay + preview screenshots (the
  method used tonight for the CONTROL card / loom curation), console clean.
- **Loop:** one end-to-end play-through screenshotted at gate / mid-match / full-time.

## 11. Decoupling from design polish

The engine + wiring target the **stable globals** (`__loom`/`__stats`/`__stands`), not the
surfaces' visuals. Design keeps polishing terrace/ground/gate independently; the two meet at
the globals. This is what lets the "big build" run in parallel with design instead of waiting
on "satisfactory design" — and the playable loop it produces is itself what makes the design
judgeable.

## 12. Open / deferred

- Exact `__stands` field alignment — first audit task in the plan.
- Demo pacing constant (whole match in ~2–3 min) — tune once felt.
- On-chain lock/mint detail (#12) — the mint is proven on devnet; the ceremony wiring is the
  new part; owner runs any `fly secrets set` for prod (classifier blocks the agent) — demo is
  devnet-only so this doesn't bite.
- THE ALBUM (retention rail) — out of scope, later.

## 13. Coordination with the parallel design lane (owner-flagged)

The design instance is editing the same surface files (terrace · ground · gate · woven-loom ·
stadium) in parallel — a real clobber risk (shared repo + shared Vercel account under the
owner's login; a stale-checkout deploy can revert the other's live work, and per-deployment
URLs are auth-gated so they can't be diffed). Strategy, in priority:

1. **New files carry the weight.** `crowd-sim.js`, the orchestrator, and the baked-data player
   are NEW files → zero conflict. Put as much logic there as possible; keep the surfaces thin.
2. **Prefer a global read over a rewrite.** Where a surface must consume live data (terrace's
   scripted `EVENTS`→`__loom`, the composite embeds' params, the gate's market), the ideal is
   the surface reads a global that the sim/driver populates — the wiring lives in adapters, not
   the surface internals. Ask design to expose a small input hook per surface (like `__loom`'s
   API) so I attach instead of edit.
3. **When a surface edit is unavoidable, it is surgical + additive + immediate.** Before
   touching any design-owned file: `git pull`/check `git status` + `design/QUEUE` for their
   uncommitted work; make the smallest additive change; commit right away; never `vercel --prod`
   over an uncommitted tree without confirming it isn't design's newer work.
4. **Announce the build in `design/QUEUE`** — name the demo build and the exact seams I need,
   so design can add the hooks (or steer clear) rather than us colliding. This note is step 0
   of the plan.
