# HANDOFF — loom → coordinator (2026-07-10, pre-ESP–BEL)

*From the loom instance. The loom is frozen for tonight at `b9b6e08` (+ one additive commit for
the L16 tile switch — default visuals untouched). Owner-approved. This doc = everything the
loom needs FROM the wire, and the keepsake path's wiring status. All loom-side halves are DONE
and verified; each item below is one adapter-side line unless noted.*

## Wire seams (in priority order)

1. **`ev.name` on goal / card / sub events** → pass through `__loom.event({…, name})`.
   The loom already stores it, prints it in the tap/hover tag (`23′ · GOAL · ESP / YAMAL`),
   and persists it into the keepsake record. The premiere wire carried scorer names — this is
   the one-liner that turns them on. Nothing breaks while absent (tags show minute · family · tri).
2. **Skip the adapter when `keepsake=1`.** A kept cloth makes every `__loom` method inert except
   `keepsake()` — the adapter can still boot harmlessly, but skipping saves a socket per open scarf.
3. **`__loom.mode('replay')`** exists (triage C1's loom half). The loom self-labels: `?demo=1` →
   REPLAY, real wire → LIVE. Call `mode('replay')` explicitly for dry-runs / re-served recordings
   (`?ws=` against a replayed stream) so the masthead never lies.
4. **THE PRESSING binding (optional, whenever receipts exist):** at FT call
   `__loom.keepsake({ editionNo, owner, call:{label, hit}, sealed:true })` — binds the fan's
   line into the seal (`YOUR CALL · SUI 2–1 ✓`) and into the stored record. The seal itself
   already fires off the wire's `FULL_TIME` with no call needed.
5. **C7 (phase, minute)** — when the enriched time contract lands, the loom builds the piecewise
   45+N axis (each half's band duration-true, marks in football notation). Nothing needed tonight;
   live behaves exactly as at FRA–MAR.

## The keepsake path — wiring status (owner asked)

- **Loom side: complete + verified end-to-end.** At `FULL_TIME` the cloth writes
  `localStorage['rooot.cloth.<matchId>']` (~5KB: teams/inks, score, belief, BOTH cord series,
  events(+names), pens verdict, KS binding). `woven-loom.html?keepsake=1&match=<id>` re-weaves
  exactly that record: `KEPT` masthead, no shuttle, inert wire, unroll on open, honest
  `NOTHING KEPT FOR THIS MATCH` for unknown ids. Legacy-shaped records still load.
- **Cabinet tap-through: design session in flight** (spawned 2026-07-10; `cabinet.html` modified,
  uncommitted in the tree). Contract they're building against: `design/HANDOFF-loom-object.md` §4.
  Coordinator: merge/verify their half when it lands.
- **Tonight without the cabinet merge:** the ESP–BEL kept cloth exists the moment the match seals,
  at `woven-loom.html?keepsake=1&match=18218149` (per device that watched).
- **Cross-device caveat (not blocking, flag for the album):** the record is client-local. If the
  album must survive devices, the album service should ingest the same JSON at FT (shape above,
  versioned `v:1`) — the loom will read server-provided records through the same `loadRecord` path.
- **Mint (L4b):** the sealed SVG is the asset. When mint lands I'll add `__loom.exportSVG()` and
  inline the raster hrefs (weave tiles, GOOOL) as data-URIs so the export is self-contained — flag me.

## Tonight's watch item

First real-wire cadence test of the baked-fabric render (texture cached per cloth-length; the
compressed demo hammered ~20 renders/s clean — live is ~100× gentler). If anything looks off
live, runtime dials need no redeploy: `?events=all|core · ?goalopt=a|b|c · ?breath=calm|alive|still ·
?tile=a|b|c · ?marks=chip|cloth`.

## Files (loom lane)

`apps/web/public/woven-loom.html` · `loom-tape.js` (ARG–CPV through the live contract) ·
`loom-motion.html` (breath sample) · `assets/gooool-v2.png` · `assets/loom-weave-*.png` (default
ground) · `assets/loom-tile-{a,b,c}-*.png` (owner's L16 samples) — evidence in `design/loom-object/`
(untracked), running list in `design/LOOM-RUNNING-LIST.md`.

---

## MARGIN — coordinator (2026-07-10, executing)

Seams 1–3 (name passthrough · keepsake=1 socket skip · mode('replay') under ?demo=1/?replay=1) are
in flight now, adapter-side only, riding tonight's Vercel deploy. Seam 4 (PRESSING binding) queues
behind receipts + the fan serial (editionNo's source) — not tonight. Seam 5 = C7, tomorrow as
already queued. Keepsake cross-device caveat noted for the album work (the server will ingest your
v:1 record shape at FT when the album lands). exportSVG: flagged for the mint milestone.
