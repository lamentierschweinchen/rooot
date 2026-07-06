# MOTION NOTES — Loom & Split-Flap Choreography Study

Research notes for calibrating the ROOOT live-loom canvas animation (one row per minute,
intra-minute ticks) and any split-flap number/label elements. Written 2026-07-04.

**Honesty key** — every number below is tagged:
- `[cited]` — stated in a source linked at the bottom of its section
- `[derived]` — arithmetic on cited numbers (the math is shown)
- `[est]` — my estimate, from the geometry of the mechanism or from what these
  reference videos visibly show; treat as calibration starting points, not gospel

---

## 1. The weaving cycle — one pick, 360°

Everything on a power loom hangs off one crankshaft. **One pick (one row of cloth) =
one full 360° revolution.** All phase timings in the textile literature are given as
crank angles, which is a gift for animation work: the whole cycle is a single master
timeline from 0° to 360°, and every sub-motion is a windowed segment of it.

Reference frame `[cited]`: **0° = reed at its most-forward position = the beat-up
instant.** 180° = reed at its farthest back. The cycle is conventionally read
beat-up → shed change → insertion → beat-up.

### Phase map (classic cotton loom timing diagram) `[cited]`

| Crank angle | Event |
|---|---|
| 0° | **Beat-up.** Reed strikes the fell of the cloth, presses the new pick in. The loudest, hardest event of the cycle. |
| ~30°–150° | **Heald shafts move** — shed changes over (one harness group rises, the other falls). |
| ~110° | Shuttle **enters** the shed (shed nearly full open). |
| ~110°–240° | **Shed dwell** — heald shafts stationary at full open while the weft crosses. |
| 180° | Reed/sley at back dead center (maximum clearance for insertion). |
| ~230°–240° | Shuttle **exits** the shed. |
| ~270° | Heald shafts level ("normal shedding" — shed closed/crossing; early shedding = level at ~265°, late = ~275°). |
| 270°–360° | Shed closes over the new pick; sley accelerates forward toward the fell. |
| 360°/0° | Beat-up again. |

Two corroborating figures `[cited]`: cam (tappet) shedding is designed with a **dwell
of one-third of a pick (~120°)**, and a general figure for high-speed looms puts the
full-open dwell at roughly **110°–240° of the cycle** at 500–800 picks/min. So as a
design ratio: **~⅓ of the cycle is shed-change, ~⅓ is open-shed dwell/insertion, and
the beat-up stroke rides the final approach** — with the actual impact occupying only
the last few degrees.

### What moves, and how fast — snappy vs dwell

- **Shed (heddles/harnesses)**: a smooth, cam-eased scissor. Two sheets of warp
  threads cross each other — top sheet dives, bottom sheet rises — forming a
  triangular tunnel. It moves deliberately (it occupies ~120° of the cycle) and then
  **holds dead still** during the dwell. Visually: a slow open, a long hold, a slow
  close. This is the *breathing* of the loom.
- **Weft insertion (the pick)**: the fastest visible object. On a rapier loom, the
  rapier head darts in from one side, meets the opposing rapier at mid-width, hands
  the yarn over, and both retract (double-rapier handoff at center — visible as a
  brief meeting point `[cited]`, Textile Learner rapier article). On air-jet there is
  no carrier at all — the yarn itself is blown across as a hairline blur.
  Weft insertion rates `[cited]`: flexible rapier up to ~1,300–1,500 m of weft/min,
  air-jet 2,000–2,500 m/min. `[derived]`: for a 2 m wide loom at 600 picks/min
  (100 ms/pick) with insertion windowed to ~40% of the cycle, the yarn crosses 2 m in
  ~40 ms ⇒ average ~50 m/s. It reads as a horizontal streak, not a traveling object.
- **Beat-up (reed/sley)**: the sley is crank-driven, so its motion is roughly
  sinusoidal — it *accelerates all the way into the cloth* and reverses instantly at
  0°. There is no ease-out into contact; the reed arrives at (near) maximum
  velocity, and the yarn stops it. `[derived]`: at 600 picks/min the whole cycle is
  100 ms, so the final approach-and-strike (last ~40–50° of crank) is **~11–14 ms**.
  Even on a slow 150 picks/min shuttle loom (400 ms/pick) the strike window is only
  ~45–55 ms. **Beat-up is an impact, not a movement.**
