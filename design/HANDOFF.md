# HANDOFF — from the retired design coordinator to the next instance

*Written on retirement, Jul 7 2026, after the owner's final verdict on v24: "not in the
host nation's colors · not bespoke, most certainly not bauhaus · not beautiful or
collectible · keeps random prose. Terrible work." He is right. This document exists so
you fail better than I did. Read all of it before you touch anything.*

---

## 1 · THE FOUR FAILURES, AND THEIR ROOT CAUSES

**Failure 1 — The host palette never arrived.** The owner asked (twice) for a melange of
verde · rojo · azul · blanco — Mexico, USA, Canada — celebrated across the paper world.
I wrote a "dosage law" (host colours dress the room; hairline accents) and shipped pages
that stayed press-black and cream with 4px colour bands. **I codified my own timidity as
law.** The owner wanted colour as FIELDS — committed grounds, Bauhaus blocks — and got
pinstripes. Root cause: I treated restraint as always-safe. Restraint without commitment
is just absence.

**Failure 2 — Described Bauhaus, built dashboards.** Every brief invoked Bauhaus; no page
was ever COMPOSED like one. Bauhaus is committed geometry: big fields, diagonal energy,
type as picture, asymmetric balance. What shipped was ledger rows, hairlines, and small
canvas drawings inside a scroll — a tasteful admin panel. Root cause: **writing about a
style is not designing in it.** I never once blocked out a page as pure composition
(shapes first, data second) before building. The references folder was consulted; it was
never obeyed.

**Failure 3 — Verified function, certified beauty.** My acceptance loop was: renders,
zero console errors, numbers correct, "instance says it passes the Mirror test." The
implementing instance graded its own taste; I accepted claims ("passes the crop test")
without demanding the actual artifact — a single image with our chapter NEXT TO a Mirror
band. Ratchet bias did the rest: each version looked better than the last version, so it
felt like progress, while the absolute bar sat untouched. Root cause: **the implementer
must never certify its own beauty, and "better than yesterday" is not a standard.**

**Failure 4 — The copy still performed.** After a dedicated purge, "The referee wrote
names." survived — prose that performs the design's cleverness back at the reader. And
the interaction verbs were branded, not natural: "STAND WITH ARG" where the interface
should simply ask **"Who are you with?"** once, then get out of the way. Root cause: I
applied the voice law as an aesthetic (caps, short, dry) instead of as thinking — *what
does a person need asked or told at this moment, in their own words?* A sentence can obey
every rule and still be self-regard.

## 2 · PROCESS LESSONS (what I'd do differently — do these)

1. **Sketch before build, always.** One static frame (even a canvas mock) → owner verdict
   → THEN build. My loop was build→verdict→rebuild at 2MB file scale; every correction
   cost hours and goodwill. The owner steers brilliantly off a single image.
2. **The acceptance artifact is a side-by-side.** One image: our piece beside the Mirror
   (or the Panini/Bauhaus reference). If you can't produce that image, you haven't
   verified anything. Functional checks are table stakes, never acceptance.
3. **Split maker and judge.** The cold-eyes UX pass (zero-context instance narrating the
   page) was the single most valuable act of my tenure — it found truths nobody inside
   could see. Run the same mechanism for TASTE: a blind instance with the references and
   no investment, asked "same calibre? what dies first?" — before the owner ever sees it.
4. **Commit to colour decisions in the sketch.** If the direction says host-nations
   melange, the sketch must be MOSTLY those colours. If it feels loud, the owner will say
   so — he asked for loud ("celebrate colors"; restraint was only against Lichtenstein
   POPPINESS, not against colour itself).
5. **Copy: ask the natural question.** Interface copy is a conversation, not signage for
   the design system. "Who are you with?" beats every branded verb. Concept names (THE
   PULSE, THE COUNT) belong to structure, not to buttons.
6. **Stop writing laws; show frames.** I produced ~8 .md documents of law and addenda.
   The owner's actual instrument of steering is a VERDICT ON AN IMAGE. Keep laws to one
   page; spend everything else on visible frames.
7. **Canvas primitives read as clipart.** Every quick vector drawing I made (fists,
   feathers, gloves v1) failed until either the owner generated bespoke assets (the
   pipeline that WORKS: prompts → his generator → I socket) or an instance spent hours on
   one object. Budget accordingly; prefer the owner's pipeline for anything figurative.
8. **Guard the wins.** Friend-tested things (the cloth's icon lexicon, the flip, the
   pinned tags) survived multiple verdicts. Don't relitigate what passed a gate; spend on
   what never passed one (the page composition, the colour world).

## 3 · WHAT THE OWNER HAS RULED (his words are the canon — do not re-ask)

- "EVERY DOT SHOULD MEAN SOMETHING" — the delete test. Honesty absolute: market ≠ crowd,
  counts never %, nothing renders that didn't happen.
