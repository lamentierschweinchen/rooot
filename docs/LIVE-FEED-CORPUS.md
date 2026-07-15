# The live-feed corpus — how we don't ship a wrong score again

Decision of record, 2026-07-15, after the FRA–ESP incident
(`docs/POSTMORTEM-2026-07-14-live.md`). This is the standing discipline for any
code that touches the TxLINE feed. It is not advice; it is the gate.

## The one rule

**No feed-handling change ships "verified" on a clean replay.** It must pass
against a **real captured live feed that contains the messy paths** — VAR,
offside, a goal that goes `Confirmed:false → true`, and a goal that is chalked off
(`var → var_end → action_discarded`). A recording of a tidy match is *not* the
real thing for the code that only runs when football gets messy.

Why: every bug on the night the app first met a live match — the wrong score, the
loom, the reactions — was the **same mistake**: trusting a provisional goal and
ignoring the feed's own `Confirmed` flag and its `action_discarded` correction.
None of it was caught because every test replayed a clean, linear feed. The paths
that broke had never once been exercised.

## The protocol we now know (learned the hard way)

The TxLINE scores stream is **stateless per message** — every envelope reports its
own running `Score.Total.Goals`. The truth is in the flags, not the number:

| Wire | Meaning | What the app must do |
|---|---|---|
| `Action:"goal"`, `Confirmed:false` | provisional — the held breath, goal under review | **hold** — never display, never weave, never celebrate |
| `Action:"goal"`, `Confirmed:true` | settled goal | advance the score, weave it, open the reaction |
| `Action:"goal"` with **no** `Confirmed` | older/hand-built captures — a plain goal that counts | display it (`Confirmed !== false`, not `=== true`) |
| `var` → `var_end` | a review is happening | nothing yet |
| `Action:"action_discarded"` (+ corrected `Score`) | the goal was chalked off | **revert** the score down; un-weave the medallion |
| `penalty_outcome`, `Confirmed` false→true→true | a penalty resolving | resolve only on the confirmed emission |

Two different `Confirmed` semantics, and mixing them is exactly what bit us:
- the **score line** settles on `Confirmed !== false` (`contracts/normalize.ts`
  `parseScoreMessage`) — a running total counts unless explicitly held;
- a **discrete event** (penalty outcome, `isWireConfirmed` in `server.ts`)
  resolves on `Confirmed === true`.
Using `=== true` for a score, or `!== false` for a penalty, is a bug.

## The pattern: a check carries its own real bytes

The regression checks that now guard this **inline a verbatim region of the real
capture** and replay it through the real path. They depend on no gitignored file,
so they run anywhere, forever:

- `services/stands/src/dev/score-confirm-check.ts` (`npm run check:score-confirm`) —
  drives the real FRA–ESP seq617–642 through `normalize → broadcastToMatch →
  SettledScore → a real ws fan`. Asserts: provisional never shown, confirmed
  advances, the offside 0–3 never appears, `action_discarded` reverts to 0–2, the
  late-joiner snapshot and full-replay both end 0–2.
- `services/stands/src/dev/reactions-live-check.ts` (`npm run check:reactions-live`) —
  replays the real feed through `detectMoment/momentLifecycle`. Asserts: exactly
  one goal moment opens on the confirmed goal, the disallowed goal opens nothing,
  `possible` never supersedes an open window, a fan react lands in the reveal.

**When you touch feed handling, add or extend a check in this shape** — paste the
real protocol region that exercises your path, assert the honest outcome, prove it
goes RED before your fix and GREEN after.

## The corpus (captures on disk — gitignored, `fixtures/**/*.jsonl`)

Backed up outside the working tree at
`~/.claude/projects/-Users-ls-Documents-rooot/live-feed-corpus/`.

| Capture | Contains | Proves |
|---|---|---|
| `fixtures/live-fra-esp/scores-fraesp.jsonl` (768 lines) | 4 goal envelopes (2 `Confirmed:false`, 2 `true`), **2 `action_discarded`** — the offside reversal | the whole confirm/retract surface |
| `fixtures/live-fra-esp/odds-fraesp.jsonl` (14k) | the de-vigged 1X2 through the match | belief-cord + drift |
| `fixtures/live-eng-arg/scores-engarg{,-2h}.jsonl` (1,465 lines, 2 halves) | 9 goal envelopes, 6 confirmed, **0 overturns**; `Clock` carried as `Seconds` (not `Minutes`) | the confirm/settle path through a live **2-goal comeback** (ENG 1-0 → ARG 1-2, Jul 15) — the honest happy path; and the `Seconds`-only clock format `liveMinute` must handle |
| `fixtures/live-eng-arg/odds-engarg{,-2h}.jsonl` (32k) | in-play 1X2 across the comeback | in-play market swing, in-running flag |
| `fixtures/scores-20260703.jsonl` | 36 goal envelopes / 21 confirmed | goals from kickoff (loom weave-from-first) |
| `fixtures/scores-night-20260703.jsonl` | 126 / 76 | multi-match volume |

## Capture every live match — by default

Record every future live match so the corpus of messy paths grows:

```
npm run record -- --url <scores-sse> --token-file .secrets/txline-token.json --out fixtures/scores-<fixture>.jsonl
npm run record -- --url <odds-sse>   --token-file .secrets/txline-token.json --out fixtures/odds-<fixture>.jsonl
```

**Supervise the recorder.** Two `scripts/record.ts` processes from Jul 3 were
found still running on Jul 15 (orphaned, `ppid 1`), one having appended
`fixtures/odds-night-20260703.jsonl` to 1.06M lines — the same unbounded-growth
shape as the original `events.jsonl` incident. Start recorders in a named,
killable place; stop them at full time; check `ps` for orphans after each match.

## The four standing habits (from the post-mortem)

1. **Real feed, not replay.** "Verified on a clean replay" is not verified.
2. **Capture every match.** The corpus grows; regressions get caught before air.
3. **Chase silence.** A "0 of anything" during a live event is a defect until
   proven otherwise — never rationalized.
4. **Prove the live-critical path first.** The scoreboard and the goal pipeline
   are gate-zero; breadth comes after.
