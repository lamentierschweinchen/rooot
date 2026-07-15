# The minted keepsake IS the sealed loom (owner-confirmed, 14 Jul)

**Owner's words:** "the loom becomes the scarf. the live game, translated into a fan
keepsake that says 'I was here and this is what happened.'" The on-chain asset image
must BE the actual sealed loom that grew live during that fan's match — not a
placeholder, not a reconstruction.

## What this supersedes
- **`cover.ts` gradient** — retired as the primary mint image (was always a stopgap).
- **`scarf-svg.mjs` v2** (this folder) — **demoted from "the mint artwork" to a
  last-resort fallback.** It's a lookalike rebuilt from match data — a *different*
  object than the loom. Keep it only for the honest degraded case (see Fallback).

## Why this is clean: the loom is DETERMINISTIC
`woven-loom.html` renders the match as an SVG cloth and `seal()`s it at FULL_TIME.
The cabinet already unrolls that exact cloth by **re-rendering from a stored seed**
(`rooot.cloth.<matchId>`), not from a saved image. So the same loom code + the same
match seed = byte-identical object, anywhere. That means we don't need to capture the
fan's screen — the **server can re-render the very object they watched**, trustlessly.

## The path (recommended)
**Server-side headless re-render → rasterize → mint image.**
1. The stands service already holds the match's events → it can produce the same seed
   the client sealed with.
2. A headless browser (Playwright — **already vendored** in `scripts/footage` +
   `scripts/canary`) loads `woven-loom.html?keepsake=1&match=<id>` **with the seed
   injected**, waits for the seal, and screenshots the sealed cloth at 2× →
   `scarf-<matchId>-<owner>.png`.
3. That PNG is the mint's `imageUri` (metadata.ts already takes `imageUri` → `image` +
   `files[].uri`; just swap the placeholder for this).

Why PNG not SVG: the loom's cloth texture is **raster weave-tiles** (see gotcha 2),
so it's part-raster anyway; a high-res PNG is faithful, self-contained by construction,
and renders in every wallet/explorer. (Vector-SVG-with-everything-inlined is possible
but buys little here.)

## Two gotchas the capture MUST handle (this is the real work)
1. **Fonts** — the loom draws text in `Anybody` from `plate/fonts/*.woff2` (external
   `@font-face`). A headless render must load those fonts before screenshot (serving the
   page locally handles this automatically; a raw SVG export would need them inlined).
2. **Weave-tile PNGs** — the cloth fills use `<image href="assets/<tileset>-light.png">`
   / `-dark.png` as SVG patterns (woven-loom.html ~L440). A headless render of the served
   page resolves these fine; a detached SVG export would need them inlined as data-URIs.
   → Both gotchas **vanish if we screenshot the served page** (the recommended path) and
   only bite if someone tries to serialize the bare SVG. Noted so no one goes down that road.

## Lane split
- **Mine (design / loom):** make `keepsake` mode **seedable via param** (today it reads
  `rooot.cloth` from localStorage — the server needs to pass the seed on the URL / a
  served record so a headless render works without a prior client session). Keep the
  sealed render export-stable (fixed dimensions, animation settled before capture).
  Deliver the capture recipe. — small, self-contained loom change.
- **Coordinator / mint:** run the capture in the mint pipeline (or accept the produced
  PNG), set `imageUri` to it, keep the fallback. — the pipeline seam is yours.

## Honesty + fallback
The object maps 1:1 to the real match and the fan's real record (edition · owner · call,
already bound via `keepsake()`). If the seed/tape is unavailable at mint time (can't
honestly render this fan's cloth), fall back — in order — to the `scarf-svg.mjs`
reconstruction (labeled as such), then the gradient. **Never mint a cloth from the
wrong match.**

## Future (owner's open question — DESIGN-FOR, don't build yet)
"whether fan actions influence the look — chosen team frames the scarf, or engagement
transforms the NFT's rarity." The capture already receives per-fan params (owner, call,
edition); design the seed/param interface so a fan's rooted side (a keyed selvage/frame)
or engagement (cheers / correct calls → a rarity tier or a woven detail) can ride in
later **without re-architecting**. Keep it out of the first cut.
