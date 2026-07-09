# DESIGN GAP ANALYSIS — 2026-07-09

*Design lane. Walked all 7 surfaces + the core flows in `?demo=1`, and probed states I hadn't
stress-tested: the gate call flow, the keepsake/PRESSING, empty/first-run states, honesty seams,
accessibility. Findings ranked by impact. Tags: **[design]** I can do now, independent ·
**[coord]** needs data/interface from the coordinator · **[owner]** a call for you ·
**(owner-file)** = surface the owner has edited, so coordinate before touching.*

## What's solid (verified, no action)
- **THE DOOR** — full call flow works end-to-end: side → score → conviction (HOW SURE → CONFIDENT) →
  live de-vigged market → activated CTA. Flags socketed both ends.
- **THE STADIUM** — bowl, six cards, the book. **THE CABINET** (sample) — flags, medals, scarves.
- **THE TERRACE** — honest two-ended crowd, ROOOT! burst, now halftone-textured; stat line legible.
- Honesty seam spot-check: the crowd-calls-vs-market panel keeps crowd (0.5–0.5) and market
  (SUI 26·33·40) clearly separate — no blur. ✓

## Findings

### P0 — first-run / empty states (the real hole)
1. **The empty cabinet has no designed state.** [design] `cabinet.html` hardcodes a *full* sample
   (12 lived · 3 scarves · 7 pins). A genuine first-time fan — nothing kept — has no experience; once
   wired to `__album` with empty data it would render blank or broken. Need the **empty cabinet**:
   "your first match awaits", empty **NEED** pockets across the tournament (matches the coordinator's
   album honesty seam, spec §8 — "a NEED slot is an empty pocket, never a fake sticker"). *Buildable
   now with a fallback; pairs with the P1 pre-wire so it's real the moment `__album` lands.*
2. **The loom reads sparse pre-kickoff.** [design] At 0–8' it's mostly unwoven warp — honest, but a
   weak first glance. Add a quiet "the weave begins at kickoff / belief is the ground" affordance so an
   early screenshot still sells the idea.

### P1 — flow completeness
3. **The kept keepsake still says "LIVE."** [design+coord] (owner-file) Tapping a kept scarf unrolls
   its woven cloth and the bottom *does* seal ("FULL TIME" stamp), but the **masthead reads
   `LIVE · 123'` and score `0–0`** — `__match` isn't populated in keepsake mode, so the header is a
   default that contradicts the sealed cloth. A kept relic should read past-tense/sealed (KEPT · the
   real final score). Needs the `__loom` keepsake payload to carry final score + a masthead that flips
   to sealed. Coordinate — the loom masthead is owner-edited.

### P2 — accessibility / robustness [design, all buildable now]
4. **Reduced-motion is handled on only 2 of 7 surfaces** (gate, cabinet). ground, woven-loom, stadium,
   terrace, showcase have animations (dial, weaving, card sheets, cheer bursts, reveals) with **no
   `prefers-reduced-motion` guard**. Clean, additive fix across the board.
5. **Contrast** — fixed the terrace stat line this session; the deselected gate side washes its flag
   almost fully out (opacity too low to read). Spot-check remaining faint sub-labels.

### P2 — gate polish [design, minor]
6. Deselected side's flag sticker nearly vanishes (dim state too aggressive).
7. "TAP TO SET THE SCORE" hint persists after a score is set — retire it once touched.

## Priorities / status
1. ✅ **Reduced-motion a11y pass** (#4) — `5cfe31f`. Guard added to all 7 surfaces.
2. ✅ **Empty cabinet + P1 pre-wire** (#1) — `41bd5b2`. `cabinet.html` renders from `__seat`/`__album`
   with a sample fallback; the empty first-run state (NEED pockets, all virtues still-to-earn) ships.
3. ✅ **Gate polish** (#6, #7) — `132021f`. Legible unchosen side; score hint retires once set.
4. ⏸ **Loom empty-state** (#2) — *reassessed as marginal.* The loom's header already explains the
   idea ("MARKET IS THE GROUND · PLAY IS THE CORDS · EVENTS ARE STITCHED"), so an early screenshot
   sells itself and the empty warp reads honestly as "yet to be woven." A pre-kickoff "waiting"
   affordance is a minor future nicety — and it lives in an owner-edited file, so not worth a
   unilateral change now. Revisit with the keepsake work below.
5. 🤝 **Keepsake-sealed masthead** (#3) — *coordinate.* Needs the `__loom` keepsake payload to carry
   the final score + a masthead that flips LIVE→KEPT; touches the owner-edited masthead. Bundle with
   the coordinator's `__loom` work.
6. ⏳ **Contrast spot-check** (#5) — ongoing; the big one (terrace stat line) is fixed.

Nothing here blocked on the coordinator — this was a parallel design track. Items 1–3 landed.
