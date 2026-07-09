# STATUS — design lane (Jul 9, live)

*Snapshot for the coordinator + any instance working alongside. I own the web **surfaces**
(`apps/web/public/*.html`) + `design/` docs. The **engine/adapters/contracts/bake** are the
coordinator's lane — I flag, I don't touch. Update this doc as state changes.*

## 🔧 IN FLIGHT RIGHT NOW
**CONTROL card rework** (`apps/web/public/stadium.html`), owner-directed:
1. Replace the gradient-bloom danger heat with a **coarse grid of FLAT TILES** (per the CONTROL
   plate direction — the bloom drifts "AI-gradient", the one off-brand viz in the stadium).
2. **Add stats** — it feels sparse (only possession + danger). Pulling honestly from `__stats`:
   territory, high-danger split, etc.
If you see `stadium.html` mid-edit around the `bloom()` / `repaintPitch` / CONTROL-render code,
that's me. Nobody else should touch that block until this lands.

## ✅ DONE + committed (recent → older)
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
1. **Bake event player-names are NULL.** subs/injuries/cards carry `minute` but
   `inName`/`outName`/`player` = null, so the stadium BENCH + BOOK render "–" for every name.
   Names showed earlier this session → looks like a **re-bake regression** (the XI kept names,
   the events lost them). My render is correct — it shows what it's given. Fix in the bake/adapter.
2. Earlier flags are now **RESOLVED** by your XI re-bake (`125708b`): the XI is in the bake ✓ and
   `__stats` is time-synced ✓. My old design-check notes on those (in `QUEUE-jul7.md`, commit
   `6258adf`) are **STALE** — ignore them.

## ⏭ PENDING (my lane, queued)
- **Trophies** — owner is generating the 7 marks (crystal ball, megaphone, planted flag, upstream
  arrow, crosshair-eye, ticket stub, black sheep). When they land I rebuild the cabinet pins as
  **bronze/silver/gold framed badges** + wire each to its honest counter. Prompts:
  `design/GEN-PROMPTS-FLAGS-TROPHY.md`.
- **Flags** — 8 QF flags generated (`design/generations/flags/`: ARG BEL ENG FRA MOR NOR SPA SUI),
  not yet socketed into gate/cabinet. Blocked on a demo-teams call: `/demo` is SUI–COL but COL
  isn't a QF, so socketing needs a fallback or a demo-teams change.
- Stadium cards — owner will "come back to refine" (set pieces especially).

## 🌍 KEY STATE
- `/demo` = SUI–COL walkthrough (baked, serverless). `/live` = FRA–MOR (the premiere).
  `showcase.html` = the review page (phone-frame demo + guide).
- Honesty laws hold: market ≠ crowd ≠ team; counts never as %; no fake ball/players; no FIFA marks.
