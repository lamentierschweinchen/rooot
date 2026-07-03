# ROOOT — THE SYSTEM

*The law. One purpose: **a unique and FUN fan experience** — the World Cup as a living
mechanical print, on a phone, on-chain forever. This file is written for build lanes
(stage · crowd · relics · mint). It is the human-readable twin of
`apps/web/src/lib/theme.ts` (the tokens as code) and `apps/web/public/system.html` (the
specimen page). **Where any two disagree, this file governs.** Every rule traces to a
precedent in `design/references/_chosen/` or the brand-book tables — never to generic
taste. If your render drifts toward betting-app / dashboard / AI-gradient, it dies in review.*

**The world in one line:** benday-ink grounds owned one-at-a-time (loud but Lichtenstein-subdued,
not Barbie), hard Press-Black keylines + cream borders, one diagonal max, honest geometry as flat
color fields that **fray into scattered dots** at their working edges, pop-geometry glyphs,
pictogram crowds, offset-print texture — and **every surface built to be collected** (framed,
captioned, edition-marked). **Loud, retro, cartoon-alive; never moody, never glowing.**

---

## 0 · HOW TO USE THIS FILE

- **Building a surface?** Read §1 (grounds), §2 (grid), §3 (geometry) first — they decide
  the frame before you place anything.
- **Placing a number?** §4 type roles: it prints in **Doto**. Always. No exceptions.
- **Building a component?** §6 has the anatomy/proportions/states for each canonized part.
  Import its numbers from `theme.ts` — do not re-type them here.
- **Animating?** §7. Everything is stepped/snapped and gates on `prefers-reduced-motion`.
- **Unsure if something's allowed?** §8 banned list. When in doubt, it's banned.

---

## 1 · GROUNDS & COLOR (the Topps rule)

**One loud ground owns a surface at a time. Two loud grounds NEVER touch** — separate them
with a Press-Black seam or a cream border. **Team colors are never the ground.**

**The louds are BENDAY-PRINT INKS on cream, not neon.** Roy Lichtenstein *slightly
subdued* — each loud pulled ~10–18% toward Press-Black ink (brick-reds, print-yellows,
process blues), still LOUD and fun but **not full Barbie, not pastel, not muddy**. See the
changelog block at the foot of this file for the old→new hex pairs.

### Neutrals (the calm frame — always present)
| Token | Hex | Role |
|---|---|---|
| `newsprint` | `#F3ECDA` | default paper ground · card border · album page |
| `sunbleach` | `#EDE3C8` | warmer paper — stubs, pennants, card interiors |
| `pressBlack` | `#1A1A18` | every keyline, rule, scoreboard, heavy display type — the ink |
| `terraceGrey` | `#B0AEA8` | the neutral DRAW / void ground · subdued/inactive data |
| `medalGold` | `#D6A33B` | **the RARE mark only** — reward language, proof line, PROVED punch, special ticks. A printed spot, never a glow |

### Loud grounds (the rotation — one per surface)
| Token | Hex | Role — post-revision |
|---|---|---|
| `poppy` | `#C8504D` | **LEAD working loud — Lichtenstein brick-red.** Card ground · GOOOL ground · England territory. Hosts both cream + black type. |
| `kickoffSky` | `#3E8CBC` | **LEAD working loud — process blue.** Lighter match states · "the Dark" alt · accents. |
| `aztecaSun` | `#E5B431` | print-yellow — pre-match stage frame · warm proof objects. **Black type only** (cream vanishes on yellow). |
| `grass` | `#1F6F40` | Mexico territory + fan-end flag blocks. |
| `ultra` | `#2049AA` | deep process blue — "the Dark" late-tension frame. |
| `magenta` | `#AC3A6B` | bureaucratic strip pink (inked toward brick) — ticket-stub blocks + proof language. |

### The accent (punctuation — NEVER a ground)
| Token | Hex | Role |
|---|---|---|
| `fizzPink` | `#C52C67` | **ACCENT ONLY** — the eruption punch. The starburst core, the fire-fringe, the shockwave rings — a hit of pink *ON* the Poppy goal ground, never *AS* a ground. Demoted from its old primary/card/GOOOL ownership: *"accent not primary; less popping."* |

### Ground-role reassignments (the owner's gate)
- **Card ground = `poppy`** (was `fizzPink`). The brick-red carries the warm Panini/Topps
  energy the pink used to, pairs cleanly with the cream border + Press-Black keyline, and
  reads with *both* cream type (tricodes, THE STANDS) and black type (chips, keylines).
- **GOOOL / eruption ground = `poppy`** (was `fizzPink`), so a scored card and the goal
  frame share the hot brick-red family. **`fizzPink` returns as the eruption accent** —
  the starburst core / fire-fringe / shockwave — separated from the Poppy ground by the
  drawn Press-Black starburst so two louds never blend.
