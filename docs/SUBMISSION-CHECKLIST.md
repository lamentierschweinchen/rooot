# ROOOT — the submission checklist

*The one list. Time-ordered, owner-steps marked **OWNER**, everything else runs
in the product lane. Sources: the brief's requirements
(`docs/pitch/TECH-REQUIREMENTS-AUDIT.md` in the pitch worktree), the form copy
(`docs/pitch/SUBMISSION-COPY.md` there — paste-ready), `docs/RUNBOOK-jul18.md`.
Deadline: **Sun Jul 19, 23:59 UTC**. Hard rule: submit without an optional
field rather than late; nothing in the submission text depends on a live night
succeeding — the sealed semifinal carries the front page if one fails.*

## Already standing (verified Jul 18 — don't re-do, just don't break)

- [x] Live site at [rooot.club](https://rooot.club) — walked at phone width, console clean, smoke canary 5/0 against prod
- [x] TxLINE as live input, proven on three real match nights; captures committed; endpoints table in the tech doc
- [x] Tech doc carries the judges box, endpoints, devnet-pruning note, manifesto link, three-matches numbers
- [x] README quickstart runs the replay with no TxLINE token; three night-report commands, all verified
- [x] The seal survives the whistle (Codex triage shipped: 0–0 settles, FT reactions in the record, retries, restore-recovery)
- [x] The site learns full time from the wire itself (done-marks); gate locks post-whistle
- [x] Programme shelf: every sealed night stays reachable once a second night seals
- [x] Fly continuity config: `min_machines_running=1`, auto-start, suspend-not-stop
- [x] Repo history clean (no secrets, no fixtures) — verified by the pitch lane
- [x] Compliance: hackathon-new, team ≤ 3, no FIFA marks, no wagering

## NOW — arm the wire for BOTH matches (owner away at match time)

The token is verified valid to **Aug 2** and authenticates live (checked Jul 18
morning), so arming early is safe — the ingest idles on heartbeats behind its
own watchdog. One paste, one restart, covers tonight AND the final:

- [ ] **OWNER · run now, from the repo root** (reads the local token file; one
  secrets import so the machine restarts once):
  ```
  JWT=$(python3 -c "import json;print(json.load(open('.secrets/txline-token.json'))['jwt'])")
  APITOKEN=$(python3 -c "import json;print(json.load(open('.secrets/txline-token.json'))['apiToken'])")
  printf 'TXLINE_JWT=%s\nTXLINE_APITOKEN=%s\nTXLINE_ENABLE=1\nTXLINE_FIXTURES=18257865,18257739\n' "$JWT" "$APITOKEN" | flyctl secrets import --config services/stands/fly.toml
  ```
- [ ] Product lane verifies right after: `TXLINE ingest enabled for fixtures: 18257865, 18257739` in Fly logs, feedState healthy, snapshot restored

## Tonight — Sat Jul 18 · FRA–ENG · kickoff 21:00 UTC (23:00 local) — owner away; ops run unattended

- [ ] T−48 (22:12 local): pre-flight fires (cron armed) — recorders on, wire check, gate walk
- [ ] Full time (~22:50 UTC): verdicts at the whistle; `[sentiment] crystallized` in Fly logs ~30s later — the seal protocol runs: bake `demo-fraeng` → finals digest → cutover (`18257865` sealed + finalScore) → deploy → collect/scarf verify → night report
- [ ] Within the hour of the whistle: fresh-anchor capture — `node scripts/capture-anchor.mjs <sig> 18257865` + explorer screenshot into `docs/pitch/evidence/`
- [ ] Confirm the sealed FRA–ENG programme front-page + ENG–ARG on the shelf, phone width, logged-out
- [ ] Morning report to the owner: the night's numbers, the sealed programme, anything held for a taste call

## Sunday morning–afternoon — Jul 19 (all times UTC)

- [ ] **OWNER · morning — the demo video, built on /demo** (owner call, Jul 18:
  demo mode is the video's stage; record it once fully happy with what's live).
  ≤ 5:00, the brief's three beats: problem → walkthrough (`/demo` + the sealed
  rewatch — real pipeline, works forever) → how TxLINE powers the backend.
  `docs/FEATURE-SET.md` is the beat inventory; `VIDEO-SCRIPT.md` the script
