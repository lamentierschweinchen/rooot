# ROOOT

Pick an end. Predict the score. Cheer with your end. Keep what you lived. ROOOT is
a free live fan companion for the World Cup — the betting market's belief rendered
honestly beside the crowd's, on your phone, with the fan's record kept on Solana.
No token, no wager.

**The number:** at ROOOT's first live match (France–Morocco, July 9), the betting
market gave Morocco 14.3%. ROOOT's crowd gave Morocco 60%. That is a **+45.7
percentage-point gap** between what the money believed and what real fans believed,
measured live from five real people ([docs/POSTMORTEM-fra-mar-2026-07-09.md](docs/POSTMORTEM-fra-mar-2026-07-09.md)).
The next night the crowd's modal prediction called Spain–Belgium **2–1 exactly**
against a market that opened Spain at 60.6%, and the match's sentiment record was
hash-anchored on Solana devnet at the final whistle
([docs/night-reports/18218149.md](docs/night-reports/18218149.md)). The market has
the number, the crowd has the roar, and the gap between them is data nobody else
has. The architecture and the evidence: [docs/SUBMISSION-tech-doc.md](docs/SUBMISSION-tech-doc.md).

## Run it

```
npm install && npm --prefix apps/web install && npm --prefix services/stands install
npm run typecheck        # whole repo
npm run dev              # the web app (Vite) — open /gate.html, /ground.html, /woven-loom.html
npm --prefix services/stands run dev     # the stands service on :8787
```

Replay a real recorded match through the real service — no TxLINE token needed
(replay uses the exact same parser as live; `?ws=ws://localhost:8787/` on any
surface points it at your local service):

```
cd services/stands
REPLAY_FILE=../../apps/web/public/replay/arg-cpv-20260703.jsonl \
REPLAY_FIXTURE=18175918 REPLAY_SPEED=60 npm run dev
```

Reproduce the proprietary stats from the three real live matches — every capture is
committed; every number in the reports traces to a field in them:

```
node scripts/night-report.mjs services/stands/captures/premiere-fra-mar-18209181-919c9af.json
node scripts/night-report.mjs services/stands/captures/espbel-sentiment-18218149.json
node scripts/night-report.mjs services/stands/captures/engarg-sentiment-18241006.json
```

Run the release gate — a two-browser acceptance canary (opposite ends, distinct
predictions, cross-end cheer, presence across lens switches, late join, full-time
verdicts); full mode structurally refuses non-local hosts, and the production smoke
mode proves its own write-block on every run:

```
cd scripts/canary && npm install
node run.mjs --web http://localhost:4180 --ws ws://localhost:8788/ --mode full
```

(Ports and the two-terminal recipe: [scripts/canary/README.md](scripts/canary/README.md).
Live TxLINE auth, if you have credentials: `npm run subscribe`.)

## The map

| Path | What |
|---|---|
| `contracts/` | the frozen seams — feed, crowd, relic, sentiment shapes (coordinator-only) |
| `apps/web/` | the fan experience — static surfaces in `public/` (gate · ground · loom · stadium · terrace · cabinet) + adapters |
| `services/stands/` | the one server — TxLINE ingest, crowd aggregation, verdicts, durable persistence, devnet relayer |
| `scripts/` | ops — TxLINE auth, stream recording, the release-gate canary, the night-report generator |
| `docs/` · `design/` | ground truth · owner-curated references |
| `fixtures/` | recorded matches (content gitignored; replay bundles ship in `apps/web/public/replay/`) |

Orientation for agents, in order: [AGENTS.md](AGENTS.md) →
[docs/PRODUCT.md](docs/PRODUCT.md) → [docs/DATA.md](docs/DATA.md) →
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Live

Web: **[rooot.club](https://rooot.club)** (Vercel). Service: `wss://rooot-stands.fly.dev`
(Fly.io, durable volume). On match nights the service ingests TxLINE live and the
surfaces follow one fixture manifest; between matches, replay powers the same
surfaces with recorded real matches — never simulations.

## The laws

The operating rules live in [AGENTS.md](AGENTS.md); violations don't ship.

1. **Honesty.** The market has the number (de-vigged probability); the crowd has
   the roar (real counts, never dressed as percentages, never blended with market
   data). Nothing renders or mints that didn't happen.
2. **The game is the game.** ROOOT rides alongside the match; lurking is a complete
   experience.
3. **No token, no wager.** The chain is for provenance, commitment, settlement —
   the fan's record is theirs, forever, worthless to flip on purpose.
4. **No FIFA marks.** Team names and unicode flags; "the tournament" otherwise.
5. **Secrets** live in `.secrets/` (gitignored) or env — never in code, argv, logs,
   or commits. Devnet only.
6. **Reference-driven design**, judged against `design/references/`, never generic
   taste.
7. **Build-green is not done.** Everything gates at runtime, the way a fan uses it.

## Credits

Built for the TxODDS World Cup Hackathon on Solana (Consumer & Fan Experiences).
Data spine: TxLINE (real-time odds + scores, Merkle-anchored on Solana). Sibling of
[STRATA](https://exploresolana.art).

The game is the game. The stands are yours forever.