- **`kickoffSky` and `poppy` are the two leading working louds**; `fizzPink` is absent from
  the rotation (it can never be handed out as a ground).

### Choosing a ground per fixture
1. Pick a loud ground from the rotation that **neither team owns** (leads first: Poppy, Sky).
2. If both teams are loud and clash with every candidate, use `terraceGrey`.
3. **Rotate the ground, never the team.** Team identity is fixed; the ground yields.
4. **Never reach for `fizzPink` as a ground** — it is accent-only. If a surface wants heat,
   use Poppy as the ground and Fizz Pink as the punch.
5. `pressBlack` + `newsprint` + one `medalGold` accent are the constant that lets any two
   team palettes coexist on the same surface.

### Team-color jurisdiction (the four legal slots — `TEAM_COLOR_SLOTS`)
A team color may appear **only** as:
1. **territory** — the halftone field advancing from that team's goal-end.
2. **flagBlock** — the flag / patchwork panel at that team's belief end.
3. **scoreChip** — the keyline-boxed team chip in the scoreboard band.
4. **relicEnd** — the scarf / pin / relic end.

Anywhere else — as a ground, as UI chrome, as a button — is a **violation**. Demo fixture:
Mexico = Grass, England = Poppy (brick-red), ground = **Kickoff Sky** (owned by neither → legal;
Fizz Pink can no longer be a ground).

### Legibility gate (hard)
On a loud ground, type is **black, white, or the *contrasting* loud** — never a near-value
neighbor. Test at thumbnail: if the word blurs into the ground, the pairing is illegal.
This applies doubly to Doto/Silkscreen numbers (low-contrast dot forms) — enforce or the
numbers vanish into a hot ground.

---

## 2 · GRID & FRAME (boxes-first)

**Draw the boxes first, fill second.** No floating elements — everything lives inside a
keylined cell or ON a band. (POP-LANGUAGE §C; `GRID` in theme.ts.)

- **Keyline weight is a system, not a guess.** Outer keyline ≈ **2%** of the object's
  width; inner rules/dividers = **1%** (half). Band separators = full keyline. Never mix
  arbitrary weights. Use `keylinePx(objectWidth)`.
- **Cream/white border is mandatory and uniform** around any framed object ≈ **5%** of
  width, same on all four sides. This breathing room is what keeps loud grounds from
  screaming into each other.
- **ONE diagonal maximum per composition** (~14° off horizontal). Everything else is
  orthogonal. The diagonal is a *reserved special event* — **THE STANDS band** on the card
  and the **GOOOL block** on the goal frame are the only sanctioned diagonals. If you
  stripe, all stripes run parallel. Two competing diagonals = clipart chaos.
- **Type sits ON a band or INSIDE a box — never floating on the ground.** If text has no
  band/box, it's misplaced.
- **Alignment is to grid edges.** Labels hang to the left rule; numbers to the right rule.
  Pictogram rows are evenly distributed, never eyeballed.
- **Busy is fine IF gridded.** Density ≠ chaos when every element is a same-size cell in a
  rank (see the pennant, the ornament rails).
- **Ornament rails carry JOBS, not decoration.** In the canon (`stage-prematch-canonical`,
  `stage-prematch-roar-pop-rails`) every rail cell is a real module — a halftone-density
  swatch, a ROAR ring-meter, a POP ball chip, a flag block, a starburst tick. A rail cell
  with no data job is sticker-bomb → banned. Rails are content, not frame filler.

Aspect ratios: **card = 5:7 portrait**, **stub = 2:1 landscape**, stage = phone-tall
(the pitch fills a portrait viewport).

---

## 3 · HONEST GEOMETRY (the probability axis)

The single most important law. **Vertical position = probability.** Every pixel maps to the
feed, the taps, or the chain. (`GEOMETRY` in theme.ts.)

- **Halfway = a thin, constant Press-Black seam at EXACTLY 50%.** It never moves. It is the
  50/50 the whole app is built on. Weight ≈ 0.6% of pitch height. **It SURVIVES the teeth
  removal** — the seam is the one constant midline, untouched.
- **THE DRAW is a paper-band WIDTH, not a line — and it is a DOT-FRAY, not teeth.**
  ***Teeth are dead.*** The draw is no longer bracketed by zigzag perforation. Instead the
  two territory halftone fields **FRAY** at their working edges — dots scattering, thinning,
  interleaving sparsely — and **THE DRAW is the width where the combined dot density
  collapses to near zero.** Width still exactly = `pDraw`. The 50% seam rides *inside* that
  collapse zone. So: *seam = the constant honest midpoint; the fray-collapse width = the live
  draw probability.* Two different truths, two different readings. See the fray spec below.