- [ ] **OWNER:** upload (Loom or YouTube) → verify playback **logged-out in a private window** → paste the URL into `SUBMISSION-COPY.md`
- [ ] Morning: fresh canary smoke vs prod; full logged-out phone-width sweep; stands `/health` green; both sealed programmes + shelf reachable
- [ ] **OWNER · ~15:30: flip the repo public** (GitHub → Settings → visibility). Then verify logged-out: repo loads · `docs/SUBMISSION-tech-doc.md` renders · the /about page's repo link resolves
- [ ] **OWNER · ~16:00:** post the tweet; copy its URL into the form copy *(optional field — skip rather than slip)*
- [ ] **OWNER · ~16:30: SUBMIT** — Superteam Earn, "Submit Now" on the Consumer & Fan Experiences listing (owner's Earn login). Paste every field from `SUBMISSION-COPY.md`:
  - Title · project blurb — as drafted
  - Demo video — the morning's URL
  - Public repo — `https://github.com/lamentierschweinchen/rooot`
  - Live MVP — `https://rooot.club` (+ the `/demo` guided-path line if a second line fits)
  - Tech doc — the repo link to `docs/SUBMISSION-tech-doc.md`
  - TxLINE API feedback — as drafted (required)
  - Tweet URL (optional)
- [ ] **OWNER:** screenshot the submission confirmation
- [ ] After submit: no deploys except the final's seal — the site updating underneath is the design ("the World Cup final sealed inside")

## Sunday night — the final · ESP–ARG · kickoff 19:00 UTC

- [ ] **T−50 (18:10 UTC): START THE STREAM RECORDERS.** The one step missed on
  Saturday: no raw capture was recorded for FRA–ENG, so that match sealed as a
  record but has **no baked replay** — it is not rewatchable. The final must be,
  since "the World Cup final sealed inside" is the flagship claim. Two
  background recorders, token via `--token-file` only (never argv):
  ```
  mkdir -p fixtures/live-esp-arg
  npx tsx scripts/record.ts --url https://txline-dev.txodds.com/api/scores/stream --token-file .secrets/txline-token.json --out fixtures/live-esp-arg/scores-esparg.jsonl
  npx tsx scripts/record.ts --url https://txline-dev.txodds.com/api/odds/stream  --token-file .secrets/txline-token.json --out fixtures/live-esp-arg/odds-esparg.jsonl
  ```
  Verify both files grow before kickoff. (Armed as a cron in the agent session;
  confirm it actually ran.)
- [ ] Wire already armed for `18257739` (the NOW block above) — nothing to run
- [ ] 18:30: gates open by themselves — watch, don't touch
- [ ] Full time (~21:00): the same seal protocol → sealed final live on rooot.club by ~22:00
- [ ] Evidence sweep, 15 minutes: anchor `getTransaction` JSON + explorer screenshot into `docs/pitch/evidence/` (devnet prunes within days) · commit the final's night report
- [ ] **OWNER · if Earn allows editing before the deadline:** refresh the submission to "four real live matches" + the final's numbers; if not, the site already tells the story
- [ ] Everything above lands with ≥ 1h buffer before 23:59 UTC

## Review window — Jul 20–29 (judges evaluate)

- [ ] Fly service stays up through Jul 29 (**OWNER:** confirm billing/credits cover it — config already holds one machine warm)
- [ ] No force-pushes, no history rewrites, no visibility changes on the repo
- [ ] Site check every day or two: front page, one sealed rewatch, cabinet
- [ ] Nothing else: scarf assets are DAS-queryable indefinitely, Irys images outlive the window, every number regenerates from committed captures
