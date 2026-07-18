# Match-night runbook — Jul 18 (FRA–ENG, third place) · Jul 19 (ESP–ARG, the final)

*Kickoffs: Sat 21:00 UTC / 23:00 CEST · Sun 19:00 UTC / 21:00 CEST. Gates open −30min.
The surfaces flip phases by themselves (matchday.js). This runbook is the SERVICE + seal work.*

## T−45 — pre-flight (Sat ~22:15 CEST · Sun ~20:15 CEST)

```
curl -s https://rooot-stands.fly.dev/health          # up, sane uptime
curl -s https://rooot.club/fixture.json | head -3    # manifest serving
# wire alive for tonight's fixture (in-process token read; prints latest snapshot head):
node -e 'import("node:fs").then(async({readFileSync})=>{const t=JSON.parse(readFileSync(".secrets/txline-token.json","utf8"));const h={Authorization:`Bearer ${t.jwt}`};if(t.apiToken)h["X-Api-Token"]=t.apiToken;const r=await fetch("https://txline-dev.txodds.com/api/scores/snapshot/18257865",{headers:h});console.log(r.status,(await r.text()).slice(0,160))})'
```

- [ ] **Fly ingest armed for tonight** (owner runs it — flyctl secrets is permission-gated for the agent):
  `flyctl secrets set TXLINE_ENABLE=1 TXLINE_FIXTURES=18257865,18257739 --config services/stands/fly.toml`
  (sets both remaining fixtures; the machine restarts; re-check /health after.)
  Then: `flyctl logs --config services/stands/fly.toml | grep -i txline` → expect "TXLINE ingest enabled for fixtures: 18257865,18257739".
- [ ] Phone check at ~22:35 CEST: rooot.club/gate shows GATES OPEN + real pre-match odds on the strip once the wire ticks.
- [ ] **Start the local recording** (the bake's raw material — run from repo root, keep it running to the final whistle; new terminal):
  `npm run record -- --url "https://txline-dev.txodds.com/api/odds/stream?fixtureId=18257865" --token-file .secrets/txline-token.json --out fixtures/live-fra-eng/odds-fraeng.jsonl`
  `npm run record -- --url "https://txline-dev.txodds.com/api/scores/stream?fixtureId=18257865" --token-file .secrets/txline-token.json --out fixtures/live-fra-eng/scores-fraeng.jsonl`
  (Exact stream URL shape: match what scripts/record.ts expects — see scripts/txline-subscribe.ts step 7. If a stream drops, restart with `-2h` suffixed filenames; the bake merges parts.)

## During the match

- Watch, cheer, film. The site is on its own clock; the room fills from the wire.
- Keep an eye on: `flyctl logs …` for ingest errors; the ground's plates moving; NEXT GOAL windows resolving.
- If the wire drops: the honest degrade is automatic (no fake continuity). Restart recorders if needed. Never fake anything after the fact.

## Full time — the seal (in order)

1. **Verdict + record on the service** (should be automatic at FT):
   - fans got side-aware verdicts + Collect on the card
   - `flyctl logs … | grep -i "sentiment\|crystal"` → one SentimentRecord written + anchored
   - TIMING (Codex triage, Jul 18): verdicts land AT the whistle, but the record
     seals **~30s after** — `[sentiment] … seal pending (full-time)` first, then
     `[sentiment] crystallized …` once the FT reaction window closes. Don't panic
     in the gap. `seal attempt N failed` retries by itself (2s/10s/30s); a
     `seal FAILED after …` line means restart the machine — restore-recovery
     re-seals from the persisted final score (`flyctl machine restart …`).
   - the site flips to FULL TIME by itself the moment any fan's page sees the
     whistle (matchday done-marks) — the cutover deploy below is still what
     makes it durable for fresh visitors.
2. **Bake the replay** (10-minute job): copy the template and point it at tonight:
   `cp scripts/bake-engarg.ts scripts/bake-fraeng.ts` → edit the header block only:
   FIXTURE_ID `18257865`, input files `fixtures/live-fra-eng/*.jsonl`, output
   `apps/web/public/plate/demo-fraeng.js`, global `__DEMO_FRAENG`, release gates:
   terminal FULL_TIME + tonight's real final score. Run `npx tsx scripts/bake-fraeng.ts`.
   NOTE: the adapters' replay branch is hard-bound to the baked fixture (loom-adapter/stats-adapter
   `REPLAY` + demo-engarg load sites in woven-loom.html/stadium.html/terrace demo block) — extend the
   loader `replay ? ['plate/demo-engarg.js', …]` sites to pick the file by `?match=` (18257865 → demo-fraeng.js).
3. **Finals digest** (scorers + market open→close for the sealed stands):
   `cd scripts/canary && node emit-finals.mjs --web http://localhost:5173 --match 18257865`
   (vite must be running; commit `apps/web/public/plate/finals/18257865.json`.)
4. **Cutover** — flip the schedule so the site's front door is tonight's sealed match:
   edit `scripts/cutover-fixture.mjs` MATCHDAY: `18257865` → `status:'sealed', finalScore:{home:H,away:A}, replay:true`,
   then `node scripts/cutover-fixture.mjs 18257865` (also repoints /live), review diff.
5. **Deploy**: `vercel --prod` from repo root. Walk prod at 390px: landing FULL TIME posture for FRA–ENG,
   /live opens the sealed cloth, stands plates carry the night, stadium settles right.
6. **Collect + scarf**: real-device collect; the mint captures the SCARF (goals woven). Verify the
   album shows it (the DAS poll gives it ~40s max).
7. **Night report**: `node scripts/night-report.mjs <capture>` per its README; commit the dossier.
8. **Tech-doc explorer links → tonight's fresh anchors** (pitch lane, 17 Jul: the Jul-10 ESP–BEL
   anchor tx is already pruned from public devnet RPC history — dead links read as fake to a judge).
   Swap the doc's cited txs for tonight's anchor sig before submitting.

## Sunday deltas (the final)

- Same flow for `18257739` (ESP–ARG, kickoff 19:00 UTC). FT ~21:00 UTC → seal → deploy by ~22:00.
- Then the submission (form: live link, repo, tech doc, night reports, devnet explorer links, video)
  with ≥1h buffer before 23:59 UTC. docs/SUBMISSION-tech-doc.md is current as of Jul 17.
- If the live wire fails catastrophically mid-final: the site stays honest (UPCOMING→whatever truth we
  have), submit with the third-place match sealed + ENG–ARG; note the failure plainly in the form.

## Known safety nets

- Stands survives restarts (volume snapshots + seal-on-join); collect is instant-local even if the
  service dies; mints are idempotent per (pubkey, matchId).
- Canary (software rehearsal): `CANARY_MDNOW=<in-window ISO> node scripts/canary/run.mjs --web … --ws … --mode full --match 18257865`.