- **Team territories are halftone fields** from each goal-end. Each field is **solid at the
  goal-end, fraying to scattered dots at its working edge.** The extent of a field =
  **EXACTLY** that team's win probability. When probability shifts, the working edge (the
  fray frontier) advances/retreats.
- **The working edge default is the DOT-FRAY** (solid core → scattered-dot collapse,
  `FRAY.frayStart` → `dissolveSpan`). Two named variants exist (§6): the **crowd-silhouette
  edge** (the edge drawn as a row of standing fans — canon `stage-goool-crowd-silhouette-edge`,
  `card-instrument-sidebar`) and, on the card, the **equalizer-skyline** portrait.

#### The dot-fray, precisely (`FRAY` in theme.ts)
The frontier is a **zone**, not a torn line. Measured outward per field from its solid core
toward the seam (`t` in `[0..1]` across the fray zone = `dissolveSpan` of the field):
- **Density curve.** Dots hold full coverage until `frayStart` (0.15), then their **placement
  probability** decays on an ease-out curve (`frayCurve` = 2.2) to `frayFloor` (0.04) at the
  working edge — a few last outriders, never a hard stop. It is a probability of a dot
  *existing* at each grid cell: a dropped dot is simply **absent**; a kept dot is **full-ink.
  Never an opacity fade, never a blur.**
- **Dot-size behavior.** As coverage thins, surviving dots also shrink from the field's normal
  radius (`HALFTONE.dotMax`) toward `strayDotMin` (0.12 of the cell), so the frontier reads as
  a **scatter of small specks**, not big holes punched in a slab. Size decay **lags** coverage
  decay by `sizeLag` — dots THIN before they SHRINK — so the leading edge is a few full-size
  outriders, then specks.
- **Two colours interleaving.** Where the two fields' fraying tails overlap, their stray dots
  sit on the **same cell grid** at offset sub-cell positions (`interleaveJitter` = 0.34) so a
  red speck and a green speck sit **side by side as two discrete dots**. They must **NEVER
  blend into a mixed ink or a muddy overlap** — on collision, the **leading (higher-probability)
  field's dot wins** and the trailing dot is dropped (`collisionRule`). The band where **both**
  fields have decayed below `collapseCoverage` (0.06) is **THE DRAW**: near-empty cream with
  the Press-Black seam crossing it.
- **Market number ≠ crowd counts. NEVER blended.** The market has the *number* (the tide, the
  %). The crowd has the *roar* (real counts). A crowd count is never dressed as a percentage;
  a probability is never dressed as a headcount. They live in different modules with different
  voices (see §4: % prints as `39%` in a chip; a count prints as `8,207 ROOTED`).
- **Goals erupt only at the real goal mouth** — the eruption originates at the goal, not
  mid-field, not floating.

Clamp: a probability renders in `[minRenderP, maxRenderP]` (2%–98%) so a long-tail 2% still
shows a legible sliver rather than nothing.

---

## 4 · TYPE (four voices, one job each)

The type roles are non-negotiable role assignments, not style suggestions.
(`FONT_STACKS`, `TYPE_ROLES`, `FONT_URLS` in theme.ts; URLs verbatim from `type-lab.html`.)

| Voice | Font | Job — and ONLY this job |
|---|---|---|
| **scream / display** | **Anybody** (`wdth 50..150`) | the wordmark, verdicts, GOOOL, band words, tricodes. The **wdth axis IS the stretch** — R-O-O-O-T widening under the thumb is the hold-to-call gesture as type. |
| **programme** | **Young Serif** | verdict / editorial register **ONLY**. **NEVER on a loud ground** — the pop world is sans; a serif on a Topps band reads as a second brand. Reserve for editorial / programme moments on paper. |
| **data / printer** | **Doto** | **ALL numbers** — score, clock, %, counts, serials, meter readouts. The dot-matrix impact-print voice. **Never set a probability in a display face.** |
| **knit** | **Silkscreen** | relics only — Doto rendered as pixel-jacquard stitches (the scarf twin), 1:1. |

Alternates (not defaults): **Fraunces** (editorial serif), **Handjet** (dot face). Reach for
them only when a moment specifically calls for an alternate register.

**The data-vs-design rule:** the designed base speaks in display faces; the fan's data prints
in the dot voice. If a value is *measured* (a probability, a count, a minute, a serial) it is
Doto. If a value is *shouted* (GOOOL, THE STANDS, a tricode) it is Anybody.

---

## 5 · TEXTURE (press language, never aging)

Texture = the honest signature of a real press. **NOT wear.** (`HALFTONE` in theme.ts;
POP-LANGUAGE §D.)

- **Halftone dots** — the tonal fill for any figurative/territory area and for belief
  density. Coarse enough to **read as dots** (≈ the '66 duotone panel, not a fine magazine
  screen). One or two inks only. Density carries belief: dots crowd toward the leading team.
