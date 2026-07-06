# DESIGN COORDINATION — PASS 1 (stat graphics + copy)

*The owner's verdict on the current build: "at best, a good prototype… nowhere close to
what the Mirror provides. It's not beautiful enough." This pass exists to close that gap.
The design coordinator (main session) orchestrates; taste instances implement. Nothing
ships that wouldn't survive a side-by-side with the Mirror.*

## The bar
`/Users/ls/Documents/AI Reach/design/mirror-mobile.html` — open it, study it, absorb its
cadence before touching anything. What makes it sing: one commanding object per thought,
enormous quiet numbers, sentence headlines with a single emphasis, generous air, zero
boxes-for-the-sake-of-boxes, interaction that teaches without a manual. We are not copying
it — we are matching its LEVEL in our own material world (Paper & Cloth).

## The laws (binding, read these files first)
- `design/PAPER-AND-CLOTH.md` — the world: paper documents/steps, cloth lives/breathes,
  host palette (VERDE #1E7A46 · ROJO #C8202A · AZUL #27427F, Lichtenstein restraint),
  team ink carries team data, gold reserved, counts never % (crowd), market ≠ crowd.
- `design/BRIEF-PRINT-SOUL.md` — print physics: fat benday, ink-not-fill, paper-not-hex,
  weight scale 8:4:2. No blur, no gradients-as-decoration, no fake aging.
- References for count-as-form: `design/references/infographic inspo/` (counts as repeated
  bold units; the one-exception device; dot-tip rods; diagonal energy).
- The voice: `apps/web/src/app/voice.ts` header + owner's rules — plain, adult, numbers
  speak alone, **show don't tell**, no exclamation marks, no explainer sentences.

## The target file
`apps/web/public/loom-proto.html` (~2MB, single self-contained file). THE COUNT lives in
it as a DOM page (`#countPage`, built by `renderCount(t)`) with chapter canvases drawn in
`drawCpCanvases(m)` (ids `cpc-sv, cpc-wl, cpc-of, cpc-co, cpc-po, cpc-fr, cpc-bk`).
The STANDS rail is `#rail`. Edit via python with exact-match asserts (the file is too big
for editor tools); snapshot to `design/experiments/versions/` before you start.

## Verification playbook (hard-won — follow it)
- Serve: Claude_Preview MCP, launch config name `loom` (serves apps/web/public on :8756).
- Background tabs throttle rAF: for stable screenshots either call `render(t)` /
  `renderCount(t)` manually via preview_eval, or lock the clock (`st.playing=false; st.t=X`).
- Screenshots of scrolled regions can come back blank: scroll the INNER `#countPage`
  (`.scrollTop=…`) — that works; for page-level scrolls use `document.body.style.zoom`.
- Check `preview_console_logs level:error` after every reload. Leave the file with ZERO
  console errors and the front face (the cloth) pixel-identical in behaviour.

## Acceptance (self-review before returning)
Screenshot each chapter day AND night; ask of each: would a stranger, shown this beside a
Mirror band, believe they came from studios of equal calibre? If no — iterate, don't return.

## ADDENDUM (owner, mid-pass — binding immediately): THE COLLECTIBLE LAW
Every stat, page, and moment must feel like a COLLECTIBLE — a Panini-grade object
you'd want to show someone. The test per chapter/object: **crop it out alone and
send it to a friend — does it still carry its full story and full craft?**
Practically: each chapter is a self-contained composition (complete when cropped),
carries a quiet provenance whisper (fixture · minute where earned), has one strong
silhouette, and reads as a made object (patch/print), never as a screenshot of a
dashboard. "Great insights meet great design" at every turn. Now in
PAPER-AND-CLOTH.md §1; applies to this pass and all future passes.

## ADDENDUM 2 — the Panini references, read correctly
`design/references/panini/` (4 images) — INSPIRATION for collectible energy, NOT a style
to copy. The design remains firmly Bauhaus graphical beauty. The four lessons:
1. **The page is the collectible** (Nantes): each page/chapter commits to one ground,
   grid discipline, exactly one grid-breaker.
2. **Name-plates** (Got/Got/Need): every object carries a quiet plate — name · fixture ·
   minute, Doto caps. Uniform hairline frame FAMILY across all chapters (one system,
   light — not chrome) so the whole site reads as one album.
3. **The fan of cards** (Chelsea): physical fanned-stack presentation is reserved for
   keepsake moments (the Pressing's record stack).
4. **Bauhaus-as-collectible is real** (Nike Brasil grid): type-as-picture cards,
   committed two-tone fields, numbered roundels — our exact register, Panini energy,
   zero kitsch. When in doubt, this is the reference of the four.
Also: "GOT · GOT · NEED" is adopted vocabulary for THE ALBUM's slot states.

# PASS 3 — THE LEGEND (from COLD-EYES-PASS2.md; spec by the coordinator)
The cold-eyes verdict, translated to one interaction layer on the cloth:
1. TAP-A-MARK → THE PINNED TAG: every cloth element answers a tap with a small printed
   tag pinned at the spot (paper register, name-plate family, one at a time, tap-away):
   marks ("CPV GOAL · 103′ · ARG 93→41" — goals carry the belief swing), cords
   ("POSSESSION · ARG 61%" / "PRESSURE · LEANING CPV"), selvages ("THE CROWD · CPV END"),
   tempo rail ("TEMPO · 12 THIS MINUTE"), sub arrows ("SUBSTITUTION · ARG · 63′").
   Value-carrying labels only — the copy law applies to tags doubly.
2. THE KEY: a second tab at the LEFT selvage mirroring THE COUNT — opens a compact
   pinned key card: the five threads, each row a LIVE swatch sampled from the actual
   cloth + name + current value + explicit side attribution (ARG left · CPV right).
3. DISCOVERABILITY: both tabs breathe ONCE (single slow pulse ~2s after load; none
   under prefers-reduced-motion); the tags mechanic needs no tutorial beyond itself.
4. THE LOOP CLOSES: CHEER pops a visible spark on YOUR end's selvage (local echo).
   STAND WITH +1s the visible count locally in specimen mode.
5. TRUTH: the header dot reads ● LIVE only when LIVE.on; otherwise ○ REPLAY (grey).
   NAME IT locks visually after kick-off in replay (button → LOCKED AT KICK-OFF).
6. THE DECK SPLITS: product row (DAY/NIGHT + the named moment chips) styled as product;
   transport (play/speed/scrub) demoted to a quieter hairline-separated dev strip.
Backlog (not this pass): the FT scarf unroll ceremony (belongs to THE PRESSING build).