- **Cloth advance (take-up)**: continuous and nearly invisible. `[derived]`: cloth
  advances exactly 1/(picks-per-inch) per cycle — at 20 ppi that is **1.27 mm per
  pick**; at a fine 60 ppi jacquard, 0.42 mm. You never see the cloth *move*; you see
  it *accumulate*. (One sley-setting note `[cited]`: the reed's sweep spans roughly
  80 mm between fell and its rearmost useful position on a cotton loom — the reed
  travels a long way to deliver a sub-millimeter result.)

### The "row appearing" moment, at cloth level

Watch any close-up (videos below) and the legible sequence at the fell of the cloth —
the horizontal frontier line where woven cloth ends and loose warp begins — is:

1. Shed opens; the last pick sits loose, a slightly wavy line ~a reed-sweep behind the fell.
2. A streak crosses (the new pick). It lies in the open triangle, visibly loose,
   with slack/waviness in it.
3. The shed begins to close over it (the yarn is being trapped but is still proud of
   the cloth).
4. **Snap** — the reed sweeps forward and the loose yarn becomes *cloth*: it
   straightens, seats against the fell, the weave pattern absorbs it, and the fell
   line steps down by one pick-height. The pattern row literally does not exist until
   this instant; beat-up is the commit.
5. Reed retreats; dwell; repeat.

Also visible on real machines: the **whole fell trembles** at beat-up (the impact
shakes the cloth), and on jacquard-figured cloth the new row arrives *already
patterned* — the design grows one scanline at a time.

### Cycle rates (how fast real machines run) `[cited]`

| Machine | Picks/min | Time per row `[derived]` |
|---|---|---|
| Handloom (no fly shuttle) | up to ~60 | ≥ 1 s |
| Conventional shuttle power loom | 110–225 (avg ~150) | 270–550 ms |
| Modern shuttle / fly-shuttle looms | 300–400 | 150–200 ms |
| Rapier (rigid/flexible) | ~475–700 | 85–125 ms |
| Air-jet | up to 1,100–1,200 | ~50–55 ms |

**A slowed, human-legible cycle**: the natural reference is the handweaver — roughly
one pick per 1–4 seconds, where every phase reads clearly (throw… beat… beat again —
handweavers often beat twice). Museum demonstrations of Victorian machinery run their
looms slow, ~1–2 picks/sec, and that is about the fastest speed at which the phases
remain individually legible `[est, from the museum videos below]`. Below ~0.5 s/pick
the shed and pick fuse into texture and only the beat-up reads.

### How the jacquard head selects threads

Mechanism `[cited]` (Firgelli mechanism explainer, ITU lecture notes, Paradise Mill video):

- Every individual warp end hangs from its own **harness cord**, which runs up
  through the **comber board** to a **hook** inside the jacquard head above the loom.
  No harness frames — each thread is independently addressable.
- A horizontal **needle** rests against each hook. Once per pick, the **card
  cylinder** — a square-section drum carrying the chain of punch cards — presses a
  card against the needle board. **Hole = needle passes through = its hook stays
  above the knife = that thread is LIFTED. No hole = needle pushed back = hook
  displaced off the knife = thread stays DOWN.** One card = one pick = one row of the
  pattern. Binary, row by row.
- The **griffe** (frame of knives) rises once per pick, carrying every selected hook —
  this IS the shed-opening for a jacquard loom.
- Between picks the cylinder swings away, **quarter-turns with a loud indexed clack**
  to present the next card, and swings back. The card chain visibly crawls over the
  head, one card per row — the program advancing in step with the cloth.
- Electronic jacquards replace card+needle with a **solenoid per hook** (selection
  becomes silent and instant, re-decided every pick at machine rate) `[cited]`.
- Selection happens while the shed is closed/crossing (around beat-up); the lift
  happens during the opening third of the next cycle. So the head's rhythm is:
  *clack (card) … rise … dwell … fall*, phase-locked one step ahead of the cloth.

### Videos — looms (verified titles/URLs; not downloaded)

1. **"Jacquard Weaving in Slow Motion"** — Textile Sphere.
   https://www.youtube.com/watch?v=eGuar4gj2-8
   Slow-motion of a modern jacquard: individual heddle lifts, rapier streak, reed strike.
