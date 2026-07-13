# HANDOFF — fresh-eyes design audit of ROOOT

*You are a **new design instance**. Your job is not to build. Your job is to **walk the entire built
experience top to bottom, as a real first-time user**, and find everything wrong, confusing, missing,
or short of great — even where things already look good. A prior instance built all of this, is too
close to it, and has demonstrably dropped changes the owner explicitly asked for. **Do not trust the
builder's self-assessment. Re-derive everything by using the product.***

---

## 0 · Your mandate (read twice)

- Walk **every surface, every state, every seam**, as a user who has never seen ROOOT and was handed a phone.
- At each step record, verbatim, **where you hesitate or feel confused** — that hesitation is the finding.
- Identify **gaps** (what you expected that isn't there; what a real user would want next).
- **Suggest improvements even when a screen is good** — "this works; here's what would make it exceptional."
- Be **critical and specific**. Vague praise is useless. "The X on screen Y reads as Z but should read as W, here's why" is the job.
- **Screenshot everything yourself.** The owner cannot see your screen; a screenshot is your evidence. "Looks fine" without a screenshot is not a finding.
- You are **reviewing, not editing.** Produce a findings report. Do not change code unless the owner tells you to.

The owner's north star, in their words: *"everything feels like a collectible and bespoke"* and the test
for every screen is **"is this good enough to be shareable individually?"** Judge against that, not against
"is it functional."

---

## 1 · How to run it

- Surfaces are static HTML in `apps/web/public/*.html`. Serve that directory (there's a `preview_start`
  launch config named **loom** → python static server on **:8756**, or `npm run dev` in `apps/web`).
- **Demo mode:** append `?demo=1` — a baked **SUI–COL** replay + a simulated crowd, fully serverless. Some
  surfaces also take `&match=18202783`. Everything you need to walk the product is in demo mode.
- **The journey** (walk it in this order, as a user would):
  1. `showcase.html` — the walkthrough hub that frames the whole thing (also embeds each surface).
  2. `gate.html?demo=1` — **THE DOOR**: pick a side, call a scoreline, read the market, get admitted.
  3. `ground.html?demo=1` — **THE GROUND**: your home; a dial between THE STANDS / THE LOOM / THE STADIUM.
  4. `woven-loom.html?demo=1&match=18202783` — **THE LOOM**: the match woven live; seals into a scarf.
  5. `stadium.html?demo=1&match=18202783` — **THE STADIUM**: the pitch as a map of stat families.
  6. `terrace.html?demo=1` — **THE STANDS**: two ends of real people; cheer; the crowd's call vs the market.
  7. `cabinet.html?demo=1` — **YOUR CABINET**: scarves, fan-virtue pins, your record. (Also visit it with
     **no** `?demo=1` to see the honest empty first-run state.)
- The demo replay **advances over time** — the loom fills, cards accumulate, full-time arrives (~120'+).
  Walk each surface both **early** (sparse) and **late** (full). Screenshots catch mid-transition; re-shoot.

---

## 2 · The bar you're judged against — READ BEFORE CRITIQUING

Critiquing against generic web/product taste will produce wrong findings. Read these first so your
critique is against ROOOT's actual language:

- `AGENTS.md` — the operating laws. `docs/PRODUCT.md` — what we're building. `docs/DATA.md` — data truth.
- `design/POP-LANGUAGE.md` + `design/REFERENCES.md` — the visual language.

**The honesty laws (violations are findings):**
- **Market ≠ crowd ≠ team.** The market has the *number* (de-vigged 1X2, the golden tide). The crowd has
  the *roar* (real counts — **never** dressed as a %, never blended with market data). Never mix them.
- **Counts are never percentages.** No fake ball, no fake players, no synthetic events in honest layers.
- No token, no wager. No FIFA marks (team names + unicode/█ flags are fine; "the tournament" otherwise).

**The aesthetic:** retro **Bauhaus-meets-Panini/Topps** print — flat saturated colour, hard black keylines,
white/cream card borders, honest offset-print texture (a whisper of Ben-Day halftone). If a render drifts
toward **betting-app / dashboard / AI-gradient**, it fails, full stop.

**The principle the whole product lives or dies on: no legend.** Canon (from `lexicon2-sheet`): *"the
arrows, the flag, the spot, the screen — stitched, so they live in the cloth. **No fan needs a legend.**"*
Every place you find a caption, a key, or an icon explaining what something *is*, ask whether the thing
could just **be** legible by its form and position instead. This is the lens for the stadium below, but
apply it **everywhere**.

---

## 3 · What the owner has EXPLICITLY asked for that is NOT in the product

Start here — verify each is still wrong, then go far beyond this list. The owner is certain more was
dropped; these are the ones named out loud:

1. **THE STADIUM — kill the symbols and the descriptions; let the positions speak for themselves.** The
   overview currently hangs **icons** (a ◑, a ⇅, a whistle, a "1X2" chip, numeric badges) and **captions**
   ("GOAL", "SET PIECES", "CONTROL", "THE BOOK", "THE BENCH", "THE STANDS") on the pitch. The owner's
   actual vision: **the geography alone communicates** — the corner *is* set pieces, the goal-mouth *is*
   goal attempts, the centre spot *is* control, the touchline *is* the referee, the bench *is* subs. A fan
   should know what each place opens **without a single label or glyph**. The builder did the *positions*
   but then bolted labels+icons on top — the opposite of the ask. Rethink the overview so it needs no
   legend. (Audit the same "does this need its label?" question on every other surface too.)

2. **THE CONTROL card is sub-par.** (`stadium.html`, the CONTROL stat plate — flat-tile danger field +
   possession/territory bars.) The owner is not happy with it. Also note a live **post-mortem** finding:
   its pitch-split conflates **possession** and **territory** — a spatial graphic must represent one named
   *spatial* stat (territory = where the play is), while possession is a *number*. Diagnose it fresh: what
   is this card trying to say, and does it say it clearly, honestly, beautifully?

3. **"Several things we discussed were ignored, forgotten, or not gotten to."** The owner's words. Assume
   the product does **not** match the intent. Your job is to find the deltas.

---

## 4 · Prior analysis — use it as a map, distrust it as truth

The builder kept its own audit. It is a useful **index of the surfaces and known state**, but the owner
has confirmed it **misses things** — treat it as the suspect's testimony, not the verdict:

- `design/GAP-ANALYSIS.md`, `design/STATUS-DESIGN.md` — the builder's self-audit + status.
- `design/POP-LANGUAGE.md`, `design/STAT-FAMILIES.md` — the design language + the "8 stat families = the
  stadium's places" model (relevant to the stadium-positions rethink).

Read them to orient, then **close them and use the product**. If your walk contradicts the builder's
notes, your walk wins.

---

## 5 · The method — how to actually do this

For **each surface**, produce four things:

1. **Intent check.** In one line: what is this surface *for*? Then: does it deliver that on first contact,
   with no explanation? Where's the gap between intent and experience?
2. **Confusion log.** Walk it as a first-timer. Every moment you'd pause, mis-read, or ask "wait, what's
   that?" — write it down verbatim, with a screenshot. These are gold.
3. **Gaps.** What did you expect and not find? What state is missing (empty, loading, error, full-time)?
   What would a user want to do next that they can't?
4. **Improvements — ranked.** Even for good screens. Mark each **BLOCKER / SIGNIFICANT / POLISH**, and be
   concrete: the change, and *why* (tie it to the laws, the aesthetic, or the confusion it removes).

Then, **cross-cutting**, audit these explicitly:

- **The "no legend" sweep.** Every caption, key, icon, and label across all surfaces: is it earning its
  place, or is it a crutch for a form that should be self-evident? (The stadium is the worst offender;
  find the others.)
- **Honesty seams.** Anywhere market, crowd, and team data touch: are they visibly separate? Any count
  shown as a %? Any "golden tide" gold used for two different meanings (market vs territory vs anything)?
- **The seams between surfaces.** door→ground→room→full-time→cabinet→next-gate. Do the transitions feel
  like one continuous world, or seven disconnected pages? Does state carry across (your call, your side)?
- **Every state.** First-run/empty (esp. the cabinet with no `?demo=1`), early match (sparse loom),
  full-time (the keepsake/PRESSING), the moment a goal happens.
- **The "shareable individually" test**, screen by screen: would you screenshot this and send it to a
  friend? If not, what's missing?

---

## 6 · Scope & lane

- Review the **design/UX of the surfaces in demo mode.** The engine, adapters, contracts, and on-chain
  layer are a different lane and are mid-rework — if something is broken because *data is missing* (e.g.
  a player name renders "–"), flag it as a **data gap**, not a design failure, and move on.
- **Don't edit.** This is an audit. Deliver findings; the owner decides what gets actioned and by whom.

---

## 7 · Deliverable

Write `design/FRESH-EYES-AUDIT.md`:

- A short **verdict** up top: the 3–5 things that matter most.
- A **"what was asked and isn't there"** list (the owner's dropped asks + everything else you catch),
  ranked by how basic/egregious the miss is.
- **Per-surface sections** (intent check · confusion log · gaps · ranked improvements), each with
  screenshots embedded or referenced.
- A **cross-cutting** section (no-legend sweep · honesty seams · surface-to-surface seams · states).
- A **"good, but could be exceptional"** list — the improvements to things that already work.
- Everything **specific**: `file:line` where you can, a screenshot always, a concrete suggested direction.

Be exacting. The owner would rather read fifty sharp, uncomfortable findings than five polite ones.
