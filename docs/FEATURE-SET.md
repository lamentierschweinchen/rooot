# ROOOT — the full feature set

*2026-07-18 · what the product actually does today, surface by surface: what
each place is FOR, what it RECORDS, what it SHOWS, what a fan can DO. Marks:
**LIVE** = on rooot.club right now, wired to real data · **ROADMAP** = designed
or partially built, not judge-visible. Grounded in the code as deployed —
nothing aspirational is marked live. The gaps audit is at the bottom.*

---

## The gate — `/gate`

**For:** entry is an opinion. There is no watch-only door — picking an end and
calling the score IS the ticket, and it's the harvest's first datapoint.

- **Records · LIVE:** your pass — side, predicted scoreline, the conviction
  dial (1–4, "HOW SURE?"), timestamp; `late` when you arrive in-play. Sends
  root + prediction (+ conviction) into the live crowd; scoreline predictions
  lock at kickoff — an in-play arrival still roots and keeps a personal call,
  marked as such, never blended into the locked crowd data.
- **Shows · LIVE:** the fixture as a printed ticket (real kit colors, flag
  badges), the phase in plain words (KICKOFF …/GATES OPEN/LIVE NOW/FULL TIME),
  "THE MARKET READS" strip once the wire prints. Phase-aware lock: before
  gates it waits; after the whistle it closes with three postures — BACK TO
  YOUR SEAT (pass holders keep their door), REWATCH THE MATCH (sealed), or
  SEALING THE NIGHT (the minutes before the sealed programme lands).
- **Do · LIVE:** pick a side (required) · tap-set the score (required) · set
  the dial · walk in. A returning fan finds everything prefilled — never asked
  to predict twice.

## The ground — `/ground`

**For:** being at the match. One page, three lenses on the same night — the
loom (the match), the stands (the crowd), the stadium (the broadsheet).

- **Shows · LIVE:** score + clock header from the wire, your end's cheer
  meter (ticks on real accepted cheers), rooted counts, the lens dial. Sealed
  nights read FULL TIME with the real final score.
- **Do · LIVE:** swipe between the three lenses (three persistent panes —
  state preserved, no reloads, no re-asking) · tap the dial · the live-pull
  bar on every other page ("● FRA–ENG IS LIVE · GET IN →") walks you here.

## The woven-loom — `/live`

**For:** the match as a made object. Time is cloth: the market's belief is
the warp, events knot into it, and at the whistle the weave is finished —
that cloth is the collectible.

- **Records · LIVE:** the sealed cloth record (`rooot.cloth.<match>`) — the
  full woven night including your rooted side on the selvage and your
  resolved calls knotted down it.