- **Offset grain** — a subtle uniform paper tooth on grounds. The "printed on paper" feel.
- **Misregistration** — a hair of deliberate CMYK offset (0.3–0.8%) on a keyline as the
  "real press" signature. **Sparingly.** A whisper is charming; global is kitsch.
- **THE HARD CEILING — banned outright:** sepia, scratches, torn/burnt paper, coffee stains,
  faux-vintage filters, halftone cranked to "grunge," blur, glow, gradient mesh, drop-shadow
  blur, glassmorphism. The references that read *premium* (Topps, Mexico-70, Zidane) are
  **clean prints in saturated ink.** If it looks distressed or glowing, it's wrong.

---

## 6 · CANONIZED COMPONENTS (anatomy · proportions · states · where used)

Each component's numbers live in `COMPONENTS` in theme.ts; import them. Anatomy below.

### 6.1 · Territory field (the honest belief fill) — *default working edge*
- **Anatomy:** a team-color halftone field rising from that team's goal-end; solid core →
  dot-dissolve at the working edge; extent = win probability.
- **Proportions:** dissolve begins at `dissolveStart` (55% of the way to the edge) over
  `dissolveSpan` (22% of the field). Dot cell = `HALFTONE.cell`.
- **States:** *idle* (breathing — dots appear/disappear, edge steady); *advance/retreat*
  (edge snaps then settles on an odds tick); *level* (both fields meet at the seam inside the
  draw band).
- **Where:** the stage pitch (both goal-ends). Canon: every `stage-*` render.

### 6.2 · Crowd-silhouette edge — *territory variant*
- **Anatomy:** the working edge of a territory drawn as a **row of standing fan silhouettes**
  (people-shaped peaks) instead of a dot-fade or zigzag. The field below is solid team color;
  the fans are the boundary.
- **States:** the silhouette row is the edge; it advances as the territory advances.
- **Where:** stage alt (canon `stage-goool-crowd-silhouette-edge`) and the card portrait
  sidebar (canon `card-instrument-sidebar`). Do not mix with a dot-dissolve on the same edge.

### 6.3 · Equalizer-skyline — *card data-portrait (and possible stage alt)*
- **Anatomy:** the fan's data as a **skyline of vertical bars** rising from the goal-end
  (like an audio equalizer), each bar a data reading, halftone-filled. This is the fan's
  "portrait" — figurative WITHOUT a face (POP-LANGUAGE §B.9).
- **Proportions:** `skyline.bars` bars, gap = `skyline.gap` of bar width.
- **Where:** the trading-card portrait (canon `card-front-canonical`,
  `card-front-roarbars-refined`).

### 6.4 · Draw-band with dot-fray *(teeth are dead)*
- **Anatomy:** NOT a toothed band. The two territory fields **fray into scattered dots** as
  they approach the midline; the near-empty cream zone where both densities have collapsed IS
  the draw band. The thin Press-Black 50% seam rides inside that collapse. No zigzag anywhere.
- **Proportions:** total collapse width = `pDraw` × pitch height. Fray follows `FRAY` (density
  curve `frayStart`→`frayFloor` on `frayCurve`; specks shrink to `strayDotMin` lagging by
  `sizeLag`; two colours interleave at `interleaveJitter`, leading field wins collisions). The
  draw begins where combined coverage drops below `collapseCoverage`.
- **States:** the collapse width breathes with the live draw probability (the fray frontiers
  advance/retreat); individual dots blink in/out on the idle breathe, never smear.
- **Where:** the stage, straddling halfway. The dot-fray language already lives in canon
  `stage-dark-crowd-canon` and `stage-prematch-pct-chips-donor` (fields thinning to specks
  toward the midline) — this formalizes it as the draw grammar and retires the old teeth.

### 6.5 · % chip (label + Doto number + block-meter)
- **Anatomy:** a keyline box: **label cap** (team tricode / "DRAW", Anybody) on a color header
  → **big Doto percentage** → **block-meter** (a grid of cells, filled count ≈ the percentage).
- **Proportions:** meter = `pctChip.meterCols` × `pctChip.meterRows`, gap `meterGap`. The
  filled cells read bottom-up.
- **States:** number + fill update together on an odds tick (counter-tick settle, §7); a
  DRAW chip uses `terraceGrey` fill.
- **Where:** stage sidebar rail. Canon: `stage-prematch-pct-chips-donor` (ENG 39% / DRAW 27% /
  MEX 34%), module donor `stage-prematch-roar-pop-rails`.

### 6.6 · ROAR ring-meter
- **Anatomy:** **off-center** concentric rings (the off-center source dot is the signature) —
  Wyman op-art, a printed sound. Pulses OUTWARD at the **cheer rate**.