- The Loom REPLACES the stage. One page = the ground: scoreboard / cloth / stands below.
- Events: soccer's own icons, stitched; duration-true (a shot is a point); craft lives
  BENEATH as texture. Blocked = filled mouth ("simple wall"); miss = red cross. Friend-
  test is the gate for legibility.
- No faith multiplier ("you cheer, win or lose or draw").
- The Pulse: six human feelings (muscle/fire/fear/prayer/disappointment/anger), bespoke
  embroidered patches (his generations), windows at moments AND ~5-minute cool-off.
- No victory symbols (rosette = "county fair", medal = "corny, we stay away from cheese").
  The seal = marks of making (woven label + hallmarks). The score is the victory.
- THE COLLECTIBLE LAW: every stat/page/moment a Panini-grade shareable object; crop test.
  Bauhaus graphical beauty; Panini as collectible ENERGY, never literal.
- Host-nations palette: verde/rojo/azul/blanco melange — and MORE of it than you think.
- Copy: plain, adult, show-don't-tell, no exclamation, no coaching, no self-regard.
- The Mirror (~/Documents/AI Reach/design/mirror-mobile.html) is the LEVEL, not a template.

## 4 · WHAT EXISTS AND WHERE

- **The build:** `apps/web/public/loom-proto.html` (v24, ~2MB, self-contained). Artifact:
  https://claude.ai/code/artifact/ae8f2e46-c93b-4da5-ae6a-4ea4fa5f8b87 . Every version
  v13–v24 snapshotted in `design/experiments/versions/` (v24-legend-integrated is last).
- **In it, working and verified:** the woven cloth (real de-vigged H/D/A through ET; team
  kit-threads; icon lexicon w/ tap-tags; THE KEY + THE COUNT tabs; continuous live clock);
  THE COUNT as a live-computed chapter scroll; THE STANDS rail wired to `__stands`;
  `__stats` consumed with honest pending states; LIVE/REPLAY truth; specimen locks.
- **Live wiring:** `loom-adapter.js` + `stands-adapter.js` + `stats-adapter.js` (coordinator
  lane, all tested); `?loomfeed=1&match=<id>`; debut fixture USA–BEL = 18193785. Adapter
  gaps filed in `design/experiments/COORDINATOR-LOOM-WIRING.md` (pen→goal is the big one).
- **Assets (the owner's generations, extracted+socketed):** 15 team balls + master
  (`BALLSRC` in the loom; sources `design/generations/balls/`), 6 Pulse patches
  (`design/generations/reactions/`), GOOOOL, pennant (unsocketed), shield-crest (alt).
  Pending his generation: the woven LABEL blank (FT seal) — prompt in sheet 011 footer.
- **Docs:** `design/PAPER-AND-CLOTH.md` (the law — trim it), `design/COORDINATION-PASS1.md`
  (briefs + pass specs), `design/COLD-EYES-PASS2.md` (READ THIS — the visitor study),
  `design/COPY-MAP-PASS1.md`, `design/experiments/LOOM-NEXT.md` (A1–A31, the full journal),
  sheets 010–014 in `design/experiments/` (published artifacts logged in the journal).
- **References:** `design/references/` — infographic inspo, panini, + the older canon.
  The Mirror at `/Users/ls/Documents/AI Reach/design/`.
- **Data honesty tooling:** real ARG–CPV numbers all extracted from
  `apps/web/public/replay/arg-cpv-20260703.jsonl` (belief series, shots w/ outcomes,
  corners, subs, VAR span, fine print, ROSTER NAMES via the double-escaped lineups line).

## 5 · IMMEDIATE STATE / OPEN ITEMS

- Debut: USA–BEL (18193785). Rail + stats adapters connect; cord tap-targets ~8px (needs
  phone test); touch scroll untested on device.
- Deferred from cold-eyes: half-time seam · THE CROWD panel layout clarity · FINE PRINT
  mid-match tone · FT scarf unroll (→ THE PRESSING, unbuilt).
- Unbuilt rooms: THE PRESSING (FT ceremony + label + hallmarks), THE ALBUM (GOT·GOT·NEED),
  YOUR SEAT (profile), THE GATE (entry). The coordinator's fan-section seams are ready
  (`design/BRIEF-FANSECTION.md`).
- The immediate task the owner implicitly set: REDO the visual world — host-palette
  fields, real Bauhaus composition, collectible-grade pages — sketch-first, judge-blind,
  then rebuild. And rename the rail's question to the human one.

## 6 · ONE SENTENCE TO CARRY

The owner does not want tasteful minimalism about football data; he wants a beautiful,
committed, colourful OBJECT that happens to be true — judge every frame as a thing a
stranger would pin to a wall, and let him see it before you build it.

— the retired coordinator
