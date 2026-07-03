# ROOOT — Data Ground Truth

*What we may honestly use, where it comes from, and the shapes on the wire.*

## The honest palette (nothing else exists)

De-vigged win-probabilities over time · per-market/per-bookmaker odds · the score ·
the clock/match state · goalscorer name+minute · our own crowd counts (taps/reacts) ·
our own chain receipts. **No passes, no positions, no player tracking** — any idea
needing them is invented and dies. Enrichment (lineups/cards/subs via API-Football,
pending key) is *garnish*: subtle, labeled, and the product never blinks if it drops.

## TxLINE (the spine)

- **Devnet API:** `https://txline-dev.txodds.com` · program
  `6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J` · devnet TxL mint
  `4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG`.
  Mainnet: `https://txline.txodds.com/api` (real-time level 12 lives THERE; devnet
  pricing matrix only has level 1 = 60s StablePrice — coordinator decision pending).
- **Auth:** guest JWT (`POST /auth/guest/start`, 30d) → on-chain `subscribe` →
  sign `txSig:leagues:jwt` → `POST /api/token/activate` → then every call carries
  `Authorization: Bearer <jwt>` + `X-Api-Token: <token>`.
  **Live token: `.secrets/txline-token.json`** — `npm run subscribe` fast-paths if it
  exists (never re-subscribes). Wallet: `.secrets/rooot-devnet.json`.
- **Endpoints we use:** `/api/fixtures/snapshot?competitionId=72&startEpochDay=<d>`
  (epochDay = floor(nowMs/86400000)) · `/api/odds/snapshot/{fixtureId}` ·
  `/api/odds/stream` (SSE) · `/api/scores/snapshot/{fixtureId}` · `/api/scores/stream`
  (SSE) · validation: `/api/odds/validation`, `/api/scores/stat-validation`,
  `/api/fixtures/validation` (Merkle proofs — the provenance differentiator).
- **Odds SSE event fields (observed live):** `FixtureId, MessageId, Ts, Bookmaker,
  BookmakerId, SuperOddsType, GameState, InRunning, MarketParameters, MarketPeriod,
  PriceNames, Prices, Pct` — `Pct` is the StablePrice probability vector; filter by
  `FixtureId`, key on 1X2-market rows (`SuperOddsType`), watch `InRunning`/`GameState`.
- **Free tier ends Jul 19 23:59 UTC** with the hackathon → relics must carry their own
  provenance (Merkle refs + captured windows), never a live-feed dependency.

## FixtureIds that matter (devnet, confirmed live)

| Id | Fixture | Kickoff (UTC) |
|---|---|---|
| 18175918 | Argentina – Cape Verde | Jul 3 22:00 |
| 18179549 | Colombia – Ghana | Jul 4 01:30 |
| 18185036 | Canada – Morocco | Jul 4 17:00 |
| 18188721 | Paraguay – France | Jul 4 21:00 |
| 18187298 | Brazil – Norway | Jul 5 20:00 |
| 18192996 | Mexico – England | Jul 6 00:00 |
| 18198205 | Portugal – Spain | Jul 6 19:00 |
| 18193785 | **USA – Belgium** (hero) | Jul 7 00:00 |

## Recorded fixtures (replay is first-class)

`fixtures/{odds,scores}-YYYYMMDD.jsonl` — one line per SSE message:
`{ receivedAtMs, event, data }` with `data` as the raw string (faithful transcript;
parse at replay time). `__meta`/`__disconnect` lines mark transport events.
Record via `npm run record -- --url <sse> --token-file .secrets/txline-token.json
--out fixtures/<name>.jsonl` (token file keeps secrets out of argv). Recorders for
Jul 3 night are running (odds + scores, caffeinated).

## Enrichment (garnish tier)

**API-Football (api-sports.io, direct — NOT RapidAPI):** free tier includes WC2026
(league=1, season=2026), `fixtures/lineups`, `fixtures/events` (goals/cards/subs w/
minutes), `fixtures/statistics`. Caps: 100 req/day, 10/min → budget: 1 lineups call
pre-match + events poll every 2–3 min during our 1–2 focus matches/day. Key pending
from owner (by Sat evening). Base `https://v3.football.api-sports.io/`.
**Rejected:** football-data.org free (no lineups/events/live) · Sportmonks free (wrong
leagues) · TheSportsDB (no live/events) · SofaScore/FotMob scraping (ToS-prohibited —
integrity) · unofficial ESPN (no ToS/guarantees) · StatsBomb/OpenFootball (static).

