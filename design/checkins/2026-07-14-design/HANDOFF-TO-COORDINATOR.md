# design-pass-jul14 → coordinator handoff (updated 16 Jul)

## ⚑ SHIP CHECKLIST (design lane → coordinator) — start here

Design lane is **done and pushed** (`design-pass-jul14`, 44 commits, tree clean). Everything is in
my lane — I never touched `contracts/`, `fixture.json`, `fly.toml`, or `vercel.json`; the only diffs
there are your own reconcile merge `cbdfc04`. Every surface is built, runtime-verified, and cleared
an adversarial design review. To put it on a fan's phone:

1. **Merge `design-pass-jul14` → main + deploy.** Surfaces ready: gate · ground · terrace (the
   prediction card, on the owner's generated art) · stadium · cabinet (the mini-scarf rack) ·
   woven-loom (the keepsake scarf) · showcase.
2. **P2 — wire the fan into the scarf record.** Fill `root` (`'home'|'away'`, the gate pick) +
   `calls[{m,k,sub,hit}]` (from the terrace CALLS ✓/✗ ledger `resolvePred` — stamp the minute,
   resolve `hit` off the feed) and bind both into the cloth record at seal (`writeCloth`/the stands
   seed). Live contract already exposed: `__loom.root(side)` / `__loom.call({m,k,sub,hit,id})`. Full
   spec + record shape: `design/scarf-artwork/CAPTURE-RECIPE.md`.
3. **Mint the scarf image + carry the facts in metadata.** Run
   `design/scarf-artwork/loom-keepsake-capture.mjs` in the pipeline → `metadata.ts imageUri`. **The
   cloth now carries NO writing** (owner: "a scarf has no writing on it"), so the metadata fields +
   the cabinet UI must hold the provenance: teams · score · edition Nº · owner · call · won/lost.
   Keep the fallback order (scarf-svg → gradient) when the seed's unavailable — never the wrong/empty match.
   **The cabinet consumes this too:** each kept scarf renders `k.imageUri` (the mint PNG) as its
   thumbnail, previewed + unrolled in place — so wiring `imageUri` lights up the cabinet rack as well.
   (Demo uses captured `plate/scarves/<matchId>.jpg`; prod uses `imageUri`.)
4. **Seams I restyled AROUND (just verify on merge, shapes unchanged):** `revealFromWire` byEnd, the
   `case 'sentiment'` seal handler + Collect (terrace), `fixtureInfo` resolution, `/live` default.

Detail per item is below (newest first).

### The scarf is FINAL (owner 2026-07-16): PURE ODDS + calls
The keepsake cloth is now **the woven 3-way belief colour** (home/draw/away split shifting over the
match) + **the fan's framed selvage + fringe + their calls** — and nothing else. `woven-loom.html`
defaults: `events=none` (no goals/event marks) and cords OFF. Params still exist to bring density
back (`?events=goals|core|all`, `?cords=on`) but the shipped default is pure. **This makes P2 (item 2)
more important, not less:** the calls are now a primary visible element of the scarf, so wiring
`root` + `calls` from the terrace ledger is what gives each fan's scarf its personal marks. Demo
scarf images live at `apps/web/public/plate/scarves/<matchId>.jpg` (captured pure, via
`scratchpad`-style records); prod replaces them with the mint `imageUri`. The cabinet is **vertical**
— previews the head (kickoff) and unrolls in place to reveal how it ended.

---

## ⚑ LATEST (supersedes the reconciliation notes below) — prediction card + a new law

**Prediction card is built and lives on the owner's GENERATED ART** (commits through `2ede0b7`).
The terrace crowd/market box is no longer a code-drawn frame — the surface is his generated
portrait card, optimised to **`apps/web/public/plate/prediction-card.jpg`** (181 KB, source
`design/generations/predictions/predictions mobile.png`). Live data is overlaid into its two
cream fields; **every element ID was preserved, so no consensus/market wire shapes changed** —
`setPBar`/`refreshHvH`/`setMove`/`ccUpdate`/`marketUpdate` are display-only as before. Rig-verified
on ARG–CPV over WS (86% from real odds, 100% fan bar from 1 real prediction, heart-v-head +14),
console clean, `fixture.json` untouched. States shot 40–43 in this folder.

**NEW LAW — please add to AGENTS.md §laws (it cost us a full owner blow-up on 14 Jul):**
> **Generated art is the surface.** The owner's generated assets (cards, loom, scarf, any
> surface he generates) are the design and the source of truth. Live data is *overlaid* onto the
> actual asset — never rebuild or replace a generated surface with a code reproduction, however
> faithful. If an asset doesn't fit a target size/orientation, request a regen with a precise
> spec; do not substitute a code frame or shrink the asset until the data squishes.

