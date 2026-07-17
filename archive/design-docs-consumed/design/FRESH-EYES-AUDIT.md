# FRESH EYES — full walk of ROOOT in demo mode, 2026-07-10

*A new design instance walked every surface top-to-bottom as a first-time user handed a phone:
every screen at load, minute ~32, minute ~60, and full time; the full gate flow (three ways); every
stadium card; the dial; a live pulse moment; the cabinet full and empty; every seam between surfaces.
All screenshots are mine, taken at 390×844, in `design/audit-2026-07-10/` (console logs in `logs/` —
clean on every surface). Where the prior builder's notes disagreed with the product, I trusted the
product. File:line references are to `apps/web/public/`.*

**How to read the ranks:** **BLOCKER** = breaks a law, a promise, or the journey · **SIGNIFICANT** =
a first-timer misreads or a core beat under-delivers · **POLISH** = craft.

---

## 0 · VERDICT — the five things that matter

1. **The journey's spine is broken at both ends, and the demo can't show the product's best
   moments.** Your side doesn't carry from the door to the ground (pick COL, get seated in the SUI
   end). At full time nothing points you to your cabinet, "KEEP IT" keeps nothing, and the scarf you
   do open is the wrong match, still weaving, labeled **LIVE**. And the flagship demo replay ends
   **0–0** — the GOOOL eruption, the goal-mouth ball, the loom's golden PRESSING **never fire in the
   walkthrough at all**. A judge walks door → match → full time and never sees a goal, never sees the
   seal, and never finds their keepsake. The world is seven beautiful rooms and no hallway.

2. **The no-legend law is violated by the product's own flagship surfaces.** The loom ships a
   permanent 12-item legend panel; the stadium hides its captions but keeps the icon rings, raw
   counts, a "1X2" chip and an instruction bar. Canon says *"no fan needs a legend"* — today the fan
   needs three.

