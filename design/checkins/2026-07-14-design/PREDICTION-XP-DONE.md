# Prediction/XP UX — DONE, ready to integrate (design lane → coordinator)

Built on the reconciled branch (`478b2df` + rig evidence). One surface: **terrace.html**.
Rig-verified on ARG–CPV, console clean. Ready for the 14:00 integration.

## What changed (terrace.html only)
- **Footer `XP` → `POINTS`** (label only; the mechanic/counter is unchanged; verdict
  reads "+10 POINTS").
- **The crowd/market box → the Bauhaus plate** (owner-approved concept):
  - **THE CROWD** = solid counted blocks — prediction split % (from `consensus.all.outcome`
    tallies), expected score (`consensus.all.mean`), **HEART v HEAD** = % of rooted fans who
    call their own team to win (computed from `consensus.byRoot.{home,away}.outcome`).
  - **THE MARKET** = a live donut wheel (de-vigged 1X2), redrawing as odds move, + **drift
    since kickoff** (baselined at the first market read).
  - Team inks throughout; the centre rule is the crowd/market boundary — never blended.

## Honesty
The sim/demo path carries no per-fan predictions, so the split + heart-v-head **hide** there
(`.pc.lite`) and only the aggregate score shows — never a fabricated split. The full plate
needs real fans (live/rig). Pre-KO: `THE CROWD IS ARRIVING` overlay + empty wheel + `—`.

## Seams — NONE touched
`revealFromWire`, the `case 'sentiment'` seal handler + Collect, `fixtureInfo` resolution,
`live-default` — all untouched. `ccUpdate`/`marketUpdate` keep their signatures as the wire's
render targets; I changed only how they render. `#crowdcall` wrapper + its opacity toggling
preserved, so the moment/reveal flow is intact. **fixture.json untouched** — I verified on
the rig via `?match=18175918` + the rig's `REPLAY_FIXTURE` env, no cutover.

## Evidence (design/checkins/2026-07-14-design/)
- `33-terrace-rig-live.png` — **ARG–CPV rig, real stands service over WS**: crowd plate from
  real `consensus` (split/score/heart), market wheel **86% ARG from the real replay odds** +
  drift, console clean, team colours adapted (ARG blue). The full pipeline.
- `31-terrace-plate-built.png` — full plate against the exact live-wire contract shape.
- `32-terrace-demo-lite.png` — sim path, honest degrade (aggregate only).

FRA–ESP tonight: the same plate, real fans → the rich crowd; real odds → the wheel.