Rationale + the incident are in my memory `never-substitute-generated-art`. The old code-frame
commits (`54b28ab`, `ab095a0`) are superseded by `2ede0b7` on this branch — reconcile to the
image-surface tree, not the code frame.

**LOOM→SCARF KEEPSAKE CAPTURE is built (commit `221f991`) — your pipeline half is open.**
`woven-loom.html` keepsake mode now re-renders headlessly for the mint image: seed resolves from
an injected `window.__loomKeepsakeRecord` / `#cloth=<base64>` / localStorage (not localStorage-
only), and `?export=1` makes the sealed render export-stable (instant settle, unclipped, a
`<html data-loom="sealed|empty">` wait-signal, and the seal's 1.35s print animation neutralised —
that last one is a real trap: a naïve shot mints a **seal-less** cloth). Reference harness + full
recipe (record shape, invocation, gotchas): `design/scarf-artwork/CAPTURE-RECIPE.md` +
`loom-keepsake-capture.mjs`. Verified end-to-end → `design/loom-object/scarf-keepsake-demo.png`.
**Yours:** emit the record from the stands service's match events → run the capture → set
`metadata.ts` `imageUri` to the PNG; keep the ordered fallback (scarf-svg → gradient) when the seed
is unavailable — never mint the wrong/empty match. All loom IDs preserved; live/replay/cabinet
unchanged.

**SCARF PERSONALISATION landed too (commit `1b6625b`): the single fan is woven in.** The record now
carries `root` ('home'|'away' → keys a selvage in the rooted team's dye down that side) and
`calls[{m,k,sub,hit}]` (the fan's predictions, knotted down a cream tape on that edge: held=solid
diamond, broke=open+tail, void=grey ring). Two fans of one match ⇒ recognisably the same cloth,
different edge (`design/loom-object/scarf-two-fans.png`). **Yours (P2):** fill `calls` from the
terrace CALLS ✓/✗ ledger (`resolvePred`) — stamp minutes, resolve `hit` off the feed, set `root`
from the gate pick, bind at seal. Live contract already exposed: `__loom.root(side)` /
`__loom.call({m,k,sub,hit,id})`. Full field spec + the honesty rule (the objective cloth must be
pixel-identical for every fan — only the edge differs) in `CAPTURE-RECIPE.md`.

---


Branch clean, all pushed (HEAD `ad0f3de`). 19 commits off `main`. I've stopped;
not starting new surfaces until you hand back a branch on current main. Per-surface
below, with **seam flags** = the JS paths I touched or that need your eyes on merge.

## Read these two first (net-state + a live fix)

1. **TERRACE net state = XP + aggregate RESTORED.** Two of my commits oppose each other:
   `4ecf0b2` first *removed* XP + the mean scoreline (built to COPY-BRIEF §2/§4), then the
   owner reversed it and `4656ff3` *restored* both. **Reconcile to the final tree state**
   (XP token on, aggregate mean scoreline on, `FROM n FANS`). Don't resurrect the strike.
   **XP naming RESOLVED (owner, 14 Jul): the progression reads as `POINTS`** (interim — "go
   points for now, change later if we think of something better"). Mechanic unchanged, label
   only. I apply `XP`→`POINTS` in the terrace footer (+ anywhere it reads) as part of the
   prediction/XP UX build on the reconciled branch — not on these stale files.

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
