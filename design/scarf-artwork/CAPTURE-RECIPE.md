# Loom→scarf keepsake capture — recipe (mint image)

The minted asset image IS the sealed loom the fan watched (see `LOOM-AS-KEEPSAKE.md`). This is
the headless re-render → PNG recipe. **Design-lane half is done and verified; the pipeline half
is the coordinator's** (lane split at the bottom).

## One command

```
node design/scarf-artwork/loom-keepsake-capture.mjs \
  --out /tmp/scarf-<matchId>-<owner>.png \
  --record cloth-<matchId>.json \
  --match <matchId> \
  --base http://localhost:4199        # a static server over apps/web/public (or the deployed origin)
```

- **`--record`** — the sealed *cloth seed* (JSON, shape below). Omit it to self-test: the harness
  lifts the bundled demo match (`window.MATCH`) into a record and mints that. With `--record` it
  mints exactly that match — nothing from the demo.
- Output: the `#loomsvg` element (the woven cloth **plus its seal footer**) at 2× ≈ **394×1342 →
  788×2684 px** for a 123′ match. That element is the scarf; the app masthead is chrome, excluded.
- Exit **2** if the record is missing/invalid (the loom renders `data-loom="empty"`) — it refuses
  to mint a blank cloth, so the pipeline can fall back (never mint the wrong/empty match).

## The record (the "cloth seed")

Same shape `woven-loom.html` stores at `rooot.cloth.<matchId>` when a driven cloth seals
(`writeCloth()`), so the stands service can emit it straight from the match's events:

```jsonc
{ "v":1, "fx":"<matchId>",
  "home":{"tri":"ARG","ink":"#2049AA"}, "away":{"tri":"CPV","ink":"#C8504D"},
  "score":[3,2], "dur":123.1, "src":"replay",
  "belief":[[minute, pHome%, pDraw%, pAway%], …],   // the market thread
  "danger":[[minute, homeShare], …],                // 0..1
  "poss":[[minute, homeShare], …],                  // 0..1
  "events":[[minute, "h"|"a"|"", "goal"|"corner"|"save"|…, name], …],
  "pens": null,                                      // or {h,a,winner} for a shootout
  "ks":{ "editionNo":7, "owner":"lukas.sol", "call":{"label":"CALLED ARG · WON","hit":true} } }
```

`ks` is the personal binding printed into the seal (edition Nº · owner · the proven call). Honest-
empty is fine (`ks:null`) — the seal then reads "WOVEN FROM THE WIRE · Nº —".

## How the loom cooperates (what changed in `woven-loom.html`)

- **Seedable without localStorage.** `keepsake` mode resolves the record in order: injected
  `window.__loomKeepsakeRecord` (set before boot — how this harness passes it) → `#cloth=<base64>`
  in the URL (self-contained link) → `localStorage rooot.cloth.<id>` (the client cabinet unroll).
- **`?export=1`** — settles instantly (no unroll sweep), unclips the scroll so the whole tall
  cloth lays out, **neutralises the seal's 1.35 s "print" animation and the gold-selvage draw-on**
  (they'd otherwise be mid-animation at capture), and sets `<html data-loom="sealed">` (or
  `"empty"`) when the cloth is drawn — the one thing to wait on.

## Gotchas (both handled by screenshotting the SERVED page)

1. **Fonts** — the cloth/seal draw in `Anybody` (`plate/fonts/*.woff2`). The harness awaits
   `document.fonts.ready` before the shot. (A detached SVG export would need them inlined — don't.)
2. **Weave-tile PNGs** — the cloth fills are `<image href="assets/…-light.png">` patterns; served,
   they resolve; the harness adds a short settle. (Detached SVG would need them as data-URIs.)

> A silent bug this caught: the seal footer (FULL TIME · THE SCARF IS YOURS · YOUR CALL · WOVEN
> FOR · Nº) is invisible for 1.35 s after render (a print-in animation). A naïve capture mints a
> **seal-less** cloth. `export` mode forces the final state, so the seal is always in the frame.

## Lane split

- **Design / loom (DONE, verified — commit on `design-pass-jul14`):** loom is seedable + export-
  stable; this reference harness + recipe. Evidence: `design/loom-object/scarf-keepsake-demo.png`.
- **Coordinator / mint (open):** run this in the mint pipeline (the stands service emits the
  record from match events → capture → set `metadata.ts` `imageUri` to the PNG). Keep the ordered
  fallback (scarf-svg reconstruction → gradient) when the seed is unavailable — never the wrong match.
  `playwright` here resolves from `scripts/footage`; the pipeline can use its own install.