2. **"Paradise Mill How The Jacquard Mechanism Works"** — Macclesfield Museums.
   https://www.youtube.com/watch?v=x_ijmjx7Xys
   Head mechanism up close on 19th-c. silk handlooms: cards, cylinder, needles, hooks, harness.
3. **"A Jacquard loom in action"** — National Museums Scotland.
   https://www.youtube.com/watch?v=OlJns3fPItE
   Full machine running at demonstration speed; card chain advancing in rhythm.
4. **"Binary and the Jacquard Mechanism - demonstration"** — Macclesfield Museums.
   https://www.youtube.com/watch?v=pzYucg3Tmho
   The hole/no-hole = lift/stay logic demonstrated slowly — the selection tick in isolation.
5. **"How an 1803 Jacquard Loom Led to Computer Technology"** — The Henry Ford.
   https://www.youtube.com/watch?v=MQzpLLhN0fY
   Curatorial walkthrough; good fell-of-cloth close-ups and card-chain shots.

---

## 2. Split-flap (Solari) displays

### Mechanism `[cited]`

- Each character module is a **drum (spool) of hinged flaps** — typically up to **40
  per module** (letters, digits, punctuation, blank). Each flap carries the *bottom
  half* of one character on its front and the *top half* of the next character on its
  back. The displayed character is always two half-flaps: one hanging, one resting.
- A motor (classic boards: AC synchronous, e.g. 48 VAC on Solari-family units; DIY
  builds: geared steppers) rotates the drum **in one direction only**. A retaining
  pin/stop holds the top stack; as the drum turns, the leading flap is carried past
  the release point and **falls under gravity**, slapping onto the stack below —
  that slap is the *clack*.
- **No shortcuts**: to go from R to C the module must flip through S, T, U … B first.
  Distance-to-target = number of flaps to traverse. This asymmetry (some characters
  arrive fast, some need most of a revolution) is a signature of the medium.
- An **optical encoder / once-per-revolution sensor** tells the controller which flap
  is showing; the module stops when the target flap has just dropped `[cited]`
  (Hackaday Solari teardown; scottbez1 uses a home sensor + step counting).
- **Zero power at rest** — the board is completely inert and silent between updates
  `[cited]`. All motion is update-triggered. "A predecessor of ePaper."

### Timing & cadence

- **Flap drop cadence** `[est]`: real boards visibly run on the order of **10–20
  flaps/second per module** while spinning (Frankfurt-style airport modules read as a
  fast purr, individual clacks just barely resolvable). That puts a single flap drop
  at **~50–100 ms**, and a worst-case full-drum traversal (~40 flaps) at **~2–4 s** —
  which matches how long a single module visibly churns before settling in the videos
  below. Small/modern decorative boards run slower, ~5–10 flaps/s.
- **The drop itself is two-phase** `[est, from mechanism geometry]`: the flap is
  *carried upward at constant drum speed* until it passes the release point, then
  *free-falls* through the remaining arc — accelerating — and stops dead against the
  stack. Constant-velocity rise, gravity-accelerated fall, hard stop. Never
  symmetric, never eased-out.
- **Settle**: the final flap lands with at most **one tiny rebound** — a light
  plastic leaf hitting a stop, damped almost immediately (`[est]` single bounce,
  ~10–20% overshoot of the resting angle, dead in ≤50 ms). Multi-bounce springiness
  reads as wrong/cartoonish. Alignment pins square the stack `[cited]`.
- **Cascade behavior when many characters change** `[cited + est]`: on classic
  boards, **all changed modules start spinning at (near) the same moment, and each
  stops independently** when it reaches its target. The choreography is therefore:
  a wall of clatter that erupts at once, then *decays raggedly* — modules with short
  distances fall silent early, stragglers churn on alone, then silence. Rows of a
  schedule board often update as *blocks* (row-by-row, as trains shift up a line),
  giving a top-to-bottom wave at board scale; within a row the modules are
  simultaneous-start / staggered-stop. Digital recreations usually add a small
  left-to-right start-stagger for legibility (see below).
- **Sound rhythm**: one click per flap drop, so sound density = number of modules
  spinning × flaps/sec. Attack (all modules) → long ragged decay (stragglers) →
  silence. The MBTA literally kept a *synthesized* flap sound after removing the
  boards, because the sound itself is the "update!" cue `[cited]`.

### Recreation constants worth stealing `[cited]`

