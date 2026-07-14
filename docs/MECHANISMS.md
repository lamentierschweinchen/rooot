# ROOOT — THE MECHANISM SCHEMA (hand-off to design)

*The concrete interactive mechanisms, fully specified: for each, the data it
produces, the states it moves through, the views design renders, the honesty
rule, and the wire cost. Design makes these beautiful; the coordinator wires
them. This is the substrate for every productive thing a fan does — nothing
here waits on a surface being locked.*

## The spine: CLAIM → STAMP → RESOLVE → KEEP

Every productive action a fan takes is one verb of a single loop:
- **CLAIM** — the fan asserts something (a side, a scoreline, a feeling, a conviction).
- **STAMP** — it's fixed against THE MARKET at that exact second (the foil: you vs the market's belief).
- **RESOLVE** — reality judges it against the real wire (right / wrong / proved).
- **KEEP** — it crystallizes into a keepsake (the memory, provably yours).

The market is always the foil; reality is always the judge; the keepsake is
always the memory. That loop is what makes ROOOT a product and not a pile of
features — and design should be able to feel it in every surface.

**Honesty spine (applies to ALL below):** market ≠ crowd, never blended — the
crowd's claims are a distinct belief signal in a distinct visual material;
feeling is never scored for "correctness"; everything resolvable is resolved
against the real wire; every keepsake carries its own provenance.

---

## 1 · ROOT — allegiance (built)
- **Claim:** "I'm in this end for 90." **Stamp:** which end, when (a neutral who joins is tagged `adopted`, not a third end). **Resolve:** your end wins/loses the match AND the stands. **Keep:** your end on every keepsake.
- **Data:** `root { anonId, matchId, side, adopted, atMs }` — one/fan, switchable until KO, then locked.
- **States:** unrooted → rooted(side) → locked(KO).
- **Views:** rooted counts per end (the counter).
- **Honesty:** two ends only; no neutral STAND (adopt is a tag, not a bucket).

## 2 · PREDICT — foresight — THE RETENTION SPINE (SERVER WIRED, proven)
- **Claim:** "it ends X–Y." **Stamp:** the market's triple at predict-time. **Resolve:** at FT → exact / outcome-right / wrong → FORESIGHT. **Keep:** on your scorecard ("you called 2–1; it finished 2–1").
- **Data:** `predict { anonId, matchId, home, away, marketAtPredict:{h,d,a}, atMs }` — one/fan, editable until KO, then LOCKED (a claim on the future locks when the future starts).
- **States:** none → predicted(editable) → locked(KO) → resolving → resolved(verdict: exact|outcome|wrong).
- **Aggregation (the THIRD belief signal — market/crowd/result):** `consensus { meanHome, meanAway, modal:{home,away,pct}, dist:[{score,pct}] }`, grouped by rooted-side and by predicted-outcome.
- **Views design renders:**
  - a. **"THE CROWD SAYS 2.1–0.9"** — beside the market's implied and (at FT) the result.
  - b. **filter by end:** "ARG fans say 2.4–0.8 · CPV fans 1.6–1.9 · neutrals 1.9–1.1".
  - c. **the doubters:** "of ARG fans, 18% predict they DON'T win" — the honest-doubt cut a neutral bucket can't give.
  - d. **the gap:** crowd-mean vs market-implied — "fans are 0.4 goals more optimistic than the market."
- **Honesty:** crowd prediction NEVER blended into the market tide — distinct material (a ghost target / pins, not woven weft).
- **Wire:** `predict` msg on the stands service; consensus computed server-side, shipped as a StandsState field (cheap — one number set, not per-fan).

## 3 · CHEER — loudness & faith (built)
- **Claim:** "louder." **Stamp:** the minute + whether behind (faith ×2). **Resolve:** LOUDNESS + FAITH → the stands score. **Keep:** your roar curve (scorecard) + the end's roar (collective card).
- **Data:** `cheer { anonId, matchId, side, n, atMs }` — continuous, rate-decayed server-side.
- **Views:** roar/s per end (the meter); faith windows (cheering while behind, gold).

