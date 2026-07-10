# ROOOT Live Game Post-Mortem

**Match:** France 2–0 Morocco, 9 July 2026
**Audience:** Engineering, design, product/owner
*(Authored by the Codex instance that led the live game-time response. Preserved verbatim for the coordinator handoff, 2026-07-10.)*

## Executive Summary

The match validated ROOOT's central product thesis but exposed that the prototype was not operationally ready as one complete live experience.

The match feed was strong. Prediction aggregation worked. Five fans immediately produced the exact proprietary signal we hoped for: the market strongly favored France while the crowd leaned Morocco. But fixture identity, cheering, pre-match odds, spatial semantics, live reactions, post-match resolution, persistence, and release coordination all failed or remained partial.

The core lesson is simple: we tested components extensively, but first tested the assembled live product against real people during the match itself.

## Timeline

| Local time | Event |
|---|---|
| 21:29 | First pre-match market tick captured: France 61.7%, draw 24.1%, Morocco 14.3%. |
| 21:31 | Anonymous live root, prediction, and cheer loop integrated, 29 minutes before kickoff. |
| 21:42 | Stadium corrected from stale Switzerland–Colombia content to France–Morocco. |
| 21:56 | Cross-end cheer visualization repaired, four minutes before kickoff. |
| 22:00 | Kickoff. |
| 22:05 | Pre-match/live market rendering repaired after kickoff. |
| 22:26 | Possession/territory orientation corrected during play. |
| 22:49 | France scored; the feed, score, ledger, market, and live state all followed correctly. |
| 23:40 | At full time, the historical-goal GOOOL eruption bug was fixed and deployed. |

This was excellent incident response, but it was also live integration happening throughout the user session.

## What The Crowd Told Us

The service still retains five locked predictions:

| Cohort | Prediction |
|---|---|
| Entire crowd | France 1.4–1.8 Morocco; 60% predicted a Morocco win |
| France end, n=2 | Both predicted France 2–1 |
| Morocco end, n=3 | All predicted Morocco; mean 1.0–2.33, modal 1–2 |
| Final result | France 2–0 Morocco |

The crowd gave Morocco a 60% outcome share while the market gave Morocco 14.3%, a **+45.7 percentage-point heart-versus-market gap**. France supporters were +38.3 points more optimistic than the market; Morocco supporters were +85.7 points more optimistic.

The sample is tiny, but the mechanism worked immediately. This is the first live proof of **BET vs BELIEVE vs HAPPEN** as a real ROOOT data product.

It also revealed a product question: every participant predicted in line with their allegiance. We successfully harvested passion, but no doubt or contrarian belief. The "choose your end, then predict" sequence may naturally prime tribal predictions.

## What Worked

- The Fly service stayed healthy for the whole match with no match-time restart. Its feed snapshot now reconstructs the complete 2–0 match.
- The retained history contains 401 market ticks, 764 possession spells, and 435 ledger messages.
- Rooting was once-per-anonymous-user, predictions locked at kickoff, and consensus segmented correctly by end.
- Late joining worked well enough to reconstruct score, phase, market history, pressure, events, and statistics.
- Design was distinctive and readable enough that users noticed genuinely semantic errors, such as the direction of territorial pressure.
- The team diagnosed and deployed fixes rapidly without taking the live service down.

## Failures And Root Causes

**Fixture identity had no single source of truth.** France–Morocco was separately hardcoded in the Vercel rewrite, gate, ground, stadium, loom, adapters, and service configuration. One missed default produced Colombia inside a France match. See `vercel.json:7` and `apps/web/public/stadium.html:314`.

**The live and demo paths were not behaviorally equivalent.** Several features worked only behind `DEMO` branches despite both modes exposing `window.__stands`. This was especially damaging because the architecture promised that swapping simulated crowd data for real crowd data would require no surface changes.

**Cheering reached the backend but was not legible across ends.** The original ground surface did not consume remote roar at all, while the terrace scaled genuine low-volume rates into nearly invisible changes. The visual repair landed, but a deeper connection-lifecycle risk remains.

A ground visit initially opens four WebSockets: parent crowd and stats adapters plus iframe crowd and stats adapters. One join currently sends about **1,604 messages / 0.85 MiB per socket**. More importantly, presence is a `Set<anonId>` rather than a connection count. Closing one iframe can remove the fan even while another connection remains open, potentially stopping stands broadcasts. See `services/stands/src/match-state.ts:116`.

**Pulse was alive on the server but absent from the live product.** Logs show at least six real drama windows through the first goal, all with zero reactions. The live terrace never subscribes to moments, the picker only sends reactions under `DEMO`, and its handler expects an obsolete `verdict` kind. See `apps/web/public/terrace.html:549`.

**We cannot recover cheer behavior.** Roar is deliberately short-lived, and the sentiment accumulator skipped this match because fixture `18209181` is missing from `services/stands/src/sentiment/teams.ts:7`. No sentiment file was crystallized or anchored. Predictions survive only because the Fly process has not restarted.

**The post-match promise remains partial.** Prediction verdicts are sent only to connected clients and are not replayed after reload. The local keepsake reduces resolution to exact/not-exact, losing the useful `outcome` verdict. The live cabinet still falls back to sample data when `__seat`/`__album` are absent. See `apps/web/public/cabinet.html:195`.

**Possession and territory remain conceptually conflated.** Orientation is now correct, but the overview's territorial-looking pitch split primarily uses `possessionPct`, falling back to territory only when possession is absent. The visual must represent one named metric, not alternate silently between two.

**Production is not canonical.** Production includes the historical-goal fix, but local `main` is ahead of `origin/main`. A new checkout could therefore redeploy an older experience. Production (https://rooot.club) also still advertises the finished France–Morocco match as "LIVE NOW."

## Before Tonight

Engineering release blockers:

1. Export the five prediction aggregates before any Fly restart, then persist predictions, rooted totals, roar totals, moments, and verdicts durably.
2. Establish one active-fixture manifest consumed by every surface and service. Make phase and final score dynamic.
3. Fix presence using per-anonymous-user connection reference counts, or preferably give the entire ground one shared transport.
4. Add an automated two-browser canary: opposite ends, prediction, cross-end cheering, lens switching, late join, goal replay, and full time.
5. Wire Pulse against the current moment schema or disable it honestly for tonight.
6. Make full-time resolution side-aware and preserve exact/outcome/wrong after reload.
7. Bring `origin/main`, the deployed Vercel build, and the visible build SHA back into agreement.
8. Remove claims about premium CALL, permanent keepsakes, or live Pulse anywhere they are not actually reachable.

Design blockers:

- Make one remote cheer unmistakably visible within one server tick without implying a large crowd.
- Label possession numerically and territorial pressure spatially; do not let one graphic impersonate both.
- Show prediction sample size wherever means or percentages appear.
- Design the real live moment prompt and split reveal around the server's feeling tokens.
- Give full time a truthful three-state verdict and an honest local-client cabinet.

## Release Gate

Tonight is ready only when two fresh mobile sessions can enter opposite ends, see the correct pre-match market, submit distinct predictions, observe each other's first cheer, switch every lens without losing presence, join after a goal without a false eruption, and receive the correct side-aware verdict at full time. Production must identify the same commit as `origin/main`.

## Conclusion

The evening did not show that ROOOT's idea is weak. Quite the opposite: five people were enough to produce a striking, proprietary crowd-versus-market story.

What failed was the connective tissue and our ability to observe it. The next game should be treated as one stateful product lifecycle, from pre-match through full time, with one fixture identity, one session, one transport, durable aggregates, and an explicit live acceptance test.