- **hardikpandya/solari-split-flap** ("physically accurate," single-file JS):
  **150 ms per flap flip**, **50 ms stagger between adjacent cells** (left→right,
  top→bottom), drum spins forward only through the full character sequence, 4-layer
  half-flap DOM with backface culling, one filtered-noise click per flip.
  https://github.com/hardikpandya/solari-split-flap
- **hello-mat split-flap component**: default **800 ms per flip** with
  `cubic-bezier(.215,.61,.355,1)` — note this is a *soft, decorative* single-flip
  aesthetic (ease-out), not the mechanical free-fall profile; useful as the "one
  slow luxurious flip" end of the dial. https://hello-mat.com/design-engineering/component/split-flap-display
- **scottbez1/splitflap** (canonical DIY hardware): 40 characters/module, 28BYJ-48
  geared stepper (~2038–2048 steps/rev) — i.e., real DIY modules are step-driven
  with home-sensor calibration. https://github.com/scottbez1/splitflap

### Videos — split-flap (verified titles/URLs; not downloaded)

1. **"The wonderful split-flap Departure Board at Frankfurt Airport"** — Aileron Aviation Films.
   https://www.youtube.com/watch?v=cj32w5z81Ak
   A huge classic Solari-type board mid-update: simultaneous start, ragged stop, full sound field.
2. **"Split Flap Display by Oat Foundry | Old School Departures Boards"** — Oat Foundry.
   https://www.youtube.com/watch?v=F8wx-h_sfR0
   Modern manufactured modules, clean close-ups of flap drop and settle.
3. **"Relaxing Split Flap ASMR - Animation Showcase (20+ Nostalgic Motions)"** — Oat Foundry.
   https://www.youtube.com/watch?v=4idltSNufRo
   A catalog of update choreographies (wipes, waves, random dissolves) on real hardware — directly minable as a pattern library for board-scale transitions.

---

## 3. Choreography implications for the ROOOT live loom

The single most important thing both machines teach: **dwell dominates; the event is
violent and brief.** A real loom at 600 picks/min spends ~⅓ of its cycle holding a
shed open and ~3–14 ms actually striking cloth. A split-flap board is inert 99% of
its life. Do not smear motion across the minute. Hold stillness, then spend it all at
once.

### 3.1 One row per minute — phase decomposition

Duty-cycle principle `[derived from the loom's own ratios]`: on a real loom the
beat-up impact is ~5–10% of the cycle and the total *perceptible motion* maybe 60%.
At one row/minute, compressing all motion into **~2–3 s of a 60 s cycle (3–5% duty)**
keeps the loom's felt character: a patient machine that strikes.

Suggested master timeline for "a row being woven" (all times ms; total motion ≈ 2.4 s):