- **Proportions:** `roarMeter.rings` rings; source dot offset `sourceOffset` (18%) from center;
  ring weight `ringWeight`. **No glow, no opacity haze** — rings expand in crisp discrete
  states and reset.
- **States:** *latent* (static rings); *pulse* (a ring births at the source and steps outward,
  period = `roarPulse` scaled inversely to cheer rate); *max* (all ring states lit — feeds the
  goal eruption).
- **Where:** stage rail (canon `stage-prematch-pct-chips-donor` bottom row, `-roar-pop-rails`
  "ROAR" cell); the giant speaker-ring form on `card-instrument-sidebar`; the stub's ring row.

### 6.7 · Pictogram crowd block (+ bunting row)
- **Anatomy:** a dense field of **geometric fan glyphs** (heads, torsos, raised arms, held
  flags, dots) — **no faces** — packed as the crowd. A **bunting / flag row** caps the top.
  This is the best crowd rendering in the canon.
- **Proportions:** glyphs on a tight grid; the bunting row is one cell tall, flags as
  keylined blocks.
- **States:** *idle* (steady); *cheer* (rows swap raised-arm / flag / dot states — pattern
  change, **not** character acting); density can track real cheer counts.
- **Where:** stage belief ends (canon `stage-dark-faith-crowd`, `stage-dark-crowd-canon` — the
  bottom crowd block with the `71'` dot-matrix readout and CHEERS COUNT DOUBLE). **Counts here
  are never a percentage.**

### 6.8 · Starburst (drawn rays + fire-fringe + shockwave rings) + GOOOL type
- **Anatomy:** a **drawn** Press-Black/Newsprint starburst (hard-pointed rays) exploding from
  the goal; a **cartoon fire-fringe** (sawtooth flame teeth) where the hot territory field
  meets the paper; **shockwave rings**; the word **GOOOL** in Anybody, the **Os as pop-ball
  pinwheels or halftone half-discs.**
- **Proportions:** `starburst.rays` rays (inner/outer ratio `rayInner`); `fringeTeeth`
  sawtooth across the boundary; `shockwaveRings` rings.
- **States:** frame-stepped eruption (`STEPS.starburst` frames over `MOTION_MS.starburst`) —
  see §7. Origin = the real goal mouth.
- **Where:** the goal frame. Canon `stage-goool-canonical-v2` (drawn starburst + fire-fringe +
  half-disc Os) and `stage-goool-crowd-silhouette-edge` (speaker-ring Os + roar-rings variant).

### 6.9 · Scoreboard band
- **Anatomy:** a horizontal band (Press-Black or paper): **flags as keyline-boxed blocks** at
  each end, **tricodes** (Anybody) flanking a **dot-matrix score** and **clock** (Doto). A
  status strip below ("KICK OFF SOON", "CHEERS COUNT DOUBLE").
- **Proportions:** band height `scoreboard.height`; flag blocks `flagAspect` (3:2).
- **States:** score/clock **flip** — dot columns print then snap into register (`scoreFlip`).
- **Where:** top of every stage; the card's mini scoreboard. Canon: all `stage-*` tops.

### 6.10 · Pop-ball glyph — *the house mark*
- **Anatomy:** a **FIVE-segment Wyman pinwheel** on a disc — two colors plus black. **NEVER a
  hexagon soccer ball** (brand-book explicit correction). The middle Os of R-OOO-T, the score
  dot, the loading mark, the favicon.
- **Proportions:** `popBall.segments` = 5; disc ring weight `popBall.ring`.
- **States:** *rest* (static); *step-spin* (rotates in `STEPS.popBall` hard increments with a
  tiny Press-Black misregistration wobble — §7); *squash* (a bounce beat).
- **Where:** wordmark, ornament rails (canon `-roar-pop-rails` "POP" cell), stub pictogram row,
  card corner (canon `card-front-canonical` top-right).

### 6.11 · Stat chip (LOU / FTH / FOR / PRE)
- **Anatomy:** a small keyline box: **three-letter label cap** (Anybody) over a **big Doto
  number**. The four labels are fixed: LOU, FTH, FOR, PRE.
- **Proportions:** see `statChip.labels`. Numbers are Doto, dot-matrix.
- **States:** static per card; number can settle on reveal.
- **Where:** the four corners of the trading card (canon `card-front-*`), and the card footer
  strip as a labeled micro-row.

### 6.12 · THE STANDS diagonal band — *the reserved card diagonal*
- **Anatomy:** a Press-Black diagonal band carrying **THE STANDS** (Anybody, large) + an END
  label (Doto), at `standsBand.angleDeg` (14°). This is the card's **one** diagonal.
- **States:** static.
- **Where:** the trading card, lower third (canon `card-front-canonical`,
  `card-front-roarbars-refined`).

