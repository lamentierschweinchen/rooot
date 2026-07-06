# BRIEF — PRINT SOUL (the materiality + voice pass)

**Owner verdict #2 (Jul 4, on top of BRIEF-WATCHING):** "none of the current
display reads as *deliberate* but as some ugly generated flat textureless
object that doesn't even speak to the visitor."

**Coordinator's admission:** the gates checked GRAMMAR (are the elements
present, is the geometry honest) and never MATERIALITY (does it read as a
printed thing). Grammar passed; the object still looks like a diagram OF a
print, not a print. This brief is the difference, itemized. It applies to the
STAGE layers and the RELIC printers equally — they share the disease and they
share `paint`-level primitives.

## The five failures, named (compare any canon file in design/references/_chosen/)

1. **DOT SCALE — ours dither, canon's POP.** Canon halftone dots are BIG,
   round, visibly circular — Lichtenstein benday you could put a finger on
   (≈8–14 px equivalent at stage scale, with size stepping). Ours are ~3 px
   at dpr2 — they read as sensor noise / dithering, which is exactly the
   "generated" feel. FIX: HALFTONE.cell up ~2.5× on the stage territories
   (fields stay honest — same extents, same fray law, fewer & fatter dots);
   relic halftoneField same treatment. The fray then reads as INK receding,
   not static clearing.

2. **INK, NOT FILL.** Canon shapes have press character: slight ink gain at
   edges (dots marginally over-round), 1–2% registration wobble on ONE
   channel of a big field (never text), corners that are square-cut but not
   pixel-sterile, occasional 0.5px under-inking on long keylines. Ours are
   mathematically uniform vector fills — the "textureless object." FIX: a
   shared `inkCircle`/`inkRect`/`inkLine` primitive trio (stage geometry.ts +
   relics paint.ts point at ONE implementation) with: radius jitter hash
   ±4%, per-shape micro-rotation of dot grids (±0.4°), edge gain (radial
   alpha step 1.0→0.96 at rim, still discrete — never a blur), long-line
   weight breathing (±0.5px stepped every ~80px). Deterministic (seeded),
   cheap (pre-bake unchanged), reduced-motion-irrelevant (static character).

3. **PAPER, NOT HEX.** Newsprint is currently one flat hex value across
   thousands of pixels — no real paper is. Canon cream is WARM and ALIVE:
   corner-vignetted (2–3% darker at edges), faint tooth (the existing
   paperTooth at 0.05 is invisible — canon-effective is ~3× that), a barely-
   there warm-cool drift across the sheet (±2 RGB, one diagonal ramp, baked
   once). FIX: `paperField(rect, seed)` primitive used by page ground, pitch
   paper, relic grounds, chip faces. The page itself (Lane A's Newsprint
   ground) gets the same treatment via a baked CSS/canvas underlay — the
   WHOLE SURFACE is one sheet.

4. **WEIGHT — a scale, not a default.** Canon has a confident weight
   hierarchy: fat frame keylines, medium panel rules, fine detail lines —
   roughly 8 : 4 : 2 at card scale. Our stage uses near-uniform thin
   strokes (chalk, chip borders, seam all within ~1–2px of each other) — no
   hierarchy, no confidence, "generated." FIX: a WEIGHT token trio
   (frame/panel/detail) in theme.ts consumed EVERYWHERE a line is drawn;
   chip keylines and scoreboard rules move to panel weight; the 50% seam
   stays THE thin line (its thinness becomes meaningful once it's the only
   one).

5. **IT MUST SPEAK.** Canon surfaces address you: CALLED IT · THE STANDS ·
   CHEERS COUNT DOUBLE · END MX. The live page currently says nothing to a
   visitor — no greeting, no stakes, no invitation. FIX (Lane A page copy,
   this list is the voice bank): entry interstitial speaks first ("PICK AN
   END. LOSE THE MATCH, WIN THE STANDS."); the scoreband's phase chip talks
   ("THE DARK — 12% AND SINGING" when faith is on); empty ledger speaks
   ("THE STORY PRINTS HERE — KICK-OFF 17:00"); the cheer button LABELS
   itself ("ROOOAR" not an icon); disconnected states in plain stadium
   speak ("STANDS OPENING SOON — counts are local for now"). Every string in
   Anybody/Doto per the type law; stadium plain-speak, crypto backstage.

## Ground rules

- HONESTY UNTOUCHED: extents, seam, counts, swings — no material effect may
  bend a data mapping. Ink gain never changes an edge's POSITION.
- The banned list stays banned: no blur, no soft shadows, no gradients-as-
  decoration (the paper drift is a material, not a decoration — it is baked,
  static, and ≤2 RGB), no distressing stamps, no fake aging THEATRICS. This
  pass is print PHYSICS, not instagram filters.
- Everything deterministic + pre-baked; perf budget unchanged (~2ms frames).
- One implementation per primitive — stage and relics import the same code
  (the pop-ground precedent: laws live in lib/).

## Definition of done

Side-by-side screenshot of stage-prematch vs stage-prematch-canonical and
card vs card-front-canonical where a stranger cannot say which one is "the
reference" on material grounds alone. The owner's word to beat: DELIBERATE.