## 4 · REACT — the Pulse — expression (BACKEND BUILT + proven; surface → archive/design-docs-consumed/design/BRIEF-REACT.md)
- **Trigger:** a DRAMA MOMENT opens a react window — goal, possible-goal/VAR, red card, penalty, FT. Server broadcasts `reactWindow { momentId, kind, opensAt, closesAt(~25s), emojiSet }` (server detects the moment from the ledger).
- **Claim:** pick ONE of 6 curated ambiguous emojis (rotating set by moment kind — multi-context, never literal). **Stamp:** which moment, which end. **Resolve (the reveal — the spectacle):** at window close, split-screen each end's TOP emoji + %. "Their 💀 vs your 🚀." **Keep:** the MOOD QUILT (tile/moment, dominant emoji, ends' split) — a collectible sentiment record.
- **Data:** `react { anonId, matchId, momentId, emoji, side, atMs }` — one/fan/moment.
- **Aggregation:** per-moment per-side emoji histogram → top + %.
- **Honesty:** NO correctness scoring — expression, not guessing (the mechanic the owner killed twice; do not re-add). Curated ambiguous set = design's vocabulary.
- **Wire:** `reactWindow` broadcast + `react` msg + per-moment aggregate at window close.

## 5 · CALL — conviction — the rare premium (relayer built, trigger/UI unbuilt)
- **Trigger:** surfaced ONLY at drama SPIKES — a belief swing past threshold, a danger spell, a possible-goal. RARE by design; scarcity makes it a moment.
- **Claim:** press-and-hold (the O stretches: R-O-O-O-O…) → a structured claim ("comeback" · "next-goal-us" · "hold the draw"). **Stamp:** minute + THE MARKET'S TRIPLE at that second, relayer-signed devnet memo (walletless) — the receipt, on-chain. **Resolve:** at FT / the claim's horizon → PROVED / failed → FORESIGHT (weighted by bravery = 1 − market-prob of the called side). **Keep:** the CALLED IT stub (Nº, PROVED punch, the market % you beat).
- **Data:** `call { anonId, matchId, side, claim, minute, marketP, atMs }` → txSig. **States:** pending → proved | failed.
- **Honesty:** market-% from the real tick; vindication notarized on-chain, never manufactured.

## 6 · KEEP — crystallization (printers built; mint + album unbuilt)
- **Trigger:** full-time (auto) + any PAUSE (poster-ready freeze).
- **The objects** (all from the match's real arc — `MatchArc` exists):
  - a. **THE LOOM/SCARF** — the match woven (the live surface, crystallized).
  - b. **YOUR SCORECARD** — your match: LOU/FTH/FOR/PRE from your real aggregates + your prediction verdict + your calls.
  - c. **THE COLLECTIVE CARD** — your end's match: rooted, stands verdict, roar.
  - d. **CALL STUBS** — one per proved call.
  - e. **THE MOOD QUILT** — the react sentiment record.
- **The container:** THE ALBUM (got/need, edition slots) + THE CASE (scarves on a rail, stubs beneath) — the season-long collection: the reason to attend the next match.
- **Data:** `MatchArc` + per-fan aggregates + provenance (Merkle refs + attendee root). **Mint:** port from STRATA `src/mint`.

---

## What's WIRED vs what design can start on NOW
- **Wired (data ready, design renders):** root, predict, cheer, REACT (drama windows + split reveal + mood-quilt data — BUILT + proven, see archive/design-docs-consumed/design/BRIEF-REACT.md), the loom's live threads (belief/possession/pressure/tempo/crowd), the ledger events, the keepsake printers (scorecard/stub/poster/scarf), the call RELAYER (on-chain receipt proven).
- **Schema ready, coordinator wires on design's go:** CALL trigger/press-hold surfacing, the ALBUM/CASE container, the mint.
- **The one thing that blocks a non-ARG fixture:** the loom's `__loom.teams()` label/colour injection (I have every team's data ready).

Design does not need the loom locked to start on PREDICT, REACT, the STANDS
panel, or the ALBUM — those are their own surfaces with the schema above. Pick
any; the data's specified and I wire it the moment the shape is set.
