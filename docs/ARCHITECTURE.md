# ROOOT — Architecture

*What runs where today, what's on-chain and why, and how the lanes fit. For the full
write-up with live evidence, see `docs/SUBMISSION-tech-doc.md`.*

## The tree

```
ROOOT/
├── AGENTS.md · CLAUDE.md      the operating rules (auto-loaded; read first)
├── contracts/                 THE FROZEN SEAMS — coordinator-only
│   ├── normalize.ts           TxLINE parser: de-vig, participant-order truth latch,
│   │                          the 13-rung StatusId ladder, spells, ledger events
│   ├── feed.ts                MARKET bus — ticks · score · status · pressure · ledger
│   ├── crowd.ts               CROWD bus — root · predict · cheer · moments · verdicts
│   ├── sentiment.ts           the SentimentRecord crystallized at full time
│   ├── relic.ts               scarf/record data shapes + provenance refs
│   └── stats.ts               the proprietary stat definitions
├── apps/web/                  the fan experience (Vite build → Vercel)
│   └── public/                the seven static surfaces + vanilla adapters
│       ├── gate·ground·woven-loom·terrace·stadium·cabinet·showcase .html
│       ├── *-adapter.js        stands · loom · stats · seat · fixture adapters
│       └── fixture.json        the one fixture manifest (coordinator repoints)
├── services/stands/           L2 · the one server (Node, Fly.io)
│   └── src/                   ingest/ · sentiment/ · mint/ · seat/ · relay.ts ·
│                              decay.ts · snapshot.ts · server.ts
├── scripts/                   ops: subscribe, record, canary, night-report, cutover
├── docs/                      ground truth: PRODUCT · DATA · ARCHITECTURE · SUBMISSION
├── design/                    references/ (owner-curated) + PAPER-AND-CLOTH + REFERENCES
├── fixtures/                  recorded matches (JSONL; content gitignored)
├── archive/                   retired: the src/ SPA + old prototypes (don't build here)
└── .secrets/                  keys + tokens (gitignored, never in argv/logs)
```

The old single-page app under `apps/web/src/` (`main.ts` + `stage/`, `crowd/`,
`relics/`, `mint/`, `data/`, `lib/`) is frozen and unused — `index.html` no longer
imports it and nothing a fan reaches runs it. It is being retired to
`archive/src-spa-frozen/`.

## Data flow (one server, two buses)

The market and the crowd travel as separate message families end to end, and meet
only on screen, visibly distinct (honesty law 1).

```
TxLINE SSE  /api/odds/stream + /api/scores/stream      (or fixtures/*.jsonl replay,
     │                                                  same parser, first-class)
     │  contracts/normalize.ts — de-vig · order-truth latch · status ladder
     ▼
services/stands — one Node process on Fly.io (app rooot-stands)
     ├── FEED BUS   contracts/feed.ts    market ticks · score · status · spells · ledger
     ├── CROWD BUS  contracts/crowd.ts   root · predict · cheer (decayed counts) · moments ·
     │                                   side-aware verdicts · presence (refcounted)
     ├── /data volume — 30s atomic snapshot + one SentimentRecord crystallized at full time
     ├── relay.ts   — devnet memo writes: record anchor · call receipts
     └── mint/·seat/ — walletless passkey seat → Metaplex Core scarf mint (Umi + Irys)
     │
     │  one WebSocket per tab; both buses on it, never blended
     ▼
adapters  apps/web/public/*-adapter.js → window.__stands / __match / __loom / __stats / seat
     ▼
surfaces  static HTML on Vercel (rooot.club) — the seven surfaces, all reading the
          same adapters, all following one fixture manifest (public/fixture.json)
```

## What's on-chain (devnet), and why

No token, no wager. The chain does three jobs — provenance, commitment, settlement —
on devnet throughout. Three writes are real and proven:

| Write | Mechanism | Why the chain |
|---|---|---|
| **Sentiment record anchor** | at full time, SHA-256 of the crystallized record in a memo tx (`relay.ts` `anchorRecordHash`) | the match's data really happened, tamper-evident |
| **Call receipts** | a rare call relayer-signed into a memo — claim + minute + the market's triple at that second, walletless (`relay.ts` `relayCall`) | "I called it first," stamped before the result |
| **Scarf mint** | Metaplex Core via Umi + Irys to the fan's passkey seat, service-paid, idempotent, full-time-gated (`mint/`, `seat/`) | the keepsake is ownable, permanent, the fan's own |

Backlog on-chain (designed, not live): the **attendance Merkle root**
(`contracts/relic.ts` `attendeeRoot`) and **market-provenance refs inside relic
metadata** (proof path exercised in `fixtures/provenance/`, wiring staged). Cheers and
reactions stay app-layer on purpose: a tap is not a transaction.

## Durability and hardening

State (roots, predictions, verdicts delivered, fan serials) snapshots to the mounted
Fly volume every 30s with atomic writes (`snapshot.ts`); exactly one SentimentRecord
crystallizes per match at full time. After the July out-of-memory incident the
service was hardened: finished-match eviction, disk-idempotent crystallize, a
byte-capped event log, and Fly pinned to 512mb + 256mb swap (`fly.toml`). Roar
deliberately resets to silence on restart — stale decay is not resurrected.

## Stack decisions (made)

Static HTML surfaces + vanilla-JS adapters (no framework), built by Vite and served
on Vercel (`rooot.club`) · one Node stands service on Fly.io (`rooot-stands`, iad),
in-memory aggregation + a durable volume (Redis = documented scale path, not built) ·
path-aliased `@contracts/*`, three explicit packages (root=ops, apps/web,
services/stands) · replay is a first-class product surface, the same parser as live
(judges review after the final).

## Seam-change protocol

`contracts/` changes: coordinator only, with a one-line CHANGELOG comment at the top
of the touched file. Lanes never fork shapes locally. The fixture manifest and deploy
config are integration seams — the coordinator repoints them at cutover.
