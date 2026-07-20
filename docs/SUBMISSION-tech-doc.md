# ROOOT — Technical Documentation

*TxODDS World Cup Hackathon · Consumer & Fan Experiences · 2026-07-19*

| | |
|---|---|
| Live product | [rooot.club](https://rooot.club) — free, no account, no wallet |
| The case in one page | [rooot.club/board](https://rooot.club/board) |
| Guided walkthrough (no server) | [rooot.club/demo](https://rooot.club/demo) |
| What it collects, per mechanism | [rooot.club/features](https://rooot.club/features) |
| Data source | TxLINE (odds + scores SSE), Solana devnet |

## 1 · Overview

ROOOT is a live match companion. A fan picks an end, calls a scoreline with a
conviction level, cheers, and predicts in play ("which end scores next"). Each
claim is stamped server-side with TxLINE's de-vigged market price at the moment
it is made, resolved against the wire at full time, and written into one
per-match record whose hash is anchored on Solana devnet.

The output is a dataset: per fanbase, what was believed, against the market price
at that second, resolved by result. No token, no wager, no stake.

The prototype was alpha-tested across five live World Cup matches, including the
final, proving the mechanism end to end.

## 2 · Architecture

One service, two message buses. Market data and crowd data are separate
contracts end to end and are never converted into each other.

```
TxLINE SSE  /api/odds/stream + /api/scores/stream        (or fixtures/*.jsonl replay,
     │                                                    same parser)
     │  contracts/normalize.ts — de-vig · participant-order latch ·
     │  13-rung StatusId ladder · pressure spells · ledger events
     ▼
services/stands — one Node process, Fly.io (app rooot-stands)
     ├── FEED BUS   contracts/feed.ts    market ticks · score · status · spells · ledger
     ├── CROWD BUS  contracts/crowd.ts   root · predict · cheer · next-goal calls ·
     │                                   moments · verdicts · serials · presence
     ├── /data volume — 30s atomic snapshot; one SentimentRecord per match at FT
     ├── relay.ts — devnet memo writes (record anchors, call receipts)
     └── seat/ + mint/ — passkey seat → Metaplex Core mint (Umi + Irys), service-paid
     │
     │  one WebSocket per tab, both buses multiplexed
     ▼
adapters  apps/web/public/*-adapter.js → window.__stands / __match / __loom / __stats / __seat
     +    matchday.js  — one clock: wire-pulled kickoffs derive each fixture's phase
     |                   (UPCOMING → GATES_OPEN at KO−30m → LIVE → FULL_TIME)
     +    fan-record.js — one reader for the fan's record, one scoring formula
     ▼
surfaces  static HTML on Vercel: gate · ground · woven-loom (/live) · stadium ·
          terrace · cabinet · showcase (/demo) · features · board
```

| Component | Stack |
|---|---|
| Ingest + aggregation | Node 20, TypeScript, native SSE parsing |
| Transport to client | one WebSocket per tab, both buses multiplexed |
| Surfaces | static HTML/CSS/vanilla JS, no framework, phone-first |
| Persistence | Fly volume, atomic snapshot every 30s |
| Chain | Solana devnet — SPL Memo (anchors), Metaplex Core + Umi + Irys (mints) |
| Identity | WebAuthn PRF → ed25519 keypair, no seed phrase, no custody |
| Hosting | Vercel (surfaces), Fly.io (service) |

## 3 · TxLINE integration

| Endpoint | Use |
|---|---|
| `POST /auth/guest/start` → on-chain `subscribe` → `POST /api/token/activate` | guest JWT, Solana-signed activation; bearer + `X-Api-Token` on every call |
| `GET /api/fixtures/snapshot?competitionId=72&startEpochDay=…` | schedule; kickoffs feed the site's matchday clock |
| `GET /api/odds/snapshot/{fixtureId}` · `GET /api/odds/stream` (SSE) | 1X2 StablePrice vectors → de-vigged in `contracts/normalize.ts` |
| `GET /api/scores/snapshot/{fixtureId}` · `GET /api/scores/stream` (SSE) | goals (confirmation ladder), status, lineups, scorer names, cards, VAR, possession-danger spells |
| `GET /api/odds/validation` | Merkle proof (subTreeProof + mainTreeProof) to the on-chain root; specimen at `fixtures/provenance/messi-goal-tick-proof.json` |

**Parsing notes.** 42 distinct `Action` types observed live. The full 13-rung
`StatusId` ladder is implemented (1 PRE · 2 H1 · 3 HT · 4 H2 · 5 FT-in-90 · 6
end-of-90 · 7 ET1 · 8 ET-break · 9 ET2 · 10 FT-in-ET · 11 end-of-ET · 12
penalties · 13 final seal); `GameState` is stale relative to `StatusId` and is
ignored. The odds envelope carries no home/away field — `PriceNames` is
participant order — so a participant-order truth latch is derived from the
scores wire and threaded through every source (`sniffParticipant1IsHome`).
Goals arrive as a re-emission ladder (unconfirmed → confirmed → +GoalType
+PlayerId) keyed on a stable event `Id`.

**Replay.** Recorded streams replay through the same parser
(`services/stands/src/ingest/replay.ts`), so every surface runs after the feed
ends. Replay is a first-class mode, not a mock.

## 4 · Data model

**Crowd messages** (`contracts/crowd.ts`): `root {anonId, matchId, side, atMs}` ·
`predict {anonId, matchId, home, away, marketAtPredict:{h,d,a}, conviction, atMs}` ·
`cheer {anonId, side, n, atMs}` (rate-limited server-side; granted ≠ attempted) ·
`nextGoal {anonId, end|none, marketAtCall, crowdAtCall, atMs}` · `react
{anonId, momentId, emoji, side}`.

**SentimentRecord** (`contracts/sentiment.ts`), one per match, crystallized at
full time:

| Block | Contents |
|---|---|
| `market` | open/close triples, per-phase values, every swing ≥6pt with minute, lead changes, volatility, conviction mean/max, tick count |
| `fans` | rooted counts per end, scoreline histogram, consensus with n, optimism gap per end, doubters, next-goal calls with market + crowd at call time and resolution |
| `feel` | per-moment emotion histograms, roar series (~30s samples) |
| `engagement` | fans, granted cheers, watch-minutes, arrivals in 5-minute buckets, points by serial |
| `provenance` | record hash, network, anchor tx signature, capture window, TxLINE Merkle refs |

Identity in the record is a per-match serial, never a name.

## 5 · Derived statistics

Twelve specified (`docs/BACKLOG-full-version-and-deferred-ideas.md` §1). Five
compute today on live data: Optimism Gap, Doubter Index, Foresight Alpha,
Pressure Without Reward, Match Uncertainty (volatility, swings, lead changes,
conviction, Upset Index). Seven are blocked on a named field and print
`NOT COMPUTABLE` with that field — nothing is interpolated. A roar series is now emitted (~30s cadence) but is sparsely populated, so Faith
Under Fire, Roar Elasticity and Aftershock Half-Life remain NOT COMPUTABLE in
every record to date — a populated per-minute curve is what they still need.

Formulas live in `services/stands/src/sentiment/builder.ts`; the night-report
generator reads either a crystallized record or a raw capture using the same
formulas, so matches are comparable. All five captures are committed:

```
node scripts/night-report.mjs services/stands/captures/premiere-fra-mar-18209181-919c9af.json
node scripts/night-report.mjs services/stands/captures/espbel-sentiment-18218149.json
node scripts/night-report.mjs services/stands/captures/engarg-sentiment-18241006.json
node scripts/night-report.mjs services/stands/captures/fraeng-sentiment-18257865.json
node scripts/night-report.mjs services/stands/captures/esparg-sentiment-18257739-corrected.json
```

**Points** (`apps/web/public/fan-record.js`, folded server-side in `services/stands/src/server.ts`): stamped prediction 25 ·
granted cheer 1 (cap 300) · reaction 2 · presence minute 1 (cap 130) · full time
exact score 200 or correct result 75, multiplied by the conviction dial (max ×2).
Client and server run the same constants (the server's `CONV_MULT` is kept in
lockstep with `fan-record.js`) over deliberately different inputs — the client
counts its own taps and visible-tab minutes, the server counts granted cheers,
distinct-moment reactions and presence minutes. The sealed record is authoritative.

## 6 · Live match results

Market columns report the recorded odds window. In the final, odds ticks stop
during the 92′ red-card/VAR sequence, before the 105′ winner, so the recorded
close is not a settled closing line.

| Match | Fixture | Market open → close | Ticks | Swings ≥6pt | Lead changes | Room | Measured |
|---|---|---|---|---|---|---|---|
| FRA 2–0 MAR · 9 Jul | 18209181 | FRA 61.7% → 98.0% | 401 | 4 | 0 | n=5 (2/3) | MAR end +85.7pt, FRA end +38.3pt optimism gap |
| ESP 2–1 BEL · 10 Jul | 18218149 | ESP 60.6% → 96.8% | 3,678 | 9 | 10 | 11 rooted, n=4 | modal call 2–1 = exact result; Foresight Alpha 0.394 |
| ENG 1–2 ARG · 15 Jul | 18241006 | ARG 31.1% → 96.4% | 3,520 | 10 | 28 | 4 rooted, n=1 | ENG end +64.6pt; +74.2pt swing at 91′ |
| FRA 4–6 ENG · 18 Jul | 18257865 | ENG 21.9% → 93.5% | 3,292 | 11 | 11 | 7 fans | full engagement harvest: 9 cheers, 10 watch-min, 5 arrival buckets |
| **ESP 1–0 ARG · 19 Jul — the final** | 18257739 | ESP 42.2% → 5.7% by 92′ | 4,492 | 9 | 11 | 21 fans, 11 rooted | 89 cheers, 465 watch-min, 14 arrival buckets |

## 7 · On-chain

Devnet throughout. Three jobs: provenance, pre-outcome commitment, settlement of
the fan's record.

| Write path | Status | Reference |
|---|---|---|
| **SentimentRecord anchor** — SHA-256 of the record in an SPL Memo at full time | Live. Disk-driven backfill (boot sweep + 60s) heals any lost signature write-back | `relay.ts:anchorRecordHash`; `server.ts:backfillAnchors`; check: `anchor-durability-check.ts` |
| **Scarf mint** — Metaplex Core asset to the fan's passkey-derived key, service-paid, image is the fan's own 788×2034 woven cloth | Live. Idempotent per (pubkey, matchId) | `seat/claim.ts`, `mint/mint.ts`; check: `npm run check:seat` |
| **Call receipts** — relayer-signed memo per call | Relayer proven on devnet; shipped in-game calls persist into the record instead | `relay.ts:relayCall` |
| **Market provenance** — TxLINE Merkle refs carried in ROOOT records | Validation path exercised against the live API | `fixtures/provenance/messi-goal-tick-proof.json` |
| **Attendance root** — Merkle root of attendee anonIds | Designed, shape only | `contracts/relic.ts` |

**Anchors.** 19 Jul (the final): record `79f4182e…662f3b1`, tx
`pYvzwKuisiNfYZtNYxM8xYWWj1T5mhf9WXbwxKNJc1DAr81GHNp88xKRGdHC26j8agZ8Zwhgr78QokjgYwBbvfE`.
18 Jul: record `8a1cac7d…b516ce9`, tx
`44KB7EXGB17uo6L1X1FyJCAt7eopkooprwjaZwzP1YJBDREEXJxr9De9H6kYzas8pjohvy1FSSYKspTJncPh8tYz`.
15 Jul: `de9c9ea4…90a41a`. 10 Jul: `1a3e5763…49bf6b`. Public devnet RPC retains
recent history only; each record hash regenerates from its committed capture with
the command in §5. Account-based artifacts persist — e.g. scarf Nº 025,
`DHEAuF3CSrXnXn9vta5V6SMsYSUKf4BfVfmLE2JdRog8`, queryable via DAS.

**Identity.** WebAuthn PRF output derives an ed25519 keypair on-device. No seed
phrase, no key custody, no wallet install. Collect is local and instant; saving
to an account is a separate opt-in ceremony.

## 8 · Persistence

Match state (roots, predictions, delivered verdicts, serials, next-goal calls)
snapshots to a mounted Fly volume every 30s with atomic writes
(`snapshot.ts`). Exactly one SentimentRecord is crystallized per match at full
time; settlement is idempotent on disk, so re-dispatch cannot duplicate an
anchor. A late joiner after full time is served the sealed record from disk
(`server.ts` "THE SEAL"). The pre-kickoff starting XI — a one-shot ~45-minute
envelope on the scores wire — re-seeds from the scores snapshot on boot
(`ingest/txline.ts:seedSnapshot`). Roar decay state deliberately resets on
restart rather than resuming stale.

## 9 · Verification

Runtime, not build-green.

- **Release canary** (`scripts/canary/`) — two real browsers, seven flow steps:
  opposite-end entry, distinct predictions, cross-end cheer, presence across lens
  switches, goal-replay suppression on late join, side-aware full-time verdicts,
  live market render. Production smoke mode intercepts every outgoing WebSocket
  frame and blocks anything beyond a side-less hello, then proves its own blocker
  each run. Full mode refuses non-local hosts by allowlist.
- **Twenty-three in-process dev checks** (`services/stands/src/dev/*-check.ts`,
  each wired to an `npm run check:*` script) boot the real server against the real
  wire: presence/cheer, restart persistence, verdict replay, fan serial, pulse,
  full replay, SSE idle, self-probe, NEXT GOAL, Collect claim/mint, anchor
  durability, fingerprint anchor, memory eviction, seal-on-join, seal-consume,
  starting-XI seed recovery, fixture info, provenance, reactions-live, reprojection,
  score confirmation, unknown score, and the 0–0 case.
- `npm run typecheck` across the monorepo.

## 10 · Engineering notes

- **Memory growth across match nights.** Finished matches were never evicted
  from in-memory caches. Fixed with eviction on finish/idle plus idempotent
  on-disk settlement so eviction cannot trigger a duplicate anchor. A 3-match
  soak held the heap flat (58→61→58 MB); a production boot re-dispatched a
  finished match's full-time path and wrote zero new records.
  (`docs/incidents/2026-07-oom.html`)
- **Reconnect storm.** Concurrent adapter reconnects hung a live page. Fixed with
  a single-flight connect guard and backoff discipline across the adapters;
  regression test in `scripts/canary/reconnect-check.mjs`.
- **Participant-order inversion.** The odds wire's leg order follows participant
  index, not home/away. A truth latch derived from the scores wire is threaded
  through live ingest, replay and recording.
- **Starting-XI loss on restart.** The lineup envelope is one-shot; a boot
  re-seed from the scores snapshot recovers it.
- **Premature seal at the 90′ whistle.** The final went to extra time. StatusId 5
  (full time in 90) arrived at the 90′ whistle and finalized the record before ET
  was played. Fixed by holding StatusId 5 until the ladder confirms no ET follows;
  the record was re-crystallized and re-anchored, and both captures are committed
  (`…-premature.json`, `…-corrected.json`).
- **Feed idle detection.** A per-attempt watchdog aborts a silent stream and
  forces reconnect; heartbeats count as liveness.

## 11 · Constraints

- Solana devnet throughout.
- Points weights are v1; retuning expected as crowds grow.
- Seven of twelve statistics await named fields (§5).
- TxLINE free tier ends 19 July 23:59 UTC; records and relics carry their own
  provenance, so nothing depends on a live feed afterwards.

## 12 · Repository

| Path | Contents |
|---|---|
| `apps/web/public/` | the shipped surfaces + adapters |
| `services/stands/` | ingest, aggregation, persistence, relayer, mint |
| `contracts/` | frozen wire shapes (feed, crowd, relic, sentiment, normalize) |
| `scripts/` | TxLINE auth, stream recording, canary, night reports |
| `docs/night-reports/` | one dossier per live match, with raw JSON sidecars |
| `services/stands/captures/` | the four committed match captures |

Built by one person directing a pipeline of Claude agents under a written
operating law (`AGENTS.md`): one directory per lane, frozen contracts, and
spec → implement → review → whole-branch review, with runtime verification and
screenshot evidence gating merges.