- **Shows · LIVE:** the belief curve woven tick by tick · goals as GOOOL
  bands · possession and danger pressure bands · score/clock mast with the
  honest source word (LIVE only when it's the wire; REPLAY otherwise) · the
  full-time press and seal · **the shootout board** — the loom becomes a
  best-of-5 board the moment penalties begin (wired to the wire's penalty
  phase; built for a night that hasn't happened yet).
- **Do · LIVE:** watch it weave · SKIP → on replays (drain to the whistle) ·
  REWATCH ↻ a sealed night · collect the scarf at the seal.

## The terrace (the stands) — inside `/ground`

**For:** the crowd made visible — real people, really counted. The emotional
surface: this is where the night is *felt*, and where most of the harvest is
recorded.

- **Records · LIVE:** cheers (server-granted, rate-limited honestly) ·
  **in-game emotions** — six emblems (joy · muscle · heartbreak · relief ·
  anger · hope), always available from the dock, counted into the immutable
  record inside drama windows · watch minutes · NEXT GOAL calls with the
  market's read stamped server-side at the second of the call · your
  scoreline in the crowd consensus · your rooted side. All of it folds into
  the match's crystal at full time.
- **Shows · LIVE:** both ends as seat mosaics with real rooted counts · roar
  meters (decayed live loudness, never faked volume) · the crowd-vs-market
  plaque — the crowd's % beside the market's ODDS, visibly separate · drama
  windows opening on real triggers (goals, reds, VAR, near-misses, big market
  swings, the whistle) with the crowd's feeling revealed after each ·
  THE NIGHT card at full time — the scoreline board (what everyone called),
  the roar strip (the night's loudness curve), the points and engagement
  totals · your keepsake card — seat, accuracy or verdict, named goalscorers,
  your night's counts, your points.
- **Do · LIVE:** tap to cheer · react any moment from the dock (it blooms
  when a window opens) · call the next goal · dismiss/recall the card freely ·
  **collect** — instant and local in one tap, with an optional "SAVE TO YOUR
  ACCOUNT · FACE ID" that mints the real scarf (never interrupts the keep).

## The stadium — inside `/ground` (also `/stadium`)

**For:** the broadsheet. The whole ground at a glance — every stat family in
its architectural place, drawn on the owner's generated plates.

- **Shows · LIVE:** phase masthead in plain words · the signed board (score ·
  minute · REPLAY · n′ · FULL TIME, never a fake LIVE) · full team sheets —
  real starting XI + bench + subs from the wire's lineups · the night's
  events, named (scorer + minute) · the stat plates: possession, shots,
  corners, danger spells, the BOOK (referee's decisions) · the odds curve in
  team colors, kickoff → now · pulsing hotspots that jump you to each place
  (the stands dot drops you into the crowd).
- **Do · LIVE:** roam and read · tap hotspots to move lenses · replays drain
  to the settled truth.

## The cabinet — `/cabinet`

**For:** what you keep. The fan's own record, on their device and on-chain —
worthless to flip, priceless to the person who lived it.

- **Shows · LIVE:** your crest and fan serial (Nº — first-come, permanent) ·
  **POINTS** (the gold tile — every night summed) · the record tiles (matches
  lived · predictions · exact calls) · NEXT UP (the schedule's next door) ·
  the scarf rack — minted scarves pulled from chain (DAS) beside local keeps,
  each carrying the real woven cloth as its image · match cards with
  three-state verdicts (✓ EXACT · ≈ RIGHT RESULT · ✗ WRONG) and the accuracy
  score · share.
- **THE PINS · ROADMAP:** seven fan virtues (bronze → silver → gold). The
  frames are live; the counters still show sample ranks — see the gaps audit.

## The showcase — `/demo`

**For · LIVE:** the guided walkthrough for a first-time reader or judge —
the full loop on a baked real match with a simulated crowd, labeled as
exactly that on every surface it touches. Needs no account, no server.

## The landing — `rooot.club`

**For · LIVE:** the front door tells the truth about tonight: the ticket, the
phase, gates times, the enter/rewatch door, how-it-works, PREVIOUS NIGHTS (a
shelf: every sealed programme stays one tap away), about.

---

## The record — what a match leaves behind (all LIVE)

One SentimentRecord per match, crystallized ~30s after the whistle (so the
full-time emotions are inside), hashed and anchored on Solana devnet:

- **BET (the market):** open/close/per-phase belief · every swing with its
  trigger minute · biggest swing · volatility · conviction (mean + peak) ·
  suspensions (the market holding its breath) · favored-minutes · lead changes.
- **BELIEVE (the crowd, pre-match):** consensus scoreline with n · rooted
  counts per end · the full scoreline histogram (every score anyone called).
- **FEEL (the crowd, in-game):** the moments felt — each drama window's
  emblem split · the roar series (~30s loudness samples, restart-proof).
- **THE CALLS:** every NEXT GOAL cycle — the crowd's split, the market at
  call-time, the resolution.
- **THE NIGHT'S PEOPLE:** engagement (fans · cheers · reactions · watch
  minutes · arrival waves) · points (one formula, v1) with the top five by
  serial — serials only, never identities.
- **PROVENANCE:** the story fields (phase path · decided-in · headline) ·
  the record hash · TxLINE Merkle refs · the anchor tx.

## On-chain (devnet)

- **LIVE:** the record anchor at every whistle (+ self-healing backfill) ·
  the tournament fingerprints fold · the scarf — walletless passkey
  (Face ID → real ed25519 key, no seed phrase), Metaplex Core asset whose
  image is the fan's actual woven cloth, service-paid.
- **ROADMAP:** per-call conviction receipts (relayer built and proven; no
  shipped surface triggers it) · the attendance Merkle root ("I'm in the
  crowd photo") · mainnet permanence.

## Points (v1 · LIVE)

Stamp your call **+25** · every cheer **+1** (cap 300) · every reaction
**+2** · every minute watched **+1** (cap 130) · at the whistle: exact score
**+200**, right result **+75**, × the conviction dial (up to ×2). Earned on
your device as you live it; folded server-side into the sealed record (the
stricter count — granted cheers, distinct moments). In-play arrivals earn
everything except the full-time bonus.

---

## The gaps audit — live vs. wanted-live (Jul 18)

1. **THE PINS show sample ranks** on any non-empty cabinet (`cabinet.html`
   VIRTUES — hardcoded counters, honest only for empty seats). Four of seven
   are computable today from the fan's real record (ROOT = matches rooted,
   THE CALL = exact verdicts, THE TWELFTH = summed cheers, SEASON TICKET =
   matches lived); the other three lack honest counters and should render
   still-to-earn. **Recommend: fix before Sunday — small, judge-visible.**
2. **In-game emotions: LIVE and in the record** — the dock, the drama
   windows, and (since the Codex triage) the full-time window's reactions
   all land in the crystal. Nothing to close here.
3. **Tonight's record closes old stat gaps by itself:** the roar series,
   moment splits, and arrival waves now persist — Faith Under Fire, Roar
   Elasticity, Aftershock Half-Life, Mood Divergence and Attendance Gravity
   move from NOT COMPUTABLE to computable on tonight's and Sunday's records.
4. **Points leaderboard has no fan-facing surface** (the record carries the
   top five by serial; THE NIGHT card shows totals only). Optional pre-final
   touch — owner's call on whether a board fits the paper language.
5. **Roadmap, stated as such everywhere:** per-call memo receipts ·
   attendance root · server-authoritative personal totals · pins' real
   counters · mainnet · socket multiplexing under the tri-pane.
