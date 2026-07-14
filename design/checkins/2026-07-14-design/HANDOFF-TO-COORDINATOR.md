# design-pass-jul14 → coordinator handoff (14 Jul, for reconciliation)

Branch clean, all pushed (HEAD `ad0f3de`). 19 commits off `main`. I've stopped;
not starting new surfaces until you hand back a branch on current main. Per-surface
below, with **seam flags** = the JS paths I touched or that need your eyes on merge.

## Read these two first (net-state + a live fix)

1. **TERRACE net state = XP + aggregate RESTORED.** Two of my commits oppose each other:
   `4ecf0b2` first *removed* XP + the mean scoreline (built to COPY-BRIEF §2/§4), then the
   owner reversed it and `4656ff3` *restored* both. **Reconcile to the final tree state**
   (XP token on, aggregate mean scoreline on, `FROM n FANS`). Don't resurrect the strike.
   XP on-screen wording is pending the owner's explicit call (asking now) — the mechanic stays.

2. **TERRACE `revealFromWire` byEnd fix (`4089fbd`) — live-path, demo-critical.** The
   momentResult handler read `r.home/r.away`; the wire nests ends under `r.byEnd`
   (contracts/crowd.ts). Without it the six-emoji split reveal never fires live. **If main
   already fixed this in the last 45 commits, drop mine. If not, this needs to ship for
   tonight's reveal.** My change only adds the `byEnd` unwrap; it doesn't touch resolution.

## Per surface (what changed · seams)

- **showcase.html** — copy only (thesis → owner's line; WHAT'S REAL market row). No seams.
- **gate.html** — copy only: `X`→`DRAW` label + `DE-VIGGED` captions→`LIVE`/`PRE-MATCH`, in
  `paintMarketTriple`/`paintMarket`/static bar (JS string literals). **Did NOT touch** the
  flag neutral-fallback or fixtureInfo resolution — verified FRA/ESP stickers render through
  the existing path. Lurker door was added then fully reverted (`40d2648`) per owner — net zero.
- **ground.html** — dial hint dropped + `.dseg` centered (CSS), `◈`→`CABINET` (markup),
  `ANONYMOUS TEST SEAT`→`YOUR SEAT` (`el('spec')` copy), embed hides its matchbar (CSS).
  Seam-adjacent only: the spec string sits in the live-wire block — copy, not resolution.
- **stadium.html** — biggest: B poster-bleed (CSS scale), THE PROGRAM strip (new markup +
  **one additive JS listener** wiring strip buttons to `open()` — additive, no seam), ink-breath
  dots (CSS), `THE GOAL`/`THE WHISTLE` renames (headers + `CARDS[]` labels + strip), bench dot
  aligned to `TEAM SHEET`. `CARDS[]` label array edited (display strings only; place ids intact).
- **terrace.html** — see the two flags above. Also `tap()` gained a `taphint` retire flag;
  `resolvePred` counts real calls only (CALLS ✓/✗ ledger). `ccUpdate` display formatting changed
  (consensus render) — **display only, not the consensus wire shape.**
- **cabinet.html** — **`render()` JS touched (`e1c9907`)**: `flagTile` now normalizes tri
  (trim/case + ESP→SPA/MAR→MOR) and drops blanks; `sides[]` filtered. Fixes real blank-tile bug.
  Check against any cabinet changes on main. `.fnone` CSS added; `LOCKED · 1+`→`EARN IT AT A MATCH`.

## Not on this branch (so you don't look for them)
Collect block / `case 'sentiment'` seal handler live on `mint-claim-ui`, not here — untouched.
Scarf artwork (`design/scarf-artwork/`, v2 `930fdf7`) is owner-gated, not wired — awaiting approve.

## Evidence
All states shot mobile-first, console clean, in `design/checkins/2026-07-14-design/`
(see INDEX.md). Nothing verified on ARG–CPV yet — will re-verify the priority prediction/XP
work on the reconciled build against the rig (docs/DEMO-CUES.md).