### 6.13 · Stub anatomy (the call receipt)
- **Anatomy:** a **2:1** landscape receipt: a **rotated CALLED IT rail** (Anybody, 90°) down a
  loud left edge (`stub.railWidth`); a **top data line** (Doto — "MINUTE 71 · THE WORLD SAID
  12%"); a **pictogram row** (3 cells — gate / section / seat, or the pop-ball + roar-rings
  row); a **serial / edition line** (Doto, "Nº 000120", repeated top + bottom — the reserved
  memento serial slot, §10); a **gold PROVED die-cut punch** (`punchDia`, medalGold); and a
  **perforated tear edge** down the detach side (`tearTeeth`). **This perforation is THE SOLE
  LEGAL TOOTH in the system** — real ticket anatomy, the one sanctioned exception to "teeth are
  dead" (§9.2). *(Pending owner veto; if vetoed, the detach edge becomes a plain die-cut rule.)*
- **Proportions / variants:** the labeled micro-row (GATE E7 / SECTION L / SEAT 7 — canon
  `stub-labeled-microrow-donor`); the warm-seats palette alt (canon `stub-warm-seats`).
- **States:** *unproved* (no punch) → *PROVED* (the punch lands as an ink stamp — §7).
- **Where:** the call relic. Canon `stub-canonical-iconic` (+ the two donors).

