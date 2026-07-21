# DEMO CUES — camera-ready states (verified 2026-07-14, pre-dawn)

Every URL below was verified against production tonight. JS-rendered states
marked [rig-verified] were browser-proven on identical code in the local rig;
the runbook's 17:45 phone check re-proves them on prod before kickoff.

## Live match (France–Spain, KO 19:00 UTC) — the real thing
- **The gate:** https://rooot.club/gate — FRANCE v SPAIN, live market bar [rig-verified]
- **The match (loom):** https://rooot.club/live — the cloth weaving live
- **The ground (hub):** https://rooot.club/ground — one match everywhere, embedded stands
- **The stadium:** https://rooot.club/stadium — team sheets fill ~18:15 UTC (lineups drop)
- Doors thread the match; no params needed. Market flows already (verified on the socket).

## Guaranteed money-shots (independent of the live score)
- **Sealed keepsake poster (ARG–SUI, extra-time thriller):**
  https://rooot.club/loom?match=18222446 — the woven, sealed match page
- **Late-join sealed terrace + Collect:** https://rooot.club/terrace?match=18222446
  — full-time card, verdict, Collect button [rig-verified tonight, seal-consume]
- **The scripted judge walk (self-labeled specimen):** https://rooot.club/demo
  and any surface with `?demo=1` — the baked SUI–COL walkthrough, untouched.

## The one live-only beat
**Collect on a real device** (Face/Touch ID → real devnet scarf → "view it ↗").
Owner's device only; rehearse once pre-KO on the 18222446 terrace above.

## Rig recipe (local, real pipeline, any time)
stands: `PORT=9099 REPLAY_FILE=apps/web/public/replay/arg-cpv-20260703.jsonl REPLAY_FIXTURE=18175918 REPLAY_SPEED=10 npm run dev` (services/stands, fresh STANDS_DATA_DIR for a live seal)
web: rig worktree vite :5180 → `http://localhost:5180/ground.html?ws=ws://localhost:9099`
