# ROOOT

**The world's most beautiful and fun fan experience — on your phone, and on-chain
forever.** Live market belief as a golden tide on a floodlit night pitch. Root once,
cheer constantly, call rarely. Lose the match, win the stands. Keep what you lived:
the scarf, the pin, the trophy case. Free — no wager, no token. `rooot.club`

Built for the TxODDS World Cup Hackathon on Solana (Consumer & Fan Experiences).
Data spine: TxLINE (real-time odds + scores, Merkle-anchored on Solana). Sibling of
[STRATA](https://exploresolana.art).

## Orientation (agents: read in this order)

1. **[AGENTS.md](AGENTS.md)** — the laws, the lane map, how to work here
2. **[docs/PRODUCT.md](docs/PRODUCT.md)** — what we're building
3. **[docs/DATA.md](docs/DATA.md)** — the honest palette, TxLINE truth, fixtureIds
4. **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the tree, the flows, what's on-chain

## Layout

| Path | What |
|---|---|
| `contracts/` | frozen seams (match · crowd · relic) — coordinator-only |
| `apps/web/` | the fan experience (Vite, phone-first) |
| `services/stands/` | crowd aggregation + fanout + call relayer |
| `scripts/` | ops: TxLINE auth, stream recording |
| `docs/` · `design/` | ground truth · references (owner-curated) |
| `fixtures/` | recorded matches (replay is first-class) |

## Run

```
npm install && (cd apps/web && npm install) && (cd services/stands && npm install)
npm run typecheck        # whole repo
npm run dev              # the web app
npm run subscribe        # TxLINE auth (fast-path if .secrets/txline-token.json exists)
```

The game is the game. The stands are yours forever.
