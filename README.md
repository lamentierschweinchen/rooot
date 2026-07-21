# ROOOT

Pick an end. Predict the score. Cheer with your end. Keep what you lived. ROOOT is
a free live fan companion for the World Cup — the betting market's belief rendered
honestly beside the crowd's, on your phone, with the fan's record kept on Solana.
No token, no wager.

**What it makes.** Every tap is a measurement. The market has a number, the crowd
has a belief, the wire has the result — each recorded on its own clock, in its own
units, never mixed, so the distance between them can be read at any second of the
match. What makes the crowd's side worth having is not that it beats the market:
it is *who* is answering. Declared allegiance, no stake, timestamped to the second,
and a conviction dial next to every call. Nobody else holds that.

ROOOT ran on five real matches, live off the TxLINE wire, through the final:

| Night | Match | |
|---|---|---|
| Jul 9 | France 2–0 Morocco — the premiere | [report](docs/night-reports/18209181.md) |
| Jul 10 | Spain 2–1 Belgium | [report](docs/night-reports/18218149.md) |
| Jul 15 | England 1–2 Argentina — semi-final | [report](docs/night-reports/18241006.md) |
| Jul 18 | France 4–6 England — third place | [report](docs/night-reports/18257865.md) |
| Jul 19 | **Spain 1–0 Argentina — the final** | [report](docs/night-reports/18257739.md) |

Each night's sentiment record is hashed and anchored on Solana devnet at the
whistle. The final is [rewatchable end to end](https://rooot.club/live), woven from
the night's own wire. Architecture and evidence:
[docs/SUBMISSION-tech-doc.md](docs/SUBMISSION-tech-doc.md); a guided tour of the
surfaces: [rooot.club/demo](https://rooot.club/demo).

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