3. **Honesty leaks in the honest mode.** The loom masthead reads **LIVE** during a baked replay (the
   terrace on the same screen says REPLAY). The pulse reveal prints **hardcoded fake counts** ("you +
   6,730 / 9,900 of their end"). The keepsake extrapolates a full cloth from 13 minutes of data. The
   terrace keepsake says "WOVEN FROM REAL COUNTS" above a purely decorative tifo. Rooting doesn't
   move the counter. Each alone is small; together they put fabrication inside the layers the laws
   call honest.

4. **The crowd-vs-market theatre — the product's proprietary insight — is buried in unlabeled
   decimals.** "SUI 0.6 – 0.5 COL" directly under the real score reads as a second, broken
   scoreline; "vs market SUI 27·34·39" has no units; no sample size anywhere (a named post-mortem
   blocker). The one thing no one else has (heart vs market, +45.7pt in the FRA–MAR live test) is the
   least legible thing on the terrace.

5. **The craft is real.** The loom cloth at minute 64 is a poster. The cabinet is the best screen in
   the product. The gate is a charming ticket. The bowl illustration is lovely. Nothing here needs a
   re-skin — it needs the *labels removed, the seams sewn, and the lies fixed*. That's cheaper than
   what's already been built, and it's what stands between "seven good screens" and "one great product."

---

## 1 · WHAT WAS ASKED AND ISN'T THERE — ranked by how basic the miss is

### 1.1 · The owner's named asks

1. **"Kill the symbols and the descriptions; the positions speak" — HALF-DONE, the wrong half.**
   The captions were merely hidden in CSS — `stadium.html:50` `.hot .cap{display:none}` (the comment
   even cites the owner's "show, don't tell") — but every place still hangs a **glyph in a chrome
   ring**: ◑ at the centre, ⇅ at the bench, ◍ at the stands, a whistle PNG at the touchline, a
   literal **"1X2"** chip at the scoreboard, and raw numeric badges ("6", "30") at goal and corner
   (`stadium.html:194-201`). Then a bottom bar instructs: **"TAP A GLOWING PLACE TO GO IN"**
   (`stadium.html:205`) — an instruction bar is a legend by another name, and since every hotspot
   pulses its gold halo forever (`stadium.html:45-46`), *nothing* actually glows specially.
   Evidence: `audit-2026-07-10/first-stadium-b-settled.png`, `tl-stadium-2-min60.png`.
   → See §3.5 for the concrete no-legend direction.

2. **THE CONTROL card is still sub-par — and the possession/territory conflation survives in the
   worst place.** The card (§3.5-CONTROL, `audit-2026-07-10/card-2-control.png`): a washed
   32%-opacity tile field (nothing like the flat-ink language), possession and territory as
   near-identical twin bars, danger counts floating below, half the sheet empty. Worse: the
   **overview pitch split is still fed `possessionPct` first** (`stadium.html:507`) while the code
   comment claims "the pitch shows the territory each side is infringing on" (`stadium.html:377`) —
   exactly the post-mortem blocker ("label possession numerically and territorial pressure
   spatially; do not let one graphic impersonate both"), still open, on the surface's hero.

3. **Post-mortem design blockers — scorecard.** Sample size wherever means appear: **not done**
   (no *n* anywhere; see §4.2). The real moment prompt + split reveal designed around the server's
   feeling tokens: **not done** (demo pulse is a binary GOAL/NO GOAL guess with fabricated counts;
   the six drawn feelings exist only in the scripted specimen no judge should see —
   `terrace.html:259-266` vs `:584-591`). Three-state full-time verdict: **done in the cabinet**
   (`cabinet.html:179` ✓ NAILED IT / ≈ RIGHT CALL / ✗ didn't fall — good) but **not in the terrace
   keepsake**, which is still binary exact-or-not (`terrace.html:453-455`). Honest local cabinet:
   ✓ done (the empty state is real and good).

4. **Pulse v2 ("NOT a guessing game… no correctness scoring") — the killed mechanic is still in the
   codebase and one URL param from the demo.** `terrace.html:291-294` ships a scripted quiz
   ("WHO WINS THE NEXT CORNER?", "WILL HE SCORE THE PEN?") with `correct:` answers, win/lose paint,
   **"+10 XP"** (`terrace.html:419`) — and a **fabricated market quote** ("the market: 76% scored")
   that exists on no wire. It only runs in the parameterless specimen — but the walkthrough's own
   STANDS back-button drops you into exactly that mode (§4.3-3). The owner killed this mechanic;
   it's still wired, still scored, still quoting an invented market.

### 1.2 · Dropped or severed things I found beyond the named list

5. **Your side doesn't carry door → ground.** The gate saves the pass (`gate.html:275`) and the
   ground reads it — then ignores it in demo and hardcodes `root('home')` + "SUI · YOUR END"
   (`ground.html:169-176`). Verified live: picked COL, called 1–2, committed → pass stored
   `side:"a"` → ground seats me at **SUI · YOUR END** (probe in walk log; `gate-06-arrive-ground.png`).
   The fan's one identity-defining act is contradicted ten seconds later.

6. **Full time is a dead end.** Ground at FT: masthead parks at "SUI 0–0 COL · 120′", dial alive, no
   verdict beat, no pull to the cabinet (`ground.html:173-174` has an HT branch but no FULL_TIME).
   Stadium at FT: same, "REPLAY · 120′". The PRODUCT-promised whistle moment ("They won the match.
   We won the stands.") exists nowhere. The only FT artifact is the terrace scarf-card — whose
   **"THE STAND IS YOURS — KEEP IT" button just dismisses the overlay** (`terrace.html:458`;
   nothing written, nothing lands in the cabinet). Evidence: `tl-ground-3-fulltime.png`,
   `tl-terrace-3-fulltime.png`.

7. **The demo replay is a 0–0.** The entire walkthrough (gate copy, showcase, judges' video) rides a
   match with **no goal**: no GOOOL eruption, no goal mark on the cloth, no ball in the goal-mouth
   card, no goal-moment pulse, no chalk-off drama. Confirmed by running the full 150s twice with a
   score-change catcher — it never fired. And the demo cabinet's own SUI–COL sample scarf says
   **1–1 · "you called SUI 2–1"** (`cabinet.html:193`) — the walkthrough contradicts itself about
   its own fixture. Re-bake with a match that has goals (the ARG–CPV 3–2 data already exists in
   `plate/arg-cpv-data.js`), or bake a second demo fixture for the drama beats.

8. **THE PRESSING is unreachable in demo.** The loom can only seal when *not* live —
   `woven-loom.html:309` `ended=(!M.live && …)` — and demo mode sets `M.live=true`
   (loom-adapter calls `L.live()`), so at full time the cloth just stops: no gold selvage, no FULL
   TIME seal, masthead forever **"LIVE · 121′"**, leftover un-woven warp below the halt line.
   Evidence: `tl-loom-3-fulltime-seal.png`, FT probe `loomMast: "SUI 0–0 COL LIVE · 121′"`. The
   showcase promises "the loom seals into a scarf" as flow step 3 (`showcase.html:127`) — it never
   does in the mode judges walk.

9. **The stands score / XP / faith system surfaces nowhere it matters.** The terrace shows
   "XP 0 · 0–0" tokens that never move in demo (the quiz that feeds them doesn't run there,
   `terrace.html:222,421`), the cabinet has no stands-score anywhere, and the verdict card doesn't
   exist (see 6). "Lose the match, win the stands" — the product's second-best line — has no pixels.

10. **Scorers exist nowhere in the product.** There is no RESULT family card: the stadium's card
    ring is goal/arc/control/book/bench/odds (`stadium.html:571`), the scoreboard isn't tappable
    (`stadium.html:38` `pointer-events:none`), loom goal marks are anonymous, and the PENALTIES
    sheet is orphaned (defined at `stadium.html:290-298`, no hotspot, not in the ring — unreachable
    dead UI). "Who scored, when" — the first question any fan asks — is unanswerable. (Scorer *names*
    are a flagged bake gap; the missing *family* is a design gap.)

---

## 2 · THE DOOR — `gate.html?demo=1`

**Intent check.** A matchday pass: take a side, call a score, read the market, get stamped in. On
first contact it *does* read as a ticket ritual — the strongest first-contact intent-match of the
seven. `audit-2026-07-10/first-gate-b-settled.png`.

**Confusion log (verbatim, as a first-timer):**
- *Tapped the big button first — nothing happened.* No shake, no hint, no pointer. It's disabled at
  32% opacity (`gate.html:106`) but it's also the biggest object on screen. (`gate-01-tapped-dead-button.png`)
- *"How do I set the score? Oh — tapping the number adds one."* The `−` decrement is a floating
  8px glyph (`gate.html:78`); the `+` affordance doesn't exist visually at all.
- *"SUI 27 / X 34 / COL 39 — 27 what? And what's X?"* No unit, no % — and "X" plus "DE-VIGGED"
  (`gate.html:161`) is bookmaker notation on a mainstream fan's front door.
- *"HOW SURE?" — are those four little outlines buttons?* The empty pips are near-invisible
  (`first-gate-b-settled.png`), and nothing downstream ever shows my conviction again (it's saved in
  the pass and consumed nowhere).
- *The ADMITTED stamp landed across two form rows* — over "HERE FOR THE FOOTBALL" and "PREDICT THE
  SCORE" (`gate.html:112` positions it at 47% of the pass) — it reads like it stamped the wrong part
  of the ticket. Then "SEE YOU INSIDE · YOU CALLED SUI 1–2 COL" flashed for ~1 second
  (`gate.html:279`, 1050ms) and the page hard-swapped. (`gate-05-admitted-stamp.png`)

**Gaps.**
- **BLOCKER — you cannot enter without predicting.** `ready()` requires a touched score
  (`gate.html:233`); verified: neutral pick + no score = dead button forever
  (`gate-02-neutral-picked.png`, probe `go` never gained `ready`). "— HERE FOR THE FOOTBALL —" is a
  lie: the pure lurker the laws protect ("lurking must stay a complete experience"; CALL is the
  *rare* verb) is locked out at the door. Make the call skippable (enter with side only, or truly
  neutral) — the post-mortem's "primed tribal predictions" worry also softens if calling isn't forced.
- The market bar is the only market read pre-match — good honesty — but nothing frames what
  ROOOT *is* on this screen beyond "THE GROUND OPENS →". One line of promise ("your end is waiting ·
  cheer it loud · keep the night") would set the hook standalone shares need.

**Improvements, ranked.**
- **BLOCKER** · Make prediction optional (above).
- **SIGNIFICANT** · Dead-button feedback: tap → the un-done step's label pulses / a one-line whisper
  ("pick a side first"). Cheap, removes the first friction a real thumb hits.
- **SIGNIFICANT** · The commit beat deserves its length: hold the stamped pass ~2.5s as a *changed
  object* (steps collapse to printed facts, stamp presses with the punch/impact register from
  POP-LANGUAGE §E-7), then walk in. Right now the receipt moment is subliminal.
- **SIGNIFICANT** · COL-yellow ink on cream fails the §C-7 contrast gate everywhere it's used as
  type ("COL", the yellow "0", "COLOMBIA") — the loom already solves this with `mastInk()`
  darkening (`woven-loom.html:118-121`); the gate should borrow it.
- **POLISH** · Market bar: append the unit once ("THE MARKET READS · CHANCES %" or `27%`), and
  consider "DRAW" instead of "X" — the 1X2 shorthand can live in the stadium's market card.
- **POLISH** · Score steppers: real `+`/`−` pair, or make the tap-to-add affordance visible (a
  ghost "+1" on first touch).
- **POLISH** · The pass is the least LOUD surface in a LOUD product — the Mexico-70 stub reference
  is *the* ticket grammar (2 loud blocks + paper + ink) and the gate uses zero loud grounds. One
  Azteca-Sun band (e.g. the masthead strip) would carry it without breaking calm.

---

## 3 · THE ROOMS

### 3.1 · THE GROUND — `ground.html?demo=1`

**Intent check.** Home base: score up top, one dial (LOOM · THE STANDS · STADIUM), crowd framing the
lens. The concept reads — the crowd-full → crowd-framing morph is genuinely good
(`ground-lens-loom-framed.png`).

**Confusion log.**
- *"I chose Colombia. Why does it say SUI · YOUR END?"* — the demo hardcodes your side
  (`ground.html:169-176`). **BLOCKER**, see §1.2-5.
- *"I dialed to LOOM at 13′ and the match started over."* Every lens is an iframe that boots its own
  150s demo clock (`ground.html:126-141`) — ground masthead 13′, loom lens weaving at 0′
  (`ground-lens-loom-framed.png`); dial to STADIUM → scoreboard 0′, counts zeroed while the masthead
  says 16′ (`ground-lens-stadium-framed.png`). **The dial's whole promise is "one continuous world";
  turning it resets the match.** BLOCKER-class incoherence in the hub's core interaction — the
  lenses must ride one shared clock (parent-owned feed piped down, or a shared start-epoch param).
- *"Wait, the score is shown twice."* Ground masthead + the embedded terrace's own match bar sit
  ~500px apart on one screen (`first-ground-b-settled.png`). The loom sheds its masthead in embed
  mode (`woven-loom.html:24`); the terrace should shed its match bar the same way.
- *"What's ◈?"* The cabinet is behind an unexplained lozenge (`ground.html:82`) — the showcase has
  to caption it in prose ("Open YOUR CABINET (◈)", `showcase.html:156`), which is a legend admitting
  the glyph doesn't speak. A tiny scarf/shelf pictogram — or the word CABINET — would.
- *"LOOM — THE TIDE?"* The dial hint speaks the dead night-look language (`ground.html:86`). The
  loom's own subtitle says "market is the ground." Pick the cloth word ("THE CLOTH", "WOVEN LIVE"),
  kill TIDE.

**Gaps.**
- **BLOCKER** · No full-time state (§1.2-6): at 120′ the hub should *turn* — verdict band, sealed
  masthead, the ◈ becoming the loudest thing on screen ("YOUR SCARF IS PRESSED → "). This is also
  where "They won the match. We won the stands." belongs.
- **SIGNIFICANT** · In demo their end never roars — the DEMO branch reads only `rooted`
  (`ground.html:175-176`), so the top band's mosaic sits dead all match (the post-mortem's "ground
  did not consume remote roar" was fixed for live at `ground.html:191-198` but not for demo — the
  mode judges see).
- **SIGNIFICANT** · Inside the STADIUM lens, tapping the stands hotspot navigates the *iframe* to
  the standalone terrace (`stadium.html:584` — no `embed=1`): full second chrome (back button, own
  headers, own footer, 0′ clock) nested inside ground chrome, dial still saying STADIUM
  (`ground-lens-stadium-stands-trap.png`). One tap, and the flagship "WHAT TO TRY" path lands here.
  In embed mode that hotspot should switch the *parent's* dial (postMessage) or at least carry
  `embed=1`.

**Improvements, ranked.** BLOCKER: shared match clock across lenses · FT state · seat carry.
SIGNIFICANT: demo roar for their end · embedded terrace sheds its match bar · stands-hotspot embed
behavior. POLISH: swipe-to-dial is undiscoverable (the hint mentions only the dial); "you + 8,203"
row is three unlabeled tokens (see §3.4).

### 3.2 · THE LOOM — `woven-loom.html?demo=1&match=18202783`

**Intent check.** The match woven live: market = the ground bands, play = the cords, events =
stitched marks. Mid-match it is the most beautiful thing in the product
(`tl-loom-2-min60-full.png`) — and early it's honest (empty warp reads as "yet to be woven",
`first-loom-b-settled.png`).

**Confusion log.**
- *"● LIVE · 7′ — wait, is this live?"* No — it's the baked replay, and the terrace on the same
  demo says REPLAY. `woven-loom.html:325` labels any adapter-driven cloth LIVE. **An honesty
  violation in the flagship's masthead** — the demo must read REPLAY (and the blinking live-dot
  should not blink for a tape).
- *"What's the dotted orange line vs the solid dark one?"* Without the legend I could not name
  possession vs danger — and with two centered oscillating cords crossing constantly at phone width,
  mid-cloth they smear into one wobble. Two encodings too many on one axis (see improvement below).
- *"Do I need the legend?"* — the product's own canon says no fan should. It's a permanent boxed
  12-item panel eating ~20% of the screen (`woven-loom.html:35-37, 354-358`) — and embed mode
  *hides it* (`:24`), proving the cloth is expected to stand alone.

**Gaps.**
- **BLOCKER** · No PRESSING in demo (§1.2-8) — the surface's own climax is unreachable.
- **SIGNIFICANT** · The weave halts at ~121′ with leftover warp to the frame's 123–126′ and no
  finishing gesture even visually (`tl-loom-3-fulltime-seal.png`) — at whistle the cloth should at
  minimum trim its warp to the real final minute.
- **POLISH** · The GOOOL overlay exists (`:31-34`) but — 0–0 demo — is never seen (§1.2-7).

**Improvements, ranked.**
- **BLOCKER** · REPLAY label + seal-on-FT in demo.
- **SIGNIFICANT** · Kill the legend panel; replace with (a) marks that self-identify **on tap** — a
  thumb on any stitch pops a tiny woven tag "38′ · CORNER · COL" (phone-native, teaches the whole
  alphabet in two taps, zero standing chrome); and (b) a goal mark so unmistakable (the gold-ringed
  chip is close; let it erupt to double size with the score woven beside it) that the alphabet's
  logic is self-evident from its king.
- **SIGNIFICANT** · One cord, not two. The bands already say *belief*; keep **danger** as the single
  play-cord (it's the drama) and let possession live in CONTROL where it's a number. If both must
  stay, give them different *materials* (a wide calm cord vs sparse sparks), not two thin wiggles.
- **SIGNIFICANT** · The subtitle "THE LOOM — THE MATCH WOVEN LIVE · MARKET IS THE GROUND · PLAY IS
  THE CORDS · EVENTS ARE STITCHED" is the metaphor explained in words — a caption doing the form's
  job (and it's also wrong at FT, still saying LIVE). One evocative line max ("THE MATCH, WOVEN");
  the cloth teaches the rest.
- **POLISH** · Watch-item on the honesty seam: cords ride the same x-axis as the market bands with a
  different scale (±42% around centre, `woven-loom.html:244`) — material separation carries it
  today, but never let a cord read as a probability (e.g. no future tick labels on the cord axis).
- **POLISH** · The keepsake's "YOUR CALL · ✓" seam exists and is honest-empty until bound
  (`:279-283`) — good bones; wire it (§5).

### 3.3 · THE STADIUM — `stadium.html?demo=1&match=18202783`

**Intent check.** The pitch as a map of the eight stat families. The *geography* is right (corner =
set pieces, mouths = shots, centre = control, touchline = the book, dugout = bench, scoreboard =
result/market) — a first-timer scanning `first-stadium-b-settled.png` can *almost* feel it, and then
the chrome gets in the way (§1.1-1).

**Confusion log.**
- *"Why is the pitch red on top when the yellow fans are on top?"* The bowl leans to *rooting*
  (away fills from the top, `stadium.html:370-375`) while the pitch halves paint *possession
  pressing toward the opposing goal* (`:377-379`) — two different truths, same two team colours,
  nested. It first reads as a mistake. And the big **38/62** (later 55/45) carry no label at all.
- *"The '6' on Colombia's goal — Colombia's shots?"* No — it's SUI's tally *at* COL's goal
  (`stadium.html:518-520`), in a colourless ring. Attribution-by-geometry with no colour cue invites
  the exact opposite reading.
- *"30 what?"* The corner badge's set-piece total (corners + free kicks, `:521`) is the largest
  number on screen after possession, unlabeled.
- *"TAP A GLOWING PLACE — they're all glowing."* Constant identical halos (`:45-46`).

**Gaps.**
- No RESULT family / scorers anywhere (§1.2-10); PENALTIES sheet orphaned (`:290-298`).
- No FT state — masthead "REPLAY · 120′" forever, no closing read of the match.
- The dead cream band between masthead and bowl (~180px at 390×844) wastes the hero's crown.

**Improvements, ranked.**
- **BLOCKER** · The owner's actual ask (§1.1-1): drop the rings/glyphs/chip/instruction bar and let
  the places *be* the data at overview scale — the goal-mouth shows its real shot marks in
  miniature (the card's own dots, tiny), the corner arc grows a small flag *per set piece* along the
  arc, the centre circle carries the possession figure **labeled** (small "POSS" cap — a number
  needs its name more than a place needs a glyph), the book is a tiny ledger with its card chips
  stacked at the touchline, the bench shows its arrows only after a sub exists. Places with nothing
  yet stay quiet (an empty corner IS the honest state). Affordance comes from *life* (a place that
  just gained a mark pulses once), not from permanent halos. If any glyph survives, it must be the
  family's own mark (the whistle earns it; ◑/⇅/◍/"1X2" don't).
- **SIGNIFICANT** · Separate the two truths in the one bowl: keep the pitch for the *match* (and per
  the post-mortem make it **territory, spatially, labeled** — with possession as the number at the
  centre spot), and let the *crowd* live only in the stands ring — ideally with the ends matching
  the terrace's vertical order so SUI-bottom means SUI-bottom everywhere.
- **SIGNIFICANT** · Gold seam misuse: the possession divide is drawn in Medal Gold
  (`stadium.html:383`) — gold's meaning elsewhere is the market's voice / the rare mark. A chalk or
  ink seam belongs here (see §4.2-gold).
- **SIGNIFICANT** · THE BOOK card: "0-0" in score typography for yellow·red counts reads as another
  scoreline, and "1 OFF" reads as *sent off*, not offside (`card-2-book.png`; `stadium.html:535-538`).
  Card chips + counts (▮×2 style) and "OFFSIDES" spelled once fix both. Also "CornerKick ·
  OVERTURNED" leaks raw wire camelCase into the print voice (`:540`).
- **SIGNIFICANT** · TEAM SHEET sorts alphabetically — keeper 6th (`card-2-teamsheet.png`). A team
  sheet reads 1–11 by number; sort by shirt number (data already there).
- **POLISH** · THE MARKET card: the rising draw line and the 50% reference are both grey-dashed and
  cross each other illegibly (`card-2-market.png`; `stadium.html:635`) — give the draw its oat ink,
  solid; label the reference "50". Add minute ticks (0/45/90). This card is also the one place %
  appear properly — good.
- **POLISH** · GOAL-MOUTH is the best plate (`card-1-goalmouth.png`) — the register doubles as the
  teacher, marks live where they happened. Two nits: the miss-ring floats disconnected in the sky
  (anchor misses just over the bar line), and save-glove side-attribution is pure position — a thin
  team-colour thread on the glove cuff would lock it.
- **POLISH** · SET PIECES: gorgeous poster, weak plate (`card-2-setpieces.png`) — the corner marks
  float in the sky in two unanchored rows (plus stray ghost dots from the art). Plant the tallies
  *on the arc* (the place doing the telling), or go register-only; "SET PIECES WON" mislabels
  throw-ins.
- **POLISH** · Cards half-empty below the fold (control/book/market especially): the plate register
  should compose the full sheet — a fat bottom band (the family's totals as a Topps-style strip)
  would finish them.

### 3.4 · THE STANDS — `terrace.html?demo=1`

**Intent check.** Two ends of real people around the match seam: cheer with a tap, read the crowd's
call vs the market. The two colour-field ends with the halftone tile crowds are exactly right; the
field-as-meter works (my 10 taps visibly lit my end — `terrace-after-10-cheers.png`).

**Confusion log.**
- *"SUI 0 – 0 COL… and under it SUI 0.6 – 0.5 COL — what's the second score??"* The crowd's mean
  call, in team-coloured score typography, directly beneath the real score
  (`first-terrace-b-settled.png`). Means-with-decimals read as a broken scoreline to a fan;
  "your end 0.7–0.4 · their end 0.5–0.6" doubles it; no sample size (post-mortem blocker); and
  "vs market SUI 27·34·39" beside it is a third unlabeled number system. **This panel is the
  product's crown jewel and its single most confusing moment.** Direction: speak fan ("THE CROWD
  SAYS **SUI** · THE MARKET SAYS **COL 39%** · 14 CALLS IN"), keep the mean as small print for the
  quants, never set crowd numbers in score type.
- *"ROOOT! burst… did I do that?"* The burst fires on the end's roar, not your tap — while "TAP
  ANYWHERE TO CHEER" still shows. Ambiguity between *my* voice and *our* voice; a tiny distinct
  acknowledgment of *your* tap (your seat-tile flashing — the you-tile already exists!) would
  separate them.
- *"you + 8,203 · XP 0 · 0–0"* — three unlabeled tokens; XP is gamer jargon in a stadium-plain-speak
  product, fed by a quiz that doesn't even run in demo (§1.1-4); the trailing 0–0 is your quiz
  win-loss record. Cut or rename in the stands-score language ("YOUR STAND" points), and surface it
  at FT/cabinet where it means something.
- *"VAR CHECK · 39′ — did WHAT count?"* The moment takeover is dramatic
  (`terrace-pulse-moment-popped.png`) but context-free — no side, no what's-being-checked. One line
  ("COL goal being checked") turns a quiz into drama.
- *The picker never leaves.* Unanswered, "WAS IT A PENALTY?" sat open **into full time, under the
  keepsake** (`tl-terrace-3-fulltime.png`). Moments must expire with their window (the model already
  carries `closesAtMs`, `crowd-sim.js:75`), and the tray needs a dismiss — lurking must stay
  complete (the quiz has an ×; the pulse doesn't, `terrace.html:347-368`).

**Gaps.**
- **BLOCKER** · The reveal's fake counts: "you + 6,730 / 9,900 of their end" are hardcoded
  (`terrace.html:381-383`) — fabricated data presented as the crowd, inside the honest demo
  (`terrace-pulse-reveal-split.png`). Either tally real picks from the sim (it already receives
  `momentReact`, `crowd-sim.js:115` — currently write-only) or the reveal must say sample.
- **SIGNIFICANT** · The feelings design (six drawn emblems + split reveal) never appears in demo —
  the built pulse is verdict-only (§1.1-3/4). The emblems are lovely and on-language
  (`terrace.html:259-266`); they deserve the drama slots (goals/chances) the spec gave them. (Also:
  spec said *ambiguous, never literal* tokens; JOY/HEARTBREAK naming is a delta to flag to the owner.)
- **SIGNIFICANT** · The keepsake card: binary verdict (not the cabinet's three-state), uniform
  decorative tifo under "WOVEN FROM REAL COUNTS", "Nº —" placeholder, KEEP IT dismisses
  (§1.2-6). This card is 80% of the way to the shareable object — bind it to the real end state
  (lit ratio, your seat), the real three-state verdict, and an actual keep.
- **POLISH** · The dead black band between their end and the seam (~120px, `first-terrace-b-settled.png`)
  reads as unfinished — either give it meaning (the pitch void; the far end's distance) or collapse it.
- **POLISH** · Both tile fields render ~equal density regardless of 14,100 vs 8,203
  (`terrace.html:321-323` sample fills 95/96%) — the mosaic's own comment says density = the count;
  make the imbalance visible or it whispers "equal crowds."
- **POLISH** · "TAP ANYWHERE TO CHEER" never retires (gate's hint retires once used — same pattern here).

### 3.5 · YOUR CABINET — `cabinet.html?demo=1` and empty

**Intent check.** What you kept. **The best surface in the product** — identity card, record tiles,
NEXT UP ticket, the scarf rail, the medal pins (`first-cabinet-b-settled.png`). The empty first-run
state is honest and genuinely designed (NEED pockets, locked virtues, "the season starts at the
door" — `first-cabinet-empty-b-settled.png`).

**Confusion log.**
- *"Who is lukas? These aren't my matches."* In the walkthrough the cabinet is entirely someone
  else's life (`cabinet.html:187-197`) — and it ignores the pass sitting in localStorage with *my*
  side and *my* call. The one personal thread the demo could truthfully weave, it drops. Even
  keeping the sample rail, the identity card + the SUI–COL scarf line could be *mine* ("you called
  SUI 1–2 · ✗ didn't fall").
- *"I tapped the ARG 3–2 scarf and got a SUI–COL cloth, 0–0, LIVE, still weaving."* Every scarf
  opens the same URL with no match id (`cabinet.html:254`), the keepsake then plays the demo feed
  into a sealed frame with belief bands extrapolated flat from whatever's arrived
  (`seam-keepsake-from-arg-scarf-12s.png`, probe: `"SUI 0–0 COL · LIVE · 123′"`). Four broken
  promises in one tap on the product's most sacred object: wrong match, wrong score, LIVE on a kept
  relic, a fake-full cloth. The keepsake mode needs: per-match data, `KEPT · <final score>`
  masthead, no adapter playback, no shuttle, sealed frame always. (The prior gap-analysis knew about
  the masthead; the wrong-match link and the extrapolated cloth are worse and weren't in it.)
- *"LOCKED · 1+"* — cryptic threshold notation on the pins; the voice wants "FIRST ROOT UNLOCKS."

**Gaps.**
- No stands-score / verdict history (the "won the stands" ledger) — the cabinet is where faith
  should compound (§1.2-9).
- Empty state's three anonymous NEED pockets: the album seam says a NEED is a *fixture* — name them
  (the real next fixtures) and they become want-generating, not system-y.
- "‹ THE GROUND" back-link renders even on first-run when no ground exists yet (the CTA says the
  season starts at the door — the header should agree).

**Improvements, ranked.** BLOCKER: the keepsake seam (above). SIGNIFICANT: read the pass in demo —
make the cabinet *yours* the moment you've walked one gate; reconcile the SUI–COL sample scarf with
the demo's actual 0–0 (§1.2-7). POLISH: mixed flag treatments on one card (sticker crest + emoji
row, `cabinet.html:233-235`); "34 CALLS MADE / 12 MATCHES LIVED" in the sample implies multiple
calls per match — the door allows one; pins could whisper how they're earned on tap.

### 3.6 · THE SHOWCASE — `showcase.html`

**Intent check.** The judge's front door: frame the thing, hand over the phone, guide the walk. The
desktop layout is strong (`first-showcase-desktop.png`): flow, rooms, honesty table, try-list.

**Findings.**
- **BLOCKER** · The hero copy and the WHAT'S-REAL table sell the **dead visual language**: "live
  market belief runs as a **golden tide on a night pitch**" (`showcase.html:103`) and "the golden
  tide" (`:144`). There is no night pitch and no golden tide anywhere in the product it introduces —
  a judge primed with that sentence looks at cream paper and red/yellow cloth and concludes the
  build missed its own pitch. Rewrite in the POP language ("belief woven as the ground of a living
  cloth; the crowd's roar in printed colour…").
- **SIGNIFICANT** · Flow step 3 promises "the loom seals into a scarf; it lands in your cabinet with
  your call" (`:127`) — none of which happens in demo (§1.2-6/8, §3.5). Until the seams are sewn,
  the hub is over-promising the exact things a judge will test.
- **SIGNIFICANT** · The jump-bar embeds standalone pages (with their own mastheads/legends/back
  buttons) rather than embed mode — and the terrace's back button (`terrace.html:179`, no `?demo=1`)
  silently drops the phone into the ARG–CPV *specimen* world with the scripted fake match and the
  killed quiz (§1.1-4). One accidental tap, and the judge is watching fabricated events inside the
  honesty walkthrough. Carry mode on that link (like `cabinet.html:269` does) and prefer
  `embed=1` sources in the frame.
- **POLISH** · "Open YOUR CABINET (◈)" — the glyph needing prose (§3.1). The first try-bullet
  line-breaks mid-name ("On THE / GROUND"). Six tabs wrap to an accidental-looking two rows on
  desktop.

---

## 4 · CROSS-CUTTING SWEEPS

### 4.1 · The no-legend sweep — every caption, key, icon, instruction

| Surface | Crutch | Verdict |
|---|---|---|
| Loom | 12-item legend panel (`woven-loom.html:354-358`) | **Kill** — replace with tap-to-identify + a self-evident goal mark (§3.2) |
| Loom | Subtitle explaining the metaphor (`:66`) | **Cut to one evocative line** |
| Stadium | ◑ ⇅ ◍ whistle "1X2" glyph rings + numeric badges (`stadium.html:194-201`) | **Kill/replace with the places' own marks** (§3.3) |
| Stadium | "TAP A GLOWING PLACE TO GO IN" bar + always-on halos (`:205,45`) | **Kill** — event-driven pulse is the affordance |
| Stadium cards | "DANGEROUS ATTACKS · ON EACH GOAL", "HOME · DRAW · AWAY, ACROSS THE MATCH" captions | Halve — a well-formed plate needs at most its title |
| Ground | ◈ cabinet glyph; ⌂ on the home dial; "THE TIDE" hint | Replace ◈ with a speaking mark/word; TIDE is dead language |
| Ground/Terrace | "TAP HERE TO CHEER…", "TAP ANYWHERE TO CHEER" | Keep one, retire after first cheer (gate already has the retire pattern, `gate.html:262`) |
| Gate | ①/② step labels, "TAP TO SET THE SCORE" | Earns its place (a form is a ritual); hint already retires ✓ |
| Goal-mouth card | symbol·name register rows | **Keeps** — the register *is* the data and teaches the marks; this is the model the others should follow |
| Cabinet | pins = one icon, one name | ✓ §B-7 discipline, correct |
| Showcase | "(◈)" caption; guide prose | The guide may explain; the product may not |

### 4.2 · Honesty seams

- **Market ≠ crowd:** structurally respected everywhere (gate = market only; terrace separates by
  label+colour; stadium confines market to the chip/card) — but the terrace juxtaposition garbles
  *legibility* (§3.4-1), and the **stadium bowl mixes crowd data (rooted split in the seats) with
  match data (possession pitch) in identical team colours** — not market-blending, but two truths
  dressed as one (§3.3).
- **Counts as %:** none found ✓. The split-reveal % is share-of-reactions (spec'd ✓). But crowd
  means go unlabeled (no *n*, no "avg call") — the post-mortem blocker, still open.
- **Fabrications inside honest layers (each named above):** loom demo masthead **LIVE**
  (`woven-loom.html:325`) · pulse-reveal hardcoded counts (`terrace.html:381-383`) · keepsake
  extrapolated cloth + LIVE (`cabinet.html:254` → keepsake mode) · "WOVEN FROM REAL COUNTS" over a
  decorative tifo (`terrace.html:156-157,245`) · specimen quiz quoting an invented market
  (`terrace.html:293`) one mislink from demo (§3.6) · rooting never moves the counter
  (`crowd-sim.js:4` fixed sizes) — the ROOT verb's promised feedback ("counter updates") is invisible
  in the walkthrough.
- **The gold sweep** (the handoff's direct question — is gold used for two meanings?): gold is
  currently (1) the market's voice — "THE MARKET READS", "vs market", loom band edges, the 1X2
  ring; (2) the rare/precious mark — medals, NAILED, ADMIT ONE serial, FULL TIME seal, keepsake
  frame, GOOOL; and (3) **the stadium's possession seam** (`stadium.html:383`) and the loom
  *shuttle* (`woven-loom.html:269`). (1)+(2) can coexist by register (label vs object) if declared;
  (3) is a straight violation — possession is neither the market nor rare. Recommend: ink/chalk for
  the possession seam; pick one canonical meaning ("gold = what the market says + what you keep")
  and write it into POP-LANGUAGE.

### 4.3 · The seams between surfaces (door → ground → rooms → FT → cabinet → next gate)

1. door→ground: auto-walk works; **side dropped** (§1.2-5); "from=gate" unused for any arrival beat.
2. ground↔rooms: dial morph good; **clock resets per turn** (§3.1); stadium-lens stands-tap nests a
   second world (§3.1); embedded terrace duplicates the masthead.
3. rooms↔rooms standalone: terrace back-button loses demo mode → specimen world (§3.6); stadium
   stands-hotspot loses embed; loom has no exit at all (standalone loom is a cul-de-sac — fine
   inside the ground, dead-end from the showcase tab).
4. FT→cabinet: **does not exist** (§1.2-6). The single most valuable seam in the product ("keep what
   you lived" is the thesis) is unbuilt: keepsake KEEP → write the local record → land in the
   cabinet with *your* scarf on the rail → NEXT UP pulls you to the next gate. Every piece exists;
   nothing is threaded.
5. cabinet→next gate: NEXT UP → gate ✓ (good); cabinet→keepsake broken (§3.5).
6. State carry: `rooot.pass` is written once and read by terrace(demo ✓ for call, ✗ for side
   visuals — `terrace.html:594` roots your side but `applyFixture` only runs in live, so a COL fan's
   demo terrace still labels the bottom end SWITZERLAND · YOUR END while counting the away crowd as
   "you") and by ground/terrace live paths ✓. Conviction is written and never read anywhere.

### 4.4 · Every state

- **Pre-kickoff:** gate ✓ (live-ticking pre-match market — nice); loom ✓ honest warp; stadium
  zeroed ✓; terrace quiet ✓.
- **Goal:** unreachable in demo (§1.2-7) — the theatre's centrepiece is unshowable. (GOOOL overlay,
  goal-mouth ball, terrace takeover, chalk-off — all built, all invisible.)
- **Half-time:** ground shows "HT" ✓; the terrace's checkpoint ("your call stands — KEEP/CHANGE")
  never fires in demo (`terrace.html:427-443` is scripted-mode only) — a nice beat stranded in the
  specimen.
- **Full time:** terrace keepsake ✓ (with the stale-picker bug §3.4 and dead KEEP); loom unsealed
  ✗; ground/stadium no state ✗; cabinet unaware ✗.
- **First-run/empty:** cabinet ✓ genuinely good; gate is inherently first-run ✓; ground/loom/
  stadium have no no-pass guard (arriving at ground without a pass just seats you home silently —
  acceptable, but a one-line "you haven't taken a side — the gate is open" would close the loop).
- **Error/degraded:** market-waiting states exist (gate "LIVE WIRE · WAITING", market card "THE
  MARKET PRINTS AS THE MATCH PLAYS" ✓ honest). Specimen fallbacks (stadium FALLBACK sample, terrace
  scripted match) are fine as dev states but are **one URL param away from the honest demo** with no
  visible mode marker beyond the small footer — consider a loud SPECIMEN ribbon on any synthetic mode.

### 4.5 · The voice sweep (stadium plain-speak vs what's on the pixels)

Jargon that leaked: **DE-VIGGED** (gate, market card) · **1X2** (overview chip) · **XP** (terrace) ·
**"1 OFF"** (reads as sent-off) · **CornerKick · OVERTURNED** (raw wire string) · **LOCKED · 500+**
(threshold notation) · decimal mean scorelines (statistician's voice). The good voice is already in
the product — "HERE FOR THE FOOTBALL", "didn't fall", "AND SANG ANYWAY", "worthless to flip" — it
just stops at the numbers.

---

## 5 · THE SHAREABLE-INDIVIDUALLY TEST, screen by screen

| Screen | Send it to a friend? | What's missing |
|---|---|---|
| Gate (picked state) | **Almost** | one loud band; my call as the hero once committed |
| Ground composite | No | chrome-heavy; it's a place to *be*, not to share — fine |
| Loom mid-match | **Yes** — the poster of the product | minus legend, minus LIVE lie |
| Loom sealed keepsake | Would be the #1 share | unreachable (§1.2-8) |
| Stadium overview | **Almost** | icon rings + unlabeled numbers pollute a lovely bowl |
| Goal-mouth card | **Yes** | anchor the miss-ring |
| Set-pieces card | Art yes, data no | plant tallies on the arc |
| Control card | No | §3.3 rework |
| Book card | Not yet | score-like "0-0", empty pages need their entries |
| Team sheet | Functional | number order |
| Market card | No | draw/reference line clash; half-empty sheet |
| Terrace (roaring) | **Yes** at high roar | the decimals band cheapens it |
| Terrace keepsake card | **Almost** | real tifo, real verdict, real Nº, real KEEP |
| Cabinet | **Yes — best in product** | make it *mine* in demo |
| Cabinet empty | Yes (surprisingly) | named NEED pockets |

---

## 6 · GOOD — BUT COULD BE EXCEPTIONAL

1. **The loom cloth** already wins the beauty argument. Exceptional = the cloth as the *single
   souvenir pipeline*: same SVG renders live → sealed → cabinet-kept → mint. One object, four
   moments. All the code exists; it's a seams problem (§3.2, §3.5).
2. **The gate ritual** is 80% of a great 30 seconds. Exceptional = the commit beat (stamp → pass
   becomes a printed fact → tunnel walk), plus a reason to screenshot it (your call as the pass's
   serial line: "CALLED SUI 1–2 · CONFIDENT · Nº 0472").
3. **The dial** is the right one-hand grammar. Exceptional = one continuous clock + the crowd bands
   *reacting* while you're in another lens (their end flares mid-loom → you feel the stadium around
   the stat), which is literally its promise ("the crowd stays while you turn the dial").
4. **The goal-mouth plate** is the model plate. Exceptional = it IS the overview's goal hotspot in
   miniature (no count badge needed), and at FT it becomes the shot-story of the night.
5. **The cabinet** is already the product's proof. Exceptional = it fills *live during the match
   you're in* (scarf slot appears at kickoff as "WEAVING…"), so the collection urge starts before
   full time.
6. **The pulse takeover** (VAR CHECK filling the seam) has real drama. Exceptional = context line +
   the six feeling emblems at goals/chances + a reveal built from *real* picks with its *n* shown —
   two ends' moods face to face, honestly.
7. **The empty cabinet** is a quietly great screen. Exceptional = named NEED pockets for real
   upcoming fixtures — the album that sells the season.

---

## 7 · EVIDENCE INDEX

`design/audit-2026-07-10/` — 54 screenshots + `logs/` (all consoles clean). Key exhibits:
`first-*` (all 8 surfaces at load + settled) · `gate-01…06` (dead-button, neutral lockout, COL flow,
stamp, arrival) · `tl-{ground,loom,stadium,terrace}-{1-min32,2-min60,3-fulltime}` ·
`tl-loom-2-min60-full` (the poster) · `tl-loom-3-fulltime-seal` (no seal, LIVE·121′) ·
`card-1-goalmouth`, `card-2-{setpieces,control,book,teamsheet,market}` ·
`terrace-pulse-{moment-popped,reveal-split}` (fake counts on screen) ·
`ground-lens-{loom,stadium}-framed` (clock reset), `ground-lens-stadium-stands-trap` (nested world) ·
`seam-keepsake-from-arg-scarf-{3s,12s}` (wrong-match keepsake) · `first-showcase-desktop`.

*Not re-verified here: live-wire paths (`?live=1`), rows, mint — out of demo-mode scope. Player-name
nulls in bake events (BOOK "–", bench "▲ – ▼ –") are a flagged data gap, not a design failure —
though the design could degrade more gracefully than a bare dash ("a change at 45′").*
