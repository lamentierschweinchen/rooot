# ROOOT — Architecture

*What runs where, what's on-chain and why, and how the lanes fit.*

## The tree

```
ROOOT/
├── AGENTS.md · CLAUDE.md      the operating rules (auto-loaded; read first)
├── contracts/                 THE FROZEN SEAMS — coordinator-only
│   ├── match.ts               MatchDataSource: onOdds(pH,pD,pA)/onScore/onStatus/onFeedState
│   ├── crowd.ts               web ↔ stands wire protocol (hello/cheer/react/call → stands/receipt/room)
│   └── relic.ts               scarf/pin/receipt data shapes + provenance refs
├── apps/web/                  the fan experience (Vite, TS strict, phone-first)
│   └── src/
│       ├── main.ts            composition root — coordinator integrates here
│       ├── stage/             L3 the tide-on-pitch renderer (2D canvas, 60fps phones)
│       ├── crowd/             L5 ends · cheer button · pulse · rows UI
│       ├── relics/            L4 scarf + pin generators (print-ready), trophy case
│       ├── mint/              L4b Metaplex Core mint (port of STRATA src/mint)
│       ├── data/              L1 TxLineDataSource (SSE) · ReplaySource (fixtures) · MockSource
│       └── lib/               theme tokens, teams.ts, small utils
├── services/stands/           L2 aggregation + fanout + call relayer (Fly.io)
├── scripts/                   ops: txline-subscribe, record, spike
├── docs/                      ground truth: PRODUCT · DATA · ARCHITECTURE · txline/ (vendored)
├── design/                    REFERENCES-BRIEF + references/<buckets>/ (owner-curated) → REFERENCES.md
├── fixtures/                  recorded matches (JSONL; content gitignored)
└── .secrets/                  keys + tokens (gitignored, never in argv/logs)
```

## Data flow (one event bus, two senses — STRATA DNA)

```
TxLINE SSE (odds/scores) ──► TxLineDataSource ─┐
fixtures/*.jsonl ──────────► ReplaySource ─────┼─► MatchCallbacks bus ─► stage (visuals)
                                               │                      └► audio (later)
browser taps/reacts ──► WS ──► stands service ─┴─► StandsState @4Hz ──► crowd UI
                               │ (decay, clamp, rooms)
                               └─► call relayer ──► devnet memo tx ──► CallReceipt
```

Market data and crowd data ride **separate buses** end-to-end (honesty law #1);
they meet only on screen, visibly distinct (tide vs roar), and in the relic data
where both are labeled.

## What's on-chain (devnet), and why

| Thing | Mechanism | Why the chain |
|---|---|---|
| Calls → receipts | memo tx (relayer-signed walletless; wallet-signed for owners); payload = claim+minute+marketP hash | trustless "I called it first" |
| Stands checkpoints | periodic aggregate hash | crowd history tamper-evident |
| Attendance | Merkle root of attendee anonIds per match | "I'm in the crowd photo," provable |
| Relic mints | Metaplex Core via Umi + Irys (STRATA port) | ownable, permanent, verifiable |
| Market provenance | TxLINE's own Merkle anchors, referenced in metadata | odds verifiable after the feed dies |

Cheers/pulse stay app-layer: we never pretend a tap was a transaction.

## Stack decisions (made)

2D canvas stage (phone-first 60fps; three.js in the wings for relic renders only) ·
plain TS everywhere, no framework · path-aliased `@contracts/*` (no workspace/hoisting
magic; three explicit packages: root=ops, apps/web, services/stands) · stands service
in-memory + snapshots (demo scale; Redis = documented scale path, not built) ·
deploy: web → Vercel (rooot.club), stands → Fly.io · replay mode is a first-class
product surface (judges review after the final).

## Seam-change protocol

`contracts/` changes: coordinator only, with a one-line CHANGELOG comment at top of
the touched file. Lanes never fork shapes locally. `main.ts` wiring: coordinator
integrates lanes single-threaded, in dependency order.