### 6.14 · Card anatomy (the trading card)
- **Anatomy:** **5:7** portrait; Press-Black keyline + cream border; a **portrait window**
  (§6.3 equalizer-skyline or §6.2 crowd-silhouette) with a mini scoreboard atop; **four corner
  stat chips** (§6.11); the **THE STANDS diagonal band** (§6.12); a **footer strip** ("ROOOT ·
  MATCH Nº 61 · MEX-ENG", Doto) with flag blocks; and — per the memento law (§10) — an
  **edition line** (`Nº 000120 / 5000`, Doto) in the reserved `footer-left` serial slot,
  mirrored by the fixture caption on the right. Ground = **Poppy** brick-red (was Fizz Pink).
- **Proportions:** `card.aspect`, `card.cornerChips` = 4, `card.footerHeight`; serial per
  `memento.serialSlot.card` + `memento.serialFormat`.
- **Where:** the collectible. Canon `card-front-canonical`, `-roarbars-refined`,
  `card-instrument-sidebar`.

---

## 7 · MOTION (a live mechanical print, not a broadcast)

Stepped movement · register snaps · dot-field changes · contained band refreshes. **No
smears, no glow, no blur, no camera swoops, no rolling numbers.** Cartoon timing:
anticipation → snap → tiny settle. **Every consumer gates on `prefers-reduced-motion`** — when
reduced, show the settled end-state with no transition. (`MOTION_MS`, `EASING`, `STEPS` in
theme.ts; brand-book Motion p.8.)

| Motion | What happens | Duration · easing · steps |
|---|---|---|
| **halftone breathing** (idle) | dots appear/disappear at territory edges; edge steady. Motion is dots blinking in/out, **not** a soft gradient expansion. | `breathe` 2600ms · `breathe` ease |
| **territory advance** | on an odds tick the edge **snaps** then **settles** — steps, not a smear. | `territorySnap` 90ms `snap` → `territorySettle` 420ms `settle` |
| **roar-ring pulse** | a ring births at the off-center source and steps outward in discrete states, then resets. Period tracks cheer rate. | `roarPulse` 900ms · `EASING.step` · `STEPS.roarRing` 4 |
| **scoreboard flip** | dot-matrix columns print then snap into register; one flicker. | `scoreFlip` 260ms · `EASING.step` · `STEPS.scoreColumns` 6 |
| **starburst eruption** | frame-stepped: rays punch out → shockwave rings expand → GOOOL prints → one-frame misregistration smear (**never a blur**). | `starburst` 640ms · `EASING.step` · `STEPS.starburst` 6 |
| **stub PROVED punch** | the punch lands like an ink stamp: scale-down + tiny rotate + settle, dot-matrix impact. | `punch` 300ms · `snap` |
| **pop-ball step-spin** | rotates in 5 or 10 **hard** increments with a tiny Press-Black misregistration wobble. | `popBallStep` 120ms/step · `EASING.step` · `STEPS.popBall` 10 |
| **counter tick** | rooted counts change modestly by 1–5, then settle. **No wild rolling numbers.** | `counterTick` 340ms · `settle` |

**Two frame moods:** *armed* (Frame 1 — tension via calibration, counter ticks, breathing; not
explosive) and *erupt* (Frame 3 — the one diagonal event block erupts; starburst + roar-rings +
field snap outward in a printed misregistration smear).

---

## 8 · BANNED (the diseases — violations don't ship)

Encoded in `BANNED` in theme.ts so review can cite the exact token.

- **True-hexagon soccer balls.** The ONLY ball is the **5-segment pinwheel pop-ball**. A
  hexagon/pentagon leather ball is the single most common failure — banned.
- **Speed-streaks / motion-blur.** Motion is **stepped / snap / squash**, never a smear.
- **Glow · gradient mesh · drop-shadow blur · glassmorphism.** This world is FLAT SPOT INK.
  Depth comes from keylines + cream borders, not blur. (Don't smuggle the old night-glow back
  in as a gradient.)
- **Fake distress** — sepia, scratches, torn/burnt paper, coffee rings, faux-vintage filters.
  Texture is clean press language only (§5).
- **Sticker-bomb ornament** — random overlapping stickers at jaunty angles. Everything is
  gridded and calm-framed; **every rail cell must carry a JOB.**
- **Trophy / silverware imagery in match frames.** (AGENTS.md §4.)
- **Player faces / likenesses.** The portrait is DATA (§6.3), never a face.
- **Club crests / FIFA marks.** Identity is flag-BLOCKS and color-pairs, never a coat of arms.
- **Two loud grounds touching** — always separate with a Press-Black seam or a cream border.
- **A probability in a display face** — numbers print in Doto (§4).
- **A crowd count dressed as a percentage** — market number ≠ crowd counts, never blended (§3).
- **Zigzag teeth as a belief edge or draw band** — *teeth are dead.* The draw is a DOT-FRAY
  collapse (§3, §6.4); the only legal tooth is the stub's physical perforation (§6.13).
- **Blended fray inks** — two colours' stray dots interleave as DISCRETE dots; never mix them
  into a muddy overlap. On collision the leading field wins (§3 fray spec).
- **Fizz Pink as a surface ground** — it is accent-only (eruption punctuation). If a surface
  wants heat, Poppy is the ground and Fizz Pink is the punch (§1).
- **Dangling UI on a paused stage frame** — a stopped moment must compose as an ownable print:
  grounded, framed, captioned, edition-marked (§10). No half-laid-out chrome floating.

---

## 9 · THE JUDGMENT CALLS (where sources disagreed — how this file resolved them)

1. **50% seam vs THE DRAW band.** POP-LANGUAGE §F offered these as *alternatives* (a thin
   seam OR a neutral width band). The coordinator laws and the canon
   (`stage-prematch-pct-chips-donor`) resolve it as **both, layered**: a **constant thin
   Press-Black seam at exactly 50%** is the honest halfway (never moves), and **THE DRAW is a
   WIDTH = pDraw**, with the seam riding *inside* it. In the revision the draw's edges are no
   longer teeth — the width is defined by the **dot-fray collapse** (the band where both
   fields' dot densities bottom out). Two truths, two distinct readings. Encoded:
   `GEOMETRY.halfwaySeam` + `GEOMETRY.drawBandCentered` + `FRAY`.

2. **The territory working-edge treatment — TEETH ARE DEAD.** The canon showed three edge
   languages — dot-dissolve/fray (`stage-dark-crowd-canon`), zigzag teeth
   (`stage-prematch-canonical`), and a crowd-silhouette (`stage-goool-crowd-silhouette-edge`).
   The owner dislikes the zigzag teeth, so they are **retired from every belief context**. The
   resolution now: the **DOT-FRAY is the DEFAULT territory edge AND the draw grammar** (§6.1,
   §6.4) — the belief frontier is a scatter-collapse of dots, and THE DRAW is the width where
   that collapse bottoms out; the **crowd-silhouette is a named variant** (§6.2). **The ONLY
   surviving tooth in the entire system is the stub's perforated tear edge** (§6.13) — real
   ticket anatomy, pending owner veto. So a tooth now means exactly one thing, "a physical
   ticket perforation," and *never* a belief edge or a draw band. One shape, one meaning.

3. **Doto vs the drawn face for numbers.** The brand book says "Doto = ALL data/numbers," but
   `card-front-canonical` renders the tricodes MEX/ENG in a drawn face and only the corner
   numbers in Doto. Resolved by the **data-vs-design rule** (§4): **Doto for every *measured*
   value** (score, clock, %, counts, serials, minute) and **Anybody for every *shouted* label**
   (tricodes, THE STANDS, GOOOL, chip captions). A tricode is a name, not a datum → Anybody;
   the score is a datum → Doto. This keeps the brand-book law intact while matching the canon.

---

## 10 · EVERY SURFACE IS A MEMENTO (a first-class law)

*"Lean more into the Panini world — not in obvious ways… you should want to collect
everything you see as a poster, a card, or some other type of memento."* This is not a
component; it is a **frame law** that sits beside the honesty law. If a surface can be paused,
it must read as an **ownable print** — something you'd pin up, slip in an album, or trade.

**(a) FRAME ANATOMY — every composed surface carries print anatomy.**
Every stage state, verdict, card, stub, and shareable wears the same three print marks:
- a **keyline + cream border** (§2 — already mandatory; here it is also the "this is a printed
  object" signal, not just a container);
- a **caption / footer strip** — *fixture · date · frame name* in the printer voice (Doto),
  hung on a band along the bottom (never floating);
- a **small serial / edition line** — `Nº 000120 / 5000` — in the printer voice (Doto), in the
  surface's reserved serial slot. It is the "this one is *yours*, and there are only so many"
  mark. (`COMPONENTS.memento` — `footerHeight`, `serialTextScale`, `serialFormat`.)

**(b) POSTER-READY RULE — a paused stage frame composes as an ownable print.**
Any stage moment that can hold still (pre-match, a verdict beat, a paused goal) must compose
**grounded, framed, and captioned, with no dangling UI** — no half-laid-out chrome, no
controls stranded on the ground, nothing that only makes sense mid-interaction. Live controls
either sit inside their own keylined cells or drop away when the frame is "posed." The test:
screenshot it, and it should look like a poster you'd hang — not an app mid-gesture. (Encoded
as the banned item `dangling-ui-on-a-poster-frame`.)

**(c) MECHANISM HOOKS — reserve placements so collection mechanics slot in later.**
So album / got-need / edition mechanics can arrive **without a redesign**, every surface has a
**fixed, reserved home** for its edition/serial/collection marks (`memento.serialSlot`):
- **card** → `footer-left` (serial), fixture caption mirrored right;
- **stub** → `punch-tab-repeat` (serial top + bottom on the gold PROVED tab — real ticket
  lineage);
- **poster / shareable** → `caption-left` (edition), fixture caption right.

These slots are load-bearing: build lanes place the serial there **now** (even if it reads a
placeholder edition), so when "Nº 47 of your 100" or a got/need album view ships, the mark is
already in its home. The edition line always prints in **Doto** (the printer's voice, §4) —
never a display face, never a serif.

---

## 11 · CHANGELOG — the subdue-toward-Lichtenstein revision

**Palette (louds pulled ~10–18% toward ink — benday, not neon; Fizz Pink demoted to accent):**

| Token | Old hex | New hex | Note |
|---|---|---|---|
| `poppy` | `#E0574E` | `#C8504D` | **promoted** — Lichtenstein brick-red; now card + GOOOL ground + lead loud |
| `kickoffSky` | `#3FA0D6` | `#3E8CBC` | **promoted** — process blue; lead loud |
| `fizzPink` | `#E8256C` | `#C52C67` | **demoted to ACCENT** — eruption punch only, never a ground |
| `aztecaSun` | `#F2C230` | `#E5B431` | print-yellow, barely inked (yellow muddies fast) |
| `grass` | `#1E7A44` | `#1F6F40` | benday green, inked |
| `ultra` | `#1E4FC0` | `#2049AA` | deep process blue, inked |
| `magenta` | `#C43A72` | `#AC3A6B` | strip pink, inked toward brick |
| `medalGold` | `#E0A93B` | `#D6A33B` | RARE mark — barely touched, still a printed spot |
| `newsprint`/`sunbleach`/`pressBlack`/`terraceGrey` | — | *unchanged* | the paper + ink were already right |

**Ground-role reassignments:** card ground `fizzPink`→`poppy`; GOOOL/erupt ground
`fizzPink`→`poppy` (Fizz Pink now the eruption *accent*); demo-fixture ground
`fizzPink`→`kickoffSky` (Poppy is now England's territory, so the demo ground moved to the
other lead). `LOUD_ROTATION` reordered leads-first and `fizzPink` removed from it.

**Draw grammar:** zigzag teeth **retired** from the draw band, %-chips, rails, and motion
demos. Replaced by the **dot-fray** (new `FRAY` token block; §3, §6.4). The Press-Black 50%
seam survives unchanged. The **stub perforation is the sole surviving legal tooth** (§6.13,
pending owner veto).

**New law:** §10 *Every surface is a memento* — frame anatomy (keyline · caption strip ·
serial/edition line), the poster-ready rule, and reserved mechanism hooks
(`COMPONENTS.memento`). New banned items: `zigzag-teeth-as-belief-edge`, `blended-fray-inks`,
`fizz-pink-as-ground`, `dangling-ui-on-a-poster-frame`.

---

*Sources: the 14 canon renders in `design/references/_chosen/` (viewed directly);
`design/POP-LANGUAGE.md`; `ROOOT_Brand_Book.pdf` pp. 4/7/8/9 (color-role · glyph · motion ·
frame tables); `apps/web/public/type-lab.html` (the exact Google Fonts axes). The tokens are
`apps/web/src/lib/theme.ts`; the specimen page is `apps/web/public/system.html`.*
