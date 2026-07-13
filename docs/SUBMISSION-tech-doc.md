# ROOOT — Technical Submission

*TxODDS World Cup Hackathon on Solana · Consumer & Fan Experiences · live at [rooot.club](https://rooot.club) · draft, 2026-07-11*

## What ROOOT is

ROOOT is a free live companion for a World Cup match: pick an end, predict the score, cheer with your end, and keep what you lived — with the betting market's live belief rendered honestly beside the crowd's. It runs on TxLINE's real-time odds and scores (de-vigged win probabilities, Merkle-anchored by TxODDS on Solana) and produces a dataset nobody else has: what real fans believed, stamped against what the market believed at that second, resolved by what actually happened. There is no token and no wager; the chain is used for provenance, commitment, and settlement of the fan's record, on devnet throughout.

## The thesis, with the real numbers: BET vs BELIEVE vs HAPPEN

The market's number (BET), the crowd's belief (BELIEVE), and the result (HAPPEN) are three different things, and the gaps between them are the product (`docs/SENTIMENT.md`): the optimism gap (BELIEVE − BET), foresight (BELIEVE − HAPPEN), and the upset (BET − HAPPEN). ROOOT has now measured these on two real matches with real fans.

**July 9 — France 2–0 Morocco (fixture 18209181), the premiere.** Five fans entered, rooted, and locked score predictions before kickoff. The market opened France 61.7% / draw 24.1% / Morocco 14.3%. The crowd gave Morocco a 60% outcome share — a **+45.7 percentage-point heart-versus-market gap** on the Morocco side (`docs/POSTMORTEM-fra-mar-2026-07-09.md`). Per end: France rooters were +38.3pt more optimistic than the market, Morocco rooters +85.7pt (`docs/night-reports/18209181.md` §1). The market was right and the crowd was wrong — which is exactly the point: the gap is a real, measurable signal either way, and five fans were enough to produce it.

**July 10 — Spain 2–1 Belgium (fixture 18218149).** Eleven fans picked an end at lock (6 ESP / 5 BEL); four also locked a scoreline. The market opened Spain 60.6%. The Spain end ran a **+39.4pt optimism gap**; the crowd's modal prediction was **2–1 — the exact final score**, against a market that priced Spain at 60.6% at kickoff, for a market-improbability-weighted Foresight Alpha of 0.394 (`docs/night-reports/18218149.md` §1, §3). The single Belgium-end fan predicted a draw for their own side — a doubter, and the doubt was vindicated (§2). The belief curve itself was wild: 10 lead changes, 9 swings past 6pt, and a +65.9pt swing at the 87th-minute winner (§10). At the final whistle the service crystallized the match's SentimentRecord and anchored its hash on Solana devnet (transaction in §"What's on-chain" below).

Both samples are tiny and every report labels them so ("n=5 — an anecdote, honestly labeled, not a dataset"). The claim is not statistical significance; it is that the full pipeline — capture, stamp against the market, resolve against the wire, persist, anchor — works on real matches with real people, twice, and produced a legible proprietary signal both times.

## Architecture

One server, two buses. The market and the crowd travel as separate message families end to end, and meet only on screen, visibly distinct.

```
TxLINE SSE  /api/odds/stream + /api/scores/stream          (or fixtures/*.jsonl replay,
     │                                                      same parser, first-class)
     │  contracts/normalize.ts — de-vig, participant-order truth latch,
     │  the full 13-rung StatusId ladder, spells, ledger events
     ▼
services/stands — one Node process on Fly.io (app rooot-stands)
     ├── FEED BUS   contracts/feed.ts   market ticks · score · status · pressure spells · ledger
     ├── CROWD BUS  contracts/crowd.ts  root · predict · cheer (rate-decayed counts) · moments ·
     │                                  side-aware verdicts · fan serials · presence (refcounted)
     ├── /data volume — 30s atomic snapshot (predictions, roots, verdicts, serials) +
     │                  one SentimentRecord crystallized per match at full time
     └── relayer (src/relay.ts) — devnet memo writes: record anchors, receipts
     │
     │  one WebSocket per tab; both buses on it, never blended
     ▼
adapters  apps/web/public/*-adapter.js → window.__stands / __match / __loom / __stats
     ▼
surfaces  static HTML on Vercel (rooot.club): the gate · the ground · the loom (/live) ·
          the stadium · the terrace · the cabinet — all read the same adapters,
          all follow one fixture manifest (apps/web/public/fixture.json)
```

**The honesty seams are architecture, not style.** The laws in `AGENTS.md` are enforced by the shape of the system: market data and crowd data ride separate contracts (`contracts/feed.ts` vs `contracts/crowd.ts`) and are never converted into each other — the market has the number (a de-vigged probability), the crowd has counts (real taps, rate-decayed and clamped per fan, never dressed as a percentage). Nothing renders that did not happen: no fake players, no synthetic events, and replay mode runs recorded real matches through the exact live parser (`services/stands/src/ingest/replay.ts`) rather than simulating anything. When crowd sections are empty they are shipped as n=0, not synthesized (`contracts/sentiment.ts`).

**Durability.** The service snapshots match state (who rooted, who predicted what, verdicts already delivered, each fan's serial) to a mounted Fly volume every 30 seconds with atomic writes (`services/stands/src/snapshot.ts`, `services/stands/fly.toml` `[mounts]`), and crystallizes exactly one SentimentRecord per match at full time. Verified live after Spain–Belgium: exactly one sentiment file written at the full-time whistle, still exactly one when re-checked 17 hours later, with the rolling snapshot still actively persisting the next day (`docs/NOTES-esp-bel-2026-07-10.md` §"Full-time protocol closeout"). Restart continuity itself is exercised by a dedicated dev check that boots two real processes against the same data dir (`npm run check:restart-persistence` in `services/stands`). Roar deliberately resets to silence on restart — stale decay state is not resurrected.

**Verification is runtime, not build-green.** The release gate is an automated two-browser Playwright canary (`scripts/canary/`, seven flow steps: opposite-end entry, distinct predictions, cross-end cheer, presence across lens switches, goal-replay suppression on late join, side-aware full-time verdicts, live market render). Its production smoke mode is write-proof by construction — every outgoing WebSocket frame is intercepted, anything beyond a side-less hello is blocked before the network, and each run proves its own blocker by attempting a forbidden write and asserting it was stopped (`scripts/canary/README.md`). Full mode structurally refuses non-local hosts (an allowlist, not a blocklist). Alongside it, per-feature dev checks boot the real server in-process and assert against the real wire (`services/stands/src/dev/*-check.ts` — presence/cheer, restart persistence, verdict replay, fan serial, pulse fix, full replay). The reconnect storm that hung a real fan's page during Spain–Belgium was diagnosed from console evidence, fixed with a single-flight connect guard plus backoff discipline (`apps/web/public/*-adapter.js`), and got its own regression check (`scripts/canary/reconnect-check.mjs`).

## The data product: twelve stats, honestly reported

The owner's canonical list of proprietary stats (`docs/BACKLOG-full-version-and-deferred-ideas.md` §1): Optimism Gap, Doubter Index, Foresight Alpha, Courage-Adjusted Calls, Faith Under Fire, Roar Elasticity, Aftershock Half-Life, Held Breath Index, Pressure Without Reward, Match Uncertainty / Chaos Score, Mood Divergence, Attendance Gravity. All are BET vs BELIEVE vs HAPPEN made explicit; none require data ROOOT does not honestly have.

The night-report generator (`scripts/night-report.mjs`) computes them from a recorded match file and writes a dossier per match (`docs/night-reports/<matchId>.md` + a raw `.json` sidecar). It reads two real shapes — a crystallized SentimentRecord or a raw websocket capture — using the same formulas the server uses (`services/stands/src/sentiment/builder.ts`), so the two matches' numbers are genuinely comparable. Both captures are committed (`services/stands/captures/`), so a judge can regenerate every number:

```
node scripts/night-report.mjs services/stands/captures/premiere-fra-mar-18209181-919c9af.json
node scripts/night-report.mjs services/stands/captures/espbel-sentiment-18218149.json
```

**Five of the twelve compute today** on at least one real match: Optimism Gap, Doubter Index, and Foresight Alpha on both matches; Pressure Without Reward (France held 30.8% danger-share of its spells and scored twice; Morocco 18.2% and did not) and the Match Uncertainty components (volatility, swings, lead changes, conviction, Upset Index) from the tick data. **The other seven print NOT COMPUTABLE with the specific missing field named** — the roar time series is deliberately short-lived so Faith Under Fire / Roar Elasticity / Aftershock Half-Life lack a per-minute curve; no react moments were felt live so Mood Divergence is empty; join timestamps are not persisted so Attendance Gravity has no series; the calls mechanism was not live so Courage-Adjusted Calls is a zeroed stub. Nothing is interpolated; a stat that cannot be computed says so and why.

**NEXT GOAL closes the biggest gap.** During live play a fan calls which end scores next (or "no more goals"); the server — not the client — stamps the live de-vigged market at the moment of the call; the call resolves on the next real goal or at full time, and both the crowd split (always with n) and per-fan verdicts persist into the SentimentRecord. This is the feeder for Courage-Adjusted Calls and a moving (not just pre-match) BELIEVE curve. As of July 11 the server mechanism is built, restart-durable, and dev-verified on the `tonight-gate` branch with its own in-process check suite (`services/stands/src/dev/next-goal-check.ts`); the client seam is specified for the design lane (`archive/design-docs-consumed/design/HANDOFF-2026-07-10-tonight-data-shapes.md` §7). It is not in production yet; it is scheduled to be experienced live at the next fixture.

## What's on-chain, and why

No token, no wager. The chain does three jobs: provenance (the data really happened), commitment (a claim on the future is stamped before the future arrives), settlement (the record resolves and is yours). Devnet throughout.

| Write | Status today | Evidence |
|---|---|---|
| **SentimentRecord anchor** — SHA-256 of the crystallized match record in a memo tx at full time | **Live in production.** Spain–Belgium's record (hash `1a3e5763…49bf6b`) anchored at the whistle | devnet tx `3YMn98FgPpB7CBFC9ViVoVxw2tcg7A5CMpcJvYALjdAYTHtYF46sGjRC9QqmX2rsBhgQyX7p7UVPfcvie1RBzBW9` (`docs/night-reports/18218149.md`; mechanism `services/stands/src/relay.ts` `anchorRecordHash`) |
| **YOUR SEAT** — passkey wallet (WebAuthn-PRF → ed25519, no seed phrase) and relics minted to the fan's own key while the service pays (Metaplex Core via Umi + Irys) | **Built and devnet-proven; landing this week.** Reconciliation branch `seat-reconcile` carries the claim → mint → album loop with an end-to-end dev proof, including idempotent re-claim and a full-time honesty gate that refuses to mint an unfinished match | proven devnet asset `7gWZaRHGJTqhK17BhmqEvJMa1PRfoayCJipFfKc2mkjK` (`archive/docs-consumed/docs/HANDOFF-2026-07-10-coordinator-session.md` §5); proof driver `services/stands/src/dev/prove-claim-mint.ts` (seat-reconcile worktree) |
| **Conviction receipts** — a fan's rare call relayer-signed into a devnet memo (claim + minute + the market's triple at that second), walletless | **Relayer built, receipt proven on devnet; the in-game trigger/UI is not built** — NEXT GOAL is the concrete v1 of this loop and persists into the anchored record | `services/stands/src/relay.ts` `relayCall`; status per `docs/MECHANISMS.md` §5, §"What's WIRED" |
| **Market provenance** — TxLINE's own Merkle anchors referenced from ROOOT records, so the odds survive the feed | **Validation path exercised** against the live API: a two-level branch (subTreeProof + mainTreeProof) to the on-chain root for a real tick | specimen `fixtures/provenance/messi-goal-tick-proof.json` (`docs/DATA.md` §TxLINE) |
| **Attendance root** — Merkle root of attendee anonIds per match ("I'm in the crowd photo") | **Designed, not live** | shape in `contracts/relic.ts` (`attendeeRoot`) |

Cheers and reactions stay app-layer on purpose: a tap is not a transaction, and pretending otherwise would break the honesty law before it broke the fee budget.

## Honest limitations

- **The samples are anecdotes.** n=5 and n=4 locked predictions (11 rooted) across the two live matches. Every surface and report labels n; the claim is a working mechanism, not a dataset.
- **Devnet only**, by rule (`AGENTS.md` law 3/5). Nothing here moves value.
- **YOUR SEAT and NEXT GOAL are not in production yet.** Both are built and dev-verified on branches (`seat-reconcile`, `tonight-gate`) with devnet proof and in-process check suites respectively; until merged and deployed, the live product's chain writes are the sentiment anchor.
- **The Pulse (react moments) has failed to reach fans twice.** The server detects drama windows, but at the premiere the live surfaces never subscribed, and at Spain–Belgium no moment message reached the room — the same shape both nights, documented rather than patched over (`docs/POSTMORTEM-fra-mar-2026-07-09.md`; `docs/NOTES-esp-bel-2026-07-10.md` §Pulse). Mood Divergence stays NOT COMPUTABLE until this is fixed honestly.
- **Seven of the twelve stats do not compute yet** (named reasons in each night report — mostly missing time series the service deliberately does not fake).
- **The premiere was operationally rough.** Fixture identity, cheer legibility, and post-match resolution all failed or were partial on July 9; the postmortem is in the repo verbatim, and the fixes it demanded — one fixture manifest, refcounted presence, durable volume persistence, three-state side-aware verdicts, the canary — are what shipped before July 10.
- **A product question is open, not hidden:** every fan so far predicted in line with their allegiance. "Choose your end, then predict" harvests passion but no contrarian belief; the Doubter Index has one honest data point.
- **The TxLINE free tier ends with the hackathon** (July 19, 23:59 UTC), which is why every relic and record carries its own provenance (Merkle refs + captured windows) rather than a live-feed dependency.

## Built with

ROOOT is built by a small pipeline of Claude agents under a human owner who steers by verdicts on rendered frames. The repo's operating law (`AGENTS.md`) gives each lane one directory and one writer, with the wire contracts (`contracts/`) frozen and coordinator-only; work runs spec → implementer → spec-and-quality review → whole-branch review (specs and plans under `docs/superpowers/`), and the whole-branch reviews have caught what per-task reviews missed, including two honesty violations that died before merge. Verification is required at runtime, not at compile: the canary suite, the in-process dev checks, and screenshot evidence gate every merge, and the two live match nights ran with a dedicated ops instance on a written runbook, producing the postmortem and night notes cited throughout this document.