| # | Phase | Duration | Motion profile | Loom analog |
|---|---|---|---|---|
| 1 | **Selection tick** (jacquard clack) | 120–200 ms | Stepped/indexed — heddle markers snap to up/down states in 2–3 discrete sub-steps, no easing. Optionally the "card" (block hash / row program) advances one notch. | Card cylinder quarter-turn + needle read |
| 2 | **Shed open** | 400–600 ms | Ease-in-out (cam-like, sinusoidal), two sheets crossing in opposite directions; ends dead still. | Healds moving, 30°–150° |
| 3 | **Open-shed dwell** | the remainder of the minute (~56 s) | Nothing moves structurally. Intra-minute ticks (txs/events) accumulate visibly *in the open shed* as weft-in-waiting. The shed being open = "row is recording." | Dwell 110°–240°, stretched |
| 4 | **Pick traverse** | **80–150 ms** | Near-linear streak L→R; optional 2-frame handoff pause at center (double-rapier detail) then continue. Slight decel only in the last 10%. | Rapier crossing at ~50 m/s |
| 5 | **Shed close** | 250–350 ms | Ease-in-out, faster than the open (the cycle is committing). | 240°–330° |
| 6 | **Beat-up** | **40–60 ms** | HARD SNAP. Reed line accelerates in (ease-in or linear, never ease-out), the loose pick jumps to the fell, stops dead. 1 frame of 1–2 px overshoot/compression of the fell line, then rest. Entire cloth may shudder 1 px for 1–2 frames. | 330°–360°, impact at 0° |
| 7 | **Cloth advance** | 200–400 ms | Slow settle: fabric steps down exactly one row-height (stepped is more legible than the real loom's continuous creep). New row is now *cloth*. | Take-up, 1/ppi per pick |

Phases 4–7 run back-to-back as one gesture (~0.6–1.0 s total) at the minute boundary.
Phases 1–2 immediately follow, opening the next row's shed. The felt rhythm each
minute: **…long stillness … streak-SNAP-settle … clack … breathe open … stillness…**

Ratio guide (borrowed from crank angles, works at any tempo you compress to):
**shed-change : dwell : insertion : beat-up ≈ 33 : 55 : 8 : 4** of *motion* time —
then stretch the dwell arbitrarily; stretch nothing else.

### 3.2 What must NEVER ease smoothly

- **Beat-up.** It is an impact. Linear-or-accelerating approach, instantaneous stop.
  An eased beat-up destroys the entire mechanical fiction — this is the one frame
  where the design commits, and softness reads as fake. If anything, ease *in*
  (accelerate toward the cloth) exactly like the crank does.
- **Flap drops.** Constant-rate rise → gravity fall → hard stop → ≤1 micro-bounce.
  Never symmetric ease-in-out, never elastic/multi-bounce.
- **The selection/card tick.** Indexed machinery: it steps, it does not glide.
  Detents, not tweens.
- **The pick traverse** should not ease-in from zero — the rapier is already at speed
  when it enters frame. Enter fast, exit with only terminal decel.

### 3.3 What dwells

- The **open shed** (the whole live minute). Stillness = recording.
- The **fell line** between beats — completely static; it is the datum everything
  else measures against. Never idle-animate it.
- The **board/loom at rest**: like a Solari board, zero motion between events. No
  ambient wobble, no breathing gradients on the machine itself. Silence is what
  makes the clack loud.

### 3.4 Split-flap borrowings for numbers/labels in the UI

- Per-flap flip: **80–120 ms** at "machine speed" (real-board feel) or 150 ms
  (hardikpandya's legible recreation constant). Cascade start-stagger between
  adjacent characters: **30–60 ms**.
- Always pass through intermediate characters — distance = flips. Let modules **stop
  raggedly** (each when it arrives); never synchronize the stops.
- Settle: one 10–20% overshoot rebound, dead within ~50 ms.
- Board-scale updates: erupt together, decay raggedly, then hard silence — a good
  model for the minute-boundary "many things update at once" moment.

### 3.5 Goal patch — embroidery/tufting motion instead of weaving

A patch is *applied to* finished cloth, not woven into it — so its motion grammar is
different: a **point-process** (discrete stitches along a path), not a line-process
(picks across a width).

Rates `[cited]`: machine embroidery typically runs **600–750 stitches/min ≈ 10–12.5
stitches/s** (commercial range 400–1,200+ spm); tufting guns run **~7–27 stitches/s**
(some 5–45). So a mechanically-true patch appears at **~10–15 stitches/s, i.e., one
stitch every 65–100 ms** — comfortably legible.

Suggested grammar:

- **Path, not fade**: the patch fills along a *satin/serpentine path* (rows of
  zigzag, like a scanline that snakes), or an outline-then-fill sequence (real
  embroidery digitizing does running-stitch outline → fill). Never a crossfade,
  never a radial wipe.
- **Each stitch = 2-frame event**: needle-point dot appears (1 frame, hard), then the
  short thread segment connecting it to the previous point draws in (≤50 ms). The
  motion is *puncture, puncture, puncture* — a sewing-machine patter, staccato where
  the loom is percussive.
- Numbers: a 200-stitch patch at 12 st/s ≈ **17 s** to sew — a nice mid-scale event
  (bigger than a row-beat, smaller than a minute). Scale stitch count to patch size;
  keep the *rate* fixed so all patches sew at the same machine speed.
- Optional flourishes: a brief **hoop-jump** pause (~150–250 ms) when the path jumps
  between disconnected regions (real machines pause to trim/jump), and a final
  **tie-off**: 2–3 rapid stitches in place, then stop dead.
- Tufting variant (chunkier, for big celebratory patches): loops appear in straight
  runs at ~15–25 loops/s with slight row-by-row overshoot — reads as *drawing with a
  fat marker that vibrates*.

### 3.6 Sound (if ever)

One clack per beat-up, nothing else, is already a complete sound design. The loom
sound is *impact + immediate silence*; the split-flap sound is *many small impacts
decaying raggedly*; the embroidery sound is *rapid soft patter*. All three are
percussion — no drones, no whooshes. (Filtered noise burst per event is exactly how
the hardikpandya recreation does it.)

---

## Source list

**Loom cycle & timing**
- Loom Timing of Weaving Machine (cotton) — timing diagram degrees: https://textile04.blogspot.com/2019/05/loom-timing-of-weaving-machine-cotton.html
- Basic Concept on Loom Timing Cycle — Textile Learner: https://textilelearner.net/basic-concept-on-loom-timing-cycle/
- Timing of Shedding (early/normal/late) — Textile Coach: https://www.textilecoach.net/post/timing-of-shedding-early-shedding-late-shedding-normal-shedding
- Shedding Mechanism overview (dwell ~110°–240°, 500–800 ppm) — ScienceDirect topic page: https://www.sciencedirect.com/topics/engineering/shedding-mechanism
- Air-jet vs rapier speeds: https://textileinfohub.com/air-jet-vs-rapier-looms-guide/ and https://www.waterjetloom.com/How-Air-Jet-Looms-Are-Redefining-Speed-And-Precision-in-Modern-Weaving-id45697306.html
- Shuttle vs shuttleless rates (110–225 ppm shuttle; handloom ~60 ppm): https://texnoteblog.wordpress.com/2013/09/03/different-types-of-loom-conventional-loom-versus-modern-loom/ and https://www.heddels.com/2014/10/shuttle-vs-projectile-looms-whats-the-difference/
- Rapier types & weft insertion (double-rapier handoff, WIR up to ~1,500 m/min): https://textilelearner.net/rapier-loom-types-weft-insertion/
- Weft insertion rates across systems — ITU lecture notes: https://web.itu.edu.tr/~berkalpo/Weaving_Lecture/Weaving_Chapter2b_3_production.pdf

**Jacquard head**
- Loom Jacquard Mechanism (hooks/knives/needles/cards): https://www.firgelliauto.com/blogs/mechanisms/loom-jacquard-mechanism
- Jacquard Design working principle — Textile Learner: https://textilelearner.net/jacquard-design-working-principle-types-construction/
- JACQUARD MECHANISMS — ITU lecture PDF: https://web.itu.edu.tr/~berkalpo/Weaving_Lecture/Weaving_Chapter4c_Jacquard.pdf
- Electronic jacquard (solenoid selection): https://www.weavetech.com/all-you-need-to-know-about-electronic-jacquard-machine/

**Split-flap**
- Split-flap display — Wikipedia: https://en.wikipedia.org/wiki/Split-flap_display
- Solari board history & mechanism — Oat Foundry: https://www.oatfoundry.com/blog/solari-board-rich-history/
- Reverse Engineering Solari Soft Flap Displays — Hackaday (encoder, sync motors, zero-power-at-rest): https://hackaday.com/2012/10/17/reverse-engineering-solari-soft-flap-displays/
- scottbez1/splitflap (40 flaps, stepper drive, home sensor): https://github.com/scottbez1/splitflap
- jpwolfe31/Solari-Split-Flaps (vintage airport module docs): https://github.com/jpwolfe31/Solari-Split-Flaps
- hardikpandya/solari-split-flap (150 ms flip, 50 ms cascade): https://github.com/hardikpandya/solari-split-flap
- hello-mat split-flap component (800 ms, cubic-bezier(.215,.61,.355,1)): https://hello-mat.com/design-engineering/component/split-flap-display

**Embroidery / tufting rates**
- Embroidery machine speed guide (600–800 spm typical; 400–1,200+ commercial): https://www.bycurated.com/how-machine-speed-affects-your-embroidery-results/ and https://www.cre8iveskill.com/blog/embroidery-machine-speed-guide-for-quality-embroidery-design
- Tufting gun speeds (7–27 st/s; 5–45 st/s ranges): https://www.vevor.com/tufting-gun-c_11979/vevor-electric-carpet-tufting-machine-weaving-flocking-kit-speed-adjustable-p_010191322260 and https://www.tukloom.com/blogs/tukloom-blog/tufting-gun-comparison-guide

**Videos** (all verified live via YouTube oEmbed on 2026-07-04; none downloaded) — listed inline in sections 1 and 2.
