# Queue → design lane (Jul 7) — elements to build, data all ready

*From the coordinator. Owner asked what to queue while the game plays. Each below has its
data live on the wire already — these are RENDER tasks, not data tasks.*

## SHIPPED · THE SHOOTOUT MODE — a first pass is LIVE, elevate it
Owner (Jul 7): *"now we're in penalties. i'm not really sure we have a mode for it. but we
need one if we don't."* → built + deployed. When a match goes to pens the loom frame BECOMES
a board (`L.shootout(state)` in woven-loom.html — a minimal wired version I stood up so it's
not vaporware). **Your canvas now — make the drama land.**
- **Data — live now:** `window.__loomShootout` (also passed to `L.shootout(st)` each kick):
  `{ active, order:[{side:'home'|'away',scored:bool}], home:[…], away:[…],
  tally:{home,away}, firstUp:'home'|'away', done, winner }`. Order is chronological,
  interleaved; home/away are each side's kicks in sequence. Verified against the real
  SUI–COL shootout (SUI won 4–3; winner resolves only on the final kick).
- **What's there:** two rows of stitched knots (filled = scored, hollow = missed), a running
  tally, the winner in gold. Themed (HOME/AWAY, paper/ink/gold). Deliberately plain.
- **Elevate:** the held breath before a deciding kick; motion as each knot lands; make the
  dots feel WOVEN (cross-stitch, like the cloth) not CSS circles; the winner reveal; graceful
  overflow past 5 (sudden death). Maybe the finished cloth sits behind the board as the
  climax. (A "SUI to kick next" tension needs `penalty_shootout_team` widened into the feed —
  ping me and I'll wire it; it's a server change so I've held it.)

## FYI · LOOM EVENTS RE-CURATED (owner flagged the cloth as too busy, Jul 8)
Owner: the loom had drifted busy — it was weaving injuries (~7-12 red crosses a match),
which were never in your legend. Pulled them. The cloth now weaves your legend set exactly
(goals·shots·cards·corners·VAR·offsides·free-kicks) **plus subs** (owner asked to keep subs).
Coordinator side only — your render wasn't touched. One thing for you: **the legend has no
SUB entry** but subs now weave (the green-up/red-down arrow glyph) — add a "SUB" key to the
legend so the vocabulary matches. (Injuries stay OUT of the legend.) Curation lives in one
`WEAVE` config in loom-adapter.js if you want a family flipped.

## P0 · THE STARTING XI — the owner's flagged "big miss"
WHO is playing, shown **before a ball is kicked** — owner's placement: **by THE BENCH**
(it gives that card something to hold pre-kickoff, before subs/injuries exist).
- **Data — live now:** `window.__stats.lineups` = `{ home: [...], away: [...] }`, each a
  `{ name: "Hakimi, Achraf", number: "2", positionId: 2, captain: false }` × 11 (the
  announced XI, `starter===true`, correctly sided). Arrives on join, before any event —
  so the card fills the moment the page opens pre-match. null until the wire names them.
- **Render:** the two elevens (number · name), captain marked; a formation read is optional
  (positionId is the wire's raw code — no formation map yet; number+name is the core).
  Reads as a team-sheet, in the host palette + the stadium register.
- (Coordinator: parser + 'lineup' feed + join-cache all shipped; server broadcast goes live
  at SUI-COL full-time. Nothing else needed from me.)

## The rest, roughly in order
1. **THE STANDS — the crown jewel.** Still unbuilt. `design/BRIEF-STANDS.md` has the
   direction (two terraces of real people). Data: `window.__stands` (root/cheer/predict/
   consensus/roar/faith) — all live server counts.
2. **CONTROL card** (the pitch spot that's a "· NEXT" placeholder): possession%/territory/
   danger detail. Data: `__stats` `possessionPct` (gated), `territory`, `attacks{danger,
   highDanger}` — live.
3. **Goal card in the SET PIECES register** + **SET PIECES showing all symbols** (from
   FEEDBACK-jul7-stadium.md #1) — stats printed under each symbol.
4. **THE PRESSING** — the full-time ceremony + the keepsake it crystallizes into (the mint
   is proven on devnet; coordinator wires it when the room exists).
5. **woven-loom polish** — the living/breathing motion the owner wants; and eventually THE
   COUNT / THE STANDS folded into the new woven world (right now they live at /stadium).

Ping the coordinator for any signal you want shaped differently — all of the above is wired
and waiting.

## COORDINATOR BUILD IN FLIGHT (Jul 8) — the full demo (mock crowd + loop)
Executing `docs/superpowers/plans/2026-07-08-full-demo-playable-loop.md`. The logic lives in
NEW files — `crowd-sim.js` (a drop-in `stands-adapter` replacement: simulated `__stands`),
`match-read.js` (`__match` read-model), `demo.js` (the `?demo=1` orchestrator) — so Tasks 1–5
touch ZERO surface files. Later tasks need surgical seams in terrace/ground/gate:
terrace reads `window.__match` (score/clock) + subscribes to `window.__stands`; ground threads
`match`/`ws` into its iframes + reads `__stands`; gate reads `__match.market` + calls
`__stands.root/predict`. You have those files open right now — ping when they're at a resting
point (or expose a small input hook per surface) and I'll wire against them then, not over you.

---

## → DESIGN ANSWER (Jul 9) — re: who wires the surfaces

Surfaces committed at a clean resting point (**1d4e625**) — deadlock broken, base is clean.

**I'll wire my own surfaces to `__match`/`__stands`.** I know the internals — the stands' `M` model +
roar/tiles, the ground-dial, the loom's replay seed + `__loom` API, the stadium's render + adapters, the
gate's call — so the seams you spec'd (terrace reads `__match`+subscribes `__stands`; ground threads
`__match` to its iframes + reads `__stands`; gate reads `__match.market` + calls `__stands.root/predict`)
are quick for me and slow for you. It's the established pattern (surfaces consume `window.__*`). I'll
gate on `?demo=1`, replace each surface's local sample, and **commit each surface the moment I wire it**
(the no-clobber rule). You keep the engine + expose `__match.marketSeries`; I draw the odds card and take
the ground-dial data you offered.

**Hooks I need beyond `__match`/`__stands` (both non-blocking):**
1. **Next fixture** (cabinet's forward loop): `{ home, away, kickoffISO, yourSide }` — expose if cheap
   (`__match.next` or a tiny fixtures list); else I sample it for the demo, wire real later.
2. **Scarf → re-enter a SPECIFIC match**: the loom's `?keepsake` needs a match selector for the
   multi-match cabinet. Demo's single baked sui-col match is fine on `?keepsake=1`; flag the per-match
   selector (+ per-match baked data, your lane) for post-demo.

Everything else is on `__match`/`__stands`. Naming: switching every label to **THE STANDS**. Dial nuance
(stands-at-home; lean into loom/stadium; crowd full→framing→gone) noted — folding into the ground-dial
rework as one dial, not a separate room.

---

## → READY FOR THE COORDINATOR (Jul 9) — surfaces wired, clean base

All five surfaces now run off the demo engine under `?demo=1`, committed (on base 1d4e625):
- **gate** (f788844) — the odds bar reads `__match.market`; take-your-place → `__stands.root/predict`
- **stands** (c149fea) — roar/consensus/counts/moments/verdict off `__match`+`__stands`; scripted replay retired under demo
- **cabinet** (06cf179) — forward loop (next fixture → gate) + scarf → keepsake; carries `?demo`
- **stadium** (7fbef3b) — THE MARKET card (1X2 chart from `__match.marketSeries`) + `__match` masthead
- **ground** (8ecab8d) — the hub reads `__match` (score) + `__stands` (crowd); iframes + nav carry `?demo`

The loop plays serverless: gate → ground → {loom/stadium dial · stands · cabinet}.

**Handoffs — your lane (both the SAME fix: point the adapter at the baked feed under `?demo=1`):**
1. **`stats-adapter`** → the baked feed. Under `?demo` it tries the live WebSocket (offline), so the stadium's
   detailed cards (goal/set-pieces/book/pens) have no data. `__match` (score/clock/market) is fine; the
   stat-family cards need `__stats` fed from the bake.
2. **`loom-adapter`** → the baked feed. Same shape (no `?demo`/`?loomfeed` path), so the loom weaves its
   ARG-CPV seed *themed* SUI-COL, not the real feed. Feed it the bake and the cloth becomes the true match.

**Also your lane (queued, NOT demo-blocking):** the mint/relic (cabinet on-chain + loom keepsake fixture-aware);
`__match.next` (or a fixtures list) for the cabinet's forward loop (sample now); and `__match.teams` arrives
`null` on the baked feed (I fall back to SUI/COL — is a `fixtureInfo` msg meant to be in the bake?).

**Still mine (design, non-blocking):** the full stands-at-home ground-dial (crowd full→framing→gone);
pushing the loom motion/texture further; a copy pass; a polish sweep.

---

## → DESIGN CHECK (Jul 9) — eyes on the now-fed demo (your 0ef67b7 + 1d79d0f)

Screenshotted the loom + stadium under `?demo=1` now that the adapters read the bake. Both render the real
SUI–COL — great. Two things for **your** lane (I didn't touch either — your active files):

1. **Possession reads 99 / 1 at ~min 12 — please sanity-check the calibration.** `__stats.home.possessionPct=99`,
   `away=1`, while `away` has `shots.total=1` + `corners=1` (COL took a shot AND won a corner). You can't do that on
   1% possession — the number contradicts the other families. Territory is saner (0.90 / 0.10). If `possessionPct`
   is an *instantaneous spell* (who holds it right now) rather than cumulative match possession, the CONTROL card
   labels it "POSSESSION" (reads as match-total) — that's an honesty smell. Either recalibrate to cumulative, or
   tell me the semantics and I'll relabel the card (e.g. "ON THE BALL NOW"). Same source feeds the loom's cord.

2. **Loom masthead team colours are still the ARG/CPV defaults.** Names update (SUI/COL) but `.sc .h`/`.sc .a` stay
   blue/red (`#2049AA`/`#C8504D`), so "SUI" prints blue (should be red) and "COL" red (should be gold). The stadium
   masthead already themes correctly under demo. Tiny; yours since it's in the loom demo-wire you just committed —
   flag if you'd rather I take the masthead-colour line in woven-loom.html (I'll stay out otherwise).

3. **The demo can't showcase the STARTING XI — the bake has no lineups.** `__stats.lineups` is null on the baked
   feed, so THE TEAM SHEET reads "TEAM SHEET NOT IN YET" for both sides (my empty state, rendering correctly). But
   the XI was the owner's flagged **P0 "big miss"** — the demo walkthrough should show it. If the announced XI can
   be baked in (it arrives on join, pre-kickoff), the card fills the instant the stadium opens. Right now a marquee
   feature is invisible in the demo.

4. **Stat families aren't time-synced to the replay clock** (loom + score are). At 47' HALF_TIME, `__stats.away.subs`
   already lists a **118'** sub (Mina ⇄ Lucumi Bonilla — extra time). The loom wove only to ~12' at the 12' mark, but
   the stat cards jump to the FINAL match state at any clock: the bench shows future subs, possession/shots read
   end-of-match mid-match. If stats-adapter gated events by the replay minute the way loom-adapter does, every card
   would play forward in sync with the tide. (My cards render what they're given faithfully — this is the feed's
   time-sync, not the render. In live it's correct; it only shows in the replay.)
