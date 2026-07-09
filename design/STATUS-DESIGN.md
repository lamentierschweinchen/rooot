# STATUS — design lane (Jul 9, live)

*Snapshot for the coordinator + any instance working alongside. I own the web **surfaces**
(`apps/web/public/*.html`) + `design/` docs. The **engine/adapters/contracts/bake** are the
coordinator's lane — I flag, I don't touch. Update this doc as state changes.*

## 🔧 IN FLIGHT RIGHT NOW
**Nothing mid-edit.** Book alignment + trophy socketing just landed (below). Flags still queued
(blocked on the demo-teams call).

## ✅ DONE + committed (recent → older)
- `c03e13a` cabinet(pins): **socketed the 7 fan-virtue badges** as ranked medals — each generated
  mark set into a flat struck-metal medallion (bronze/silver/gold = which tier an honest counter
  passed); locked virtue = dashed ghost. Marks processed into `plate/gens/trophies/` (white keyed
  off root; solid-pixel trim so each fills its medal). Sample counts until wired.
- `693082b` stadium(book): bookings **rest ON the ruled lines** (measured the 7 rules in
  book-ledger.png; anchor bottom-up, uniform 3px gap) + **overflow plan** — >7 bookings collapse
  the last rule to a muted "+N MORE BOOKED" (never silently dropped)
- `a1b7534` control: **filled the sparse card** — TERRITORY stat + labeled possession/territory
  split-bars under the flat-tile danger field (both honest from `__stats`)
- `2e69c4b` control: gradient-bloom danger heat → **coarse grid of flat tiles** (kills the one
  "AI-gradient" viz in the stadium; on-brand printed look)
- `19d2fd3` set pieces: home-vs-away bar under every stat (corners/free-kicks/throw-ins)
- `47628a5` goal: wired regenerated `goal-mouth.png` (no golden ball), dropped mask hack
- `b32f1da` goal+nav: bigger register symbols, always-on penalty row; **nav is now a docked
  full-width bottom bar** (global `.sheet` padding clears it — no card's stats hide behind it)
- `be22bb0` cards: pens folded into GOAL register; team-sheet long-name truncation fixed
- `08b76b2` masthead reads REPLAY (not LIVE) under demo
- `b96dcf2` **one synced state**: no near-final FALLBACK under demo; embedded stadium subscribes
- `597b62d`/`0ae364a`/`5433ba2` stadium overview: STADIUM headline + live scoreboard + 1X2 anchored;
  hotspots→natural pitch locations (pens spot dropped, folded into goal); stands→terrace
- `7346460` trophies gen-jobs (7 fan-virtue badges, bronze/silver/gold)
- `80a44c2` ground-dial rework (THE STANDS at home, crowd full→framing); `8295975` loom masthead
  colours; `df86d80` gate ADMITTED stamp; `714e377` cabinet load-in; `544a8c0` `showcase.html`

## 🚩 FLAGGED for the coordinator (your lane)
1. **Bake event player-names are NULL** — the one thing keeping the stadium from reading finished.
   Verified live in `__stats`: `cards.list[].player`, `subs.moves[].inName/outName`, and
   `scorers[]` are all `null` (minutes/types are present). So THE BOOK renders every booking as
   "– 50′" and THE BENCH renders subs as "– → –". The **starting XI keeps its names** (that card
   reads fine) → looks like a **re-bake regression** that dropped only the *event* names. My render
   is correct — it shows what it's given; two otherwise-finished cards look broken purely on this.
   Fix in the bake/adapter. (If you'd rather I add a graceful name-less fallback on my side as a
   stopgap for the review, say so — I left the honest "–" in for now rather than mask the gap.)
2. Earlier flags are now **RESOLVED** by your XI re-bake (`125708b`): the XI is in the bake ✓ and
   `__stats` is time-synced ✓. My old design-check notes on those (in `QUEUE-jul7.md`, commit
   `6258adf`) are **STALE** — ignore them.

## ⏭ PENDING (my lane, queued)
- **Trophies — DONE** (see above). Two small follow-ups for the owner: (1) `roots.png` came out as
  a *bare* mark (no badge ground) unlike the other six complete badges — I keyed its white bg and
  it reads OK planted into the silver medal, but a regen as a full badge would match the set better;
  (2) sample counts are placeholders — wire to the real on-chain record when the relic contract lands.
- **Flags** — 8 QF flags generated (`design/generations/flags/`: ARG BEL ENG FRA MOR NOR SPA SUI),
  not yet socketed into gate/cabinet. Blocked on a demo-teams call: `/demo` is SUI–COL but COL
  isn't a QF, so socketing needs a fallback or a demo-teams change.
- Stadium cards — owner will "come back to refine" (set pieces especially).
- **Overview dual-split legibility** (candidate, owner taste-call): the bowl leans to *rooting* and
  the pitch splits on *possession* — two honest but different meanings, drawn in the same two team
  colours at nearly the same height, so they read as one field. The big possession numbers
  (49/51) also carry no label + out-shout the hotspots. Options: label the pitch numbers "POSS",
  dial their weight down, or differentiate the bowl vs pitch treatment. Not touching until owner calls it.

## 🌍 KEY STATE
- `/demo` = SUI–COL walkthrough (baked, serverless). `/live` = FRA–MOR (the premiere).
  `showcase.html` = the review page (phone-frame demo + guide).
- Honesty laws hold: market ≠ crowd ≠ team; counts never as %; no fake ball/players; no FIFA marks.
