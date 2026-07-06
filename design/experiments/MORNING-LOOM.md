> ── UPDATE · after your 3 bugs (Jul 5, you were right on all three) ──
> 1. **Cords vanished after the goals / black went straight** — that was extra time. In replay I'd
>    frozen possession to 0.5 and had almost no ET danger data, so both cords flatlined to centre and
>    the black one covered the gold. Now driven by **real ET possession + danger** (they weave to FT).
> 2. **Beige cloth after 90'** — a real bug, and a bad one: I'd assumed the market dies at 90' and
>    painted ET grey. **It doesn't.** The 1X2 prices the winner *all the way through extra time.* The
>    cloth now weaves the **real de-vigged H/D/A** to minute 120 — ARG-blue on their ET goals, the
>    **cream draw-band swelling at 103–110** (honest: 2–2, heading to penalties), blue again on the winner.
> 3. **Events barely visible** — shots are now cream-backstitched **embroidered strikes** (team-coloured,
>    with a knot 'ball'); yellows are **woven card-tags** at the selvage. Legible now; still swap-outs for
>    your bespoke objects later. Same link, republished. Details at the bottom of this note / LOOM-NEXT.

# MORNING — the overnight loom refinement (Jul 5)

*What changed while you slept. The loom prototype lives at `apps/web/public/loom-proto.html`
(same artifact link: https://claude.ai/code/artifact/ae8f2e46-c93b-4da5-ae6a-4ea4fa5f8b87).
Open it, press play — it weaves the real ARG–CPV epic. All verified in-browser.*

## The big one: it reads as WOVEN now, not a pixely video game
The flat scanline fill is gone. The belief ground is now real cloth:
- a pre-baked **warp + weft interlacement texture** (soft-light) that scrolls *with* the cloth,
- **per-weft thread crowns** (each minute-pick reads as a rounded thread, not a flat bar),
- a **fibre-fleck layer** for tooth,
- **dye-lot variation** per pick (subtle lighter/darker wool),
- a crisp **selvage keyline** framing the woven area.
The two throughline cords are now **couched cord** — cast shadow, body, a core shadow, and
**ply-twist glints** along the path — so they read as laid thread, not vector strokes. It now
sits at the material level of your embroidered ball and GOOOOL. Perf is a non-issue: **0.88ms
/frame (~1100fps headroom)** — smooth 60fps with room to spare.

## Your new objects are socketed in
The embroidered **soccer-ball** emblems (team colourways) weave in at each goal on the gold
weft; the **GOOOOL** erupts as the celebration (real-time pop→settle→fade). The pinwheel
"radioactive" balls are gone.

## Team theming — ready for the live test (the piece you asked for)
`window.__loom.teams(home, away)` now themes everything: tricodes, names, the belief inks
(home = left, away = right), the crowd-spark colours, and the ball. Verified as **BRA 1–0 NOR**
— Brazil-yellow home ground, Norway-red away, right labels. One gap: **balls only exist in
blue / red / neutral-master** — a clearly-blue team gets the blue ball, clearly-red gets red,
**everyone else falls back to the black/cream master** (so Brazil gets a neutral ball, not a
wrong-coloured one). Per-team ball colourways are a real follow-up — either you generate a
master per fixture, or I build a canvas recolour. Fine for the rehearsal.

## New: the Full-Time keepsake beat
When the match ends the cloth **frames itself in gold** and captions **"FULL TIME · THE SCARF
IS YOURS · ARG 3–2 CPV."** Extra time is woven in the **real market belief** (see fix #2 above):
the cream draw-band swells at 103–110 as it heads for penalties, then floods ARG-blue on the
111' winner, ET goal-balls blazing on the gold wefts — the double-comeback reads, and the object
finishes like a keepsake. It's genuinely lovely.

## Live-feed API (for the coordinator, from earlier)
`window.__loom.{live, odds, pressure, possession, tempo, event, clock, score, teams}` — the
consumer side is done and tested with synthetic pushes. Brief for wiring the live wire:
`design/experiments/COORDINATOR-LOOM-WIRING.md`. Nearest live rehearsal: Brazil–Norway
(Jul 5 20:00 UTC); hero USA–Belgium Jul 7.

## What I deliberately did NOT do (your call)
- **Press-black night colorway** — the terrace/night object. Left it out to not destabilise the
  verified daylight state overnight; it's a clean add (a toggle that flips the cloth ground +
  draw/dead zones to press-black, inks stay). Say the word.
- **Per-team ball recolour** (see theming gap above).
- Deeper **texture irregularity** (the weave is a touch mechanical/regular; real cloth wanders
  slightly). Easy to loosen if you want it more hand-woven.

## Suggested first thing to check
Open it, press play at 8×, watch the 58' cliff weave (the blue wall breaking to red, the ball +
GOOOOL), then let it run to Full Time. Then hit **58′ CLIFF** and **ET GOALS** jumps. Tell me:
is the texture *right* (more/less thread, heather the inks?), and do you want night mode + the
per-team ball recolour before the USA–Belgium debut.
