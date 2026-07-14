# COORDINATOR BRIEF — design lane, match-day (14 Jul)

Single entry point. Branch `design-pass-jul14`, clean + fully pushed (HEAD after this
commit). I've stopped per your protocol — not touching stale files. **The critical path
is now yours: reconcile and hand the branch back so I can build the priority.**

## Asks, in priority order
1. **Reconcile** `design-pass-jul14` (merge current main, preserve my restyle + the landed
   wiring) → hand me back a branch on current code. **This is the only thing blocking the
   prediction/XP UX build.**
2. **Reveal fix for tonight** — cherry-pick `4089fbd` (terrace `revealFromWire` byEnd unwrap)
   onto main, OR confirm main already fixed it. Without it the six-emoji split reveal never
   fires live in FRA–ESP. Cherry-picks cleanly on its own.
3. **(after prediction/XP) Loom→scarf mint capture** — pipeline half is yours; spec below.

## Protocol item 4, answered: XP → POINTS
Owner's explicit call: the progression **stays as a mechanic, reads as `POINTS`** (interim,
changeable). Do NOT re-strike it. I apply `XP`→`POINTS` in the terrace footer (+ anywhere it
reads) during the prediction/XP build — not on the stale files.

## Decisions landed today (bake into reconciliation)
- **Terrace nets to XP+aggregate RESTORED** — two opposing commits (`4ecf0b2` strike →
  `4656ff3` restore). Reconcile to the final tree state; label becomes POINTS.
- **Stadium**: B poster-bleed built + THE PROGRAM foot-strip + ink-breath dots; renames
  `THE GOAL` / `THE WHISTLE`, bench dot aligned to `TEAM SHEET`; STADIUM dial hint dropped.
- **Gate**: no watch-only door (claims required — deliberate, owner ruling). DRAW label, plain captions.
- **Ground / cabinet / showcase**: copy + the cabinet `render()` flagTile fix — per HANDOFF doc.
- **US English default** — "pitch" is an accepted exception (owner); program/field/lineups elsewhere.
- **Scarf**: the minted keepsake **IS the sealed loom itself** — not the gradient, not
  `scarf-svg.mjs` (demoted to fallback).

## Seam flags — read before merge
`revealFromWire` byEnd (live-path) · terrace `ccUpdate`/`resolvePred` (display + POINTS
counters) · cabinet `render()` `flagTile` (blank-tile fix) · stadium additive strip listener.
**Full per-surface detail: `HANDOFF-TO-COORDINATOR.md`.**

## The moment you hand the branch back
Prediction/XP UX in one pass — POINTS footer · V2 plate wired with richer crowd/market data
(aggregate score + fan count + outcome split + most-called score; 3 market %s + favorite +
movement) at larger size · progression strip. Verified on ARG–CPV (`cutover-fixture.mjs
18175918`, restored before any commit — fixture.json stays FRA–ESP), mobile-first, console
clean, every state shot. To you by **~14:00 UTC**.

## The loom→scarf capture (item 3 detail)
Spec: `design/scarf-artwork/LOOM-AS-KEEPSAKE.md`. Loom is deterministic → server can headless
re-render the exact sealed object (reuse the footage/canary Playwright rig) → PNG → mint
`imageUri`, replacing the placeholder. My loom change: make keepsake mode seedable via URL
param (today it's localStorage-only). Your half: run capture in the mint pipeline + keep the
honest fallback. Sequenced after prediction/XP.

## Docs on the branch
`COORDINATOR-BRIEF.md` (this) · `HANDOFF-TO-COORDINATOR.md` (per-surface + seams) ·
`LOOM-AS-KEEPSAKE.md` (scarf/mint) · `checkins/2026-07-14-design/INDEX.md` (all evidence).
