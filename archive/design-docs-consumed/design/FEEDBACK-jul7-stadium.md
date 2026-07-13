# Owner feedback → design lane (Jul 7, mid SUI–COL) — stadium/loom visual

*Relayed by the coordinator. The three below are visual/layout calls (your lane). The
two correctness items the owner raised in the same breath (events doubled; HT/ET
resolution) were coordinator-lane and are already fixed + deployed — see the note at
the bottom so you don't chase them.*

## 1 · SET PIECES is the standard — apply it to the GOAL card, and complete it
- The owner: "set pieces read beautifully and should be the standard for the goal as
  well (with the stats underneath the symbols)." → Re-cut the **GOAL-MOUTH** card in the
  SET PIECES register: the symbols across the top, each stat **printed underneath its
  symbol**.
- "I also want all the symbols present above, not just the corners. That should be one
  chart next to the others." → SET PIECES should show **every** dead-ball family as a
  symbol-with-count, not corners alone — it becomes one chart alongside the others.
- **Data is all live in `window.__stats` per side — nothing to wait on:**
  `corners`, `freeKicks`, `throwIns`, `offsides`, `fouls`, `cards {yellow,red,list}`,
  `subs`, `injuries`, `penalties`, `shots {onTarget,offTarget,blocked,woodwork}`,
  `scorers`, `attacks {danger,highDanger}`. Every symbol you want has its number.

## 2 · Stadium spots: drop the labels
- "In the stadium view itself, we don't need to label the spots — they should speak for
  themselves." → Remove the caption chips on the pitch hotspots (EGY GOAL / SET PIECES /
  THE BOOK / etc.); let the symbol + count carry it.

## 3 · Score display: numbers dead-centre
- "The numbers are slightly high, should be dead centre of the display (unless we want a
  small minute display underneath)." → Vertically centre the score in the scoreboard
  box; or, if you add a small **minute** readout beneath it, the current top-weight is
  fine. (Confirm whether this is the stadium scoreboard box or the loom header — owner
  was likely looking at the stadium.)

---
**Already handled (coordinator lane, deployed):**
- *Events doubled on the loom* — shots/cards re-emit + the join-replay resends; the looms
  were pushing a new mark each time. Fixed: loom-adapter passes `ev.id`, woven-loom +
  loom-proto REPLACE by id (verified 78→37 marks on col-gha). Your event glyphs are fine.
- *HT/ET* — clock-freeze at 45'/90' + status ladder intact; and the belief no longer
  goes beige after 90' (loom-adapter was dropping the 1X2 in ET via `|| etPhase` — removed;
  the full-match 1X2 prices through to 120'). woven-loom renders the full ET arc correctly.