## Team colors/flags

Hand-curated static JSON for the 16 remaining teams → `apps/web/src/lib/teams.ts`
(colors: [primary, secondary] hex; unicode flag). No federation crests, ever.

## THE LIVE WIRE (validated vs AUS–EGY in play — supersedes the snapshot schema for streams)

The real `/api/scores/stream` speaks **UpperCamelCase action envelopes**, not the
lowercase OpenAPI `Scores` schema (that shape belongs to snapshots):
`{ FixtureId, GameState (STALE — ignore; truth = StatusId), Participant1IsHome,
Participant{1,2}Id, Action, Id (stable per real event across re-emissions),
Ts, Seq, Confirmed, Clock:{Running,Seconds}, Score:{Participant1:{Total:{Goals,
Corners}},...}, Participant (acting side 1|2), Data:{...} }`.

**Observed actions (the palette is BIGGER than documented):** lineups (player
ids/positions) · kickoff_team · kickoff · status · goal (re-emits same Id:
unconfirmed → Confirmed → +GoalType +PlayerId) · shot (+action_amend with
Outcome, e.g. "Woodwork") · corner · free_kick · throw_in · goal_kick ·
possession / safe_possession / attack_possession / danger_possession /
high_danger_possession (per side, with clock — LIVE PRESSURE DATA) ·
possible ({Goal:true} = the held-breath moment before confirmation) ·
clock_adjustment · venue/pitch/weather/jersey. Cards not yet observed (watch
tonight's captures). **Possession-danger grades are honest live pressure — a
future stage layer (post-pop-reskin) may render them; the `possible goal`
moment is a gift for drama.**

**StatusId ladder (CONFIRMED live — AUS–EGY went 1–1 / ET / penalties, the
full knockout epic, all captured):** playing phases pair a `status` with a
`kickoff` (top-level StatusId + running Clock): **2**=H1(0s) · **4**=H2(2700s)
· **7**=ET1(5400s) · **9**=ET2(6300s). Breaks are `status`-only, no Clock:
**3**=HT · **6**=end-of-90-before-ET · **8**=ET break · **11**=end-of-ET.
**12**=penalty shootout · **13**=final whistle (observed after pens; expected
also straight-90 — confirm vs ARG–CPV FT). Never observed: 5, 10 → unmapped
(null, never guess). Breaks 6/8/11 also null: the stage holds the prior
playing phase through them. `mapLiveStatusId` carries this exact table.

**✅ SIDE-TRUTH BUG FIXED (coordinator, Jul 3):** the odds envelope carries NO
home/away field — `PriceNames` is `["part1","draw","part2"]`, PARTICIPANT
order. `parseOddsMessage` now takes `participant1IsHome` (default true) and
swaps legs when false; every scores envelope carries the truth, so sources
latch it (`sniffParticipant1IsHome`) and thread it: ReplaySource pre-scans its
bundle, services/stands replay latches per run, txline live ingest keeps a
per-FixtureId map shared across its odds/scores streams. Every fixture
observed so far is `true` (ARG–CPV: part1=ARG at 82% in-running ✓) — the
latch exists for the day the feed says otherwise.

**Validation tool:** `npx tsx scripts/validate-live.ts <scores.jsonl> [--odds <odds.jsonl>]`
— prints parse tallies + the honest timeline. AUS–EGY full arc parses true:
KO ✓ · Egypt 12' ✓ · HT ✓ · Australia 54' equalizer ✓ · ET 90'/105' ✓ ·
PENALTIES ✓ · FULL_TIME ✓ — 0 sum violations across 4k+ 1X2 ticks. A
penalty-shootout capture in the bank means "penalties as weather" can be cut
from REAL data in the demo video.

## API feedback bank (judged submission field — keep adding)

1. `POST /api/token/activate` returns **500** (not 4xx) on malformed/invalid input —
   docs say 400/403.
2. Devnet faucet contention blocks hackathon onboarding (429 across all tiers);
   a funded-wallet path or dedicated faucet would unblock teams.
3. The repo IDL embeds **mainnet** address/mint constants; devnet values live only in
   the quickstart config block — a devnet-flavored IDL would prevent the trap.
