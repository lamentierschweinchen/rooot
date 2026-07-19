# Handoff — the final (ESP–ARG, 18257739)

*Paste this whole file as the first message to the new match-ops instance.
Written 19 Jul 17:45 UTC. Kickoff **19:00 UTC** (21:00 local), gates 18:30 UTC.
Submission deadline 23:59 UTC.*

---

You are the match-ops instance for ROOOT tonight. A separate session owns the
product code and the submission page — **do not edit `apps/web/public/*` or
`services/stands/src/*` unless something is genuinely broken and you say so
first.** Your job is the night: capture it, seal it, prove it, report it.

Read `AGENTS.md`, then `docs/RUNBOOK-jul18.md` (the seal protocol) and
`docs/SUBMISSION-CHECKLIST.md` (tonight's block).

## State you are inheriting

- **The wire is already armed.** Fly secrets carry `TXLINE_ENABLE=1` and
  `TXLINE_FIXTURES=18257865,18257739`. Confirm with
  `flyctl logs -c services/stands/fly.toml --no-tail | grep -i txline` →
  expect `TXLINE ingest enabled for fixtures: 18257865, 18257739`.
- **The service is v53+** and carries yesterday's seal rework: verdicts fire at
  the whistle, the record crystallises ~30s later (after the full-time reaction
  window), retries with backoff, and refuses to invent a score it does not know.
- **Third place (18257865) is sealed** at FRA 4–6 ENG — record hash
  `8a1cac7d13fe…`, anchored, evidence in `docs/pitch/evidence/`. It has **no
  replay** (no capture was recorded), which is why step 1 below matters.
- The site flips phases on its own clock. Gates open by themselves at 18:30 UTC.

## 1 · NOW (T−50) — start the recorders, before anything else

Without a capture there is no baked replay, and "the World Cup final sealed
inside" is the submission's flagship claim. Two background recorders; the token
goes via `--token-file` only, **never in argv or logs**:

```
mkdir -p fixtures/live-esp-arg
npx tsx scripts/record.ts --url https://txline-dev.txodds.com/api/scores/stream --token-file .secrets/txline-token.json --out fixtures/live-esp-arg/scores-esparg.jsonl
npx tsx scripts/record.ts --url https://txline-dev.txodds.com/api/odds/stream  --token-file .secrets/txline-token.json --out fixtures/live-esp-arg/odds-esparg.jsonl
```

Verify after 60s that both files exist and `wc -l` is growing, and again after
kickoff that lines carrying `"FixtureId":18257739` are arriving. Keep them
running to the final whistle.

## 2 · Pre-flight (T−30)

- `curl -s https://rooot-stands.fly.dev/health` — up, sane uptime.
- Fly logs: feedState connected, no errors.
- `https://rooot.club/gate` at 390px — must normalise to `?match=18257739`,
  read ESP v ARG, and be locked until 18:30 UTC, then flip by itself.
- A 30s spectator socket on `wss://rooot-stands.fly.dev/?matchId=18257739`
  (use `scripts/canary/node_modules/ws`) — expect fixtureInfo, odds, and the
  lineup once it lands.

## 3 · Full time (~21:00 UTC) — the seal

Follow `docs/RUNBOOK-jul18.md` "Full time — the seal". Watch for
`[sentiment] … seal pending (full-time)` then `[sentiment] crystallized …`
about 30 seconds later. Capture the record hash and the anchor signature.

Then, in order:

1. **Anchor evidence, within the hour** (devnet prunes fast):
   `node scripts/capture-anchor.mjs <txSig> 18257739` → writes
   `docs/pitch/evidence/`. Screenshot the explorer page too.
2. **Bake the replay** from tonight's captures — `scripts/bake-engarg.ts` is the
   template; output `apps/web/public/plate/demo-esparg.js`, global
   `__DEMO_ESPARG`. Extend the loader sites that currently hard-bind the replay
   branch to `demo-engarg.js` so `?match=18257739` picks the new file.
3. **Finals digest**: `cd scripts/canary && node emit-finals.mjs --web http://localhost:5173 --match 18257739` (vite running).
4. **Cutover with `replay: true`** — edit `scripts/cutover-fixture.mjs`
   MATCHDAY for `18257739` (`status:'sealed'`, the real `finalScore`,
   `replay:true`), run `node scripts/cutover-fixture.mjs 18257739`, review the
   diff. This one SHOULD repoint the front door and `/live` at the final.
5. **Deploy and VERIFY IT LANDED.** `npx vercel deploy --prod`, then curl the
   site for the new content. The CLI has reported success without deploying
   twice this weekend, and `flyctl deploy` did it once — **always confirm by
   fetching the artifact or checking `flyctl releases`, never by the CLI's word.**
6. **Night report**: `node scripts/night-report.mjs <the new sentiment record>`;
   commit the dossier. Check the harvest fields are populated — points,
   engagement, scorelines, roarSeries, nerveDrift.
7. Walk the sealed programme at 390px and screenshot it.

## 4 · Report

Write the owner a short report: the night's numbers, what the data shows, the
anchor signature, and anything you held for a taste call. He is submitting
around 16:30 UTC, before the final — so tonight's seal lands *underneath* an
already-submitted entry. That is by design; nothing about the submission
depends on tonight going perfectly.

## Hard rules

- `.secrets/` never enters git, logs, or argv. Devnet only.
- Never commit `fixtures/*.jsonl` or `node_modules`.
- Do not fabricate anything. If the wire fails, the honest degrade is automatic —
  say what happened plainly and seal what is real.
- A restart mid-match loses live crowd state: **do not deploy the service during
  the match** unless something is genuinely broken.
