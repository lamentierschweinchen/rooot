# Post-mortem — France–Spain live match, 2026-07-14

**Severity: critical.** On the one night the app faced a live match, it showed a
**wrong score** on camera — the failure an honesty-first product exists to make
impossible. Two more core beats — the loom's goals and the sentiment reactions —
also broke. All three trace to a single process failure, not three unlucky bugs.

## What a fan saw

- The score read **FRA 0–3 ESP** after Spain's 3rd goal was **disallowed for offside**.
  The true score was **0–2**. It stayed wrong.
- The woven-loom **did not show the first goal**.
- **No sentiment reaction was ever offered** across the whole match; every server-side
  moment resolved with **0 reactions**.

What *worked*: the week's stability spine held — no OOM across ~10h, the Starting XIs,
bookings and subs rendered live (the thing that was empty in both prior games), the
market read honestly, the on-chain anchor/mint path stood up. **None of that offsets
putting a wrong score on screen.** It doesn't, and this document won't pretend it does.

## Root cause — proven from the captured feed

We captured the live feed mid-match (`fixtures/live-fra-esp/`). It shows TxODDS did its
job perfectly and **we ignored the parts of the protocol our tests never exercised**:

- A goal arrives **`Confirmed:false`** (provisional, "held breath") then **`Confirmed:true`**
  (settled). A disallowed goal goes **`var` → `var_end` → `action_discarded`** carrying the
  **corrected score**. Real sequence tonight: `seq638 goal Confirmed:false 0-3` →
  `seq642 action_discarded 0-2`.
- **Score:** `contracts/normalize.ts` is stateless and reports `Total.Goals` per message,
  **ignoring `Confirmed`**, and nothing applied `action_discarded`. So the app latched the
  provisional `0-3` and never took the `0-2` correction. It counted an unconfirmed,
  ultimately-offside goal.
- **Loom:** the goal-weave mis-handled the same confirmed/provisional/discarded sequence,
  so the first real goal never wove.
- **Reactions:** goal moments fired server-side but fans were never reliably shown a react
  window (palette/kind-render gap + the flood of low-value "possible" near-miss moments),
  so every window resolved 0×.

## The one systemic cause (the thing that actually failed)

**Every feature was verified against *recorded* feeds — clean, linear, no VAR, no offside,
no confirm/retract.** Those paths *only exist live*. So the entire confirm-and-retract
surface — the literal texture of real football — went **untested while reported green.**
Law #7 ("verify with the real thing") was followed in letter and missed in spirit: a
recording of a match is **not** the real thing for the messy paths that never got recorded.

This was compounded by **coordinator (my) judgment failures**, and I own each:
1. Repeatedly declared work "done/verified" on replay evidence; the owner had to catch the
   gap three separate times tonight (the multi-match walkthrough, the reactions, the score).
2. When reactions were silent, I **rationalized the "0 moments" signal** ("expected — fires
   on triggers") instead of pulling the thread. The owner had to push twice.
3. Prioritized shipping breadth over proving the live-critical path. Breadth held; the
   critical path didn't.

## The fixes (in flight — each verified against tonight's REAL feed, not a replay)

- **`fix-score-confirm`** — normalize + match-state respect `Confirmed` and apply
  corrections (down as well as up); a disallowed goal reverts. Proven against the captured
  seq617-642: settled score reaches 0-2, provisional 0-3 is never the settled line.
- **`fix-loom-goals`** — every confirmed goal weaves once (incl. the first); a chalked-off
  goal is not woven. Verified on the captured feed.
- **`fix-reactions`** — fans reliably offered the react window on real moments (confirmed
  goals, cards, penalties, honest near-misses) with a rendering palette. Verified on the feed.

Each ships only after passing a check that **replays tonight's actual feed** and a
line-by-line coordinator review.

## What changes — so this class of failure can't recur

1. **The captured live feed is now a permanent verification corpus.** `fixtures/live-fra-esp/`
   is preserved. Any feed-handling change must pass against a **real live feed containing
   VAR/offside/confirm/retract** — never a clean replay alone. "Verified on replay" is no
   longer "verified."
2. **Capture every future live match by default** (the recorder runs alongside), so the
   corpus of messy real paths grows and regressions are caught before air.
3. **Chase silence.** A "0 of anything" during a live event is a defect until proven
   otherwise — never rationalized.
4. **The live-critical path is proven first, breadth second.** The scoreboard and the goal
   pipeline are gate-zero.

## Accountability

The stability work was real and it held. But the product's core promise — that every
number is true — broke live, and I reported the pieces green on evidence that never touched
the paths that broke. That is on me. The fix is not just the three patches; it's the corpus
and the discipline above, so the next live match is proven against reality, not a recording
of it.
