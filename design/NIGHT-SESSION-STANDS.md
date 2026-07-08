# Night session — the stands (fan section)

Built while you slept, in-lane only: `apps/web/public/gate.html`, `apps/web/public/terrace.html`,
and this note. Nothing coordinator/contract touched, no commits, tree clean. Every piece
self-verified by screenshot; consoles clean throughout.

## What to open (preview server "loom" on :8756 — reload each)
- **`terrace.html`** — the live fan section. It plays itself (~35s for the 90). Tap anywhere on
  your end to cheer; a QUICK CALL pops in a lull (~9s) and at the penalty (~14s); half-time
  checkpoint at ~17s.
- **`gate.html`** — the door, now on a scoreline.

## The five, in the order you listed them

1. **Copy → CHEER.** "ROAR" is dead as a label. The act is **CHEER**; at peak cheer a faint
   **ROOOOT** rises over your end (the roar as an *animation*, per your note). Goals read **GOOOOAL**.
2. **Verdict flow (pen/VAR).** A contested call holds **PENALTY?** in the centre and asks
   *"WAS IT A PENALTY?"* → PENALTY / NEVER (VAR → GOAL / NO GOAL). Resolves to a
   your-end-vs-their-end split — honest counts, and your own call is acknowledged (incl. when
   you break with your end).
3. **Mini-predictions.** Optional, dismissible (×), **no-stake** pop-up at real windows
   (next corner in a lull; will-he-score at the pen). Resolves against the replay → green +
   **+10 XP** + a **READING THE GAME** fan-team tally (SUI n · COL n). The market's number sits
   *beside* it ("the market: 76% scored"), never blended.
4. **Ambient crowd-lens.** The resting centre now shows **THE CROWD CALLS · SUI 2.1 – 1.8 COL**,
   sorted by affiliation (your end 2.4–1.4 · their end 1.5–2.1), beside the market line.
   **Faith**: the losing end stays *lit* and shows **◆ STILL SINGING** — dignity, no counter.
5. **Checkpoints.** The door now predicts a **scoreline** (tap the numbers), not 1X2. At
   half-time a **checkpoint** pops — your call stands, **KEEP / CHANGE**. OT & pens are the same
   pattern (structural TODO).

## Honesty held
- Crowd = counts/splits, **never a %**; market = the number, always *beside*, never blended.
- **No stake** anywhere — XP is a record, not currency.
- All crowd figures are **sample** (marked in the footer) — they wire to live `__stands`.
  Events are replayed from a scripted timeline.

## Needs you (parked, not guessed)
- **Feelings** are still words (JOY·HOPE·NERVES·DISBELIEF·AGONY·ANGER·RELIEF·PRIDE). Trim the
  overlaps once you feel them (my eye: NERVES/DISBELIEF) + your generate-loop for the emblems.
- **Stadium** — CONTROL card, GOAL→SET PIECES lift, set-piece graphics: all in
  `design/STADIUM-GAPS.md`, all need your generate-loop.
- **Wiring** — the door's locked scoreline into the terrace checkpoint (hardcoded "SUI 2–1"
  sample for now); real `__stands` / `__loom` sockets.
- **Copy** — everything is placeholder (CHECKPOINT, STILL SINGING, QUICK CALL…). Poetry when earned.

## Three questions for you
1. **Mini-predictions** — desirable? (that was the point of prototyping — feel it, then decide.)
2. The **READING THE GAME** fan-team tally — right amount of gamification, or dial down?
3. The **ROOOT crescendo** at peak cheer — keep it, or too much?
