# THE SUBSTRATE — every datum ROOOT has, for the design session

*Written by the coordinator for the owner-driven design instance. This is the
raw material. It contains NO aesthetic direction — the owner brings taste.
The one law it carries is the owner's: **EVERY DOT ON THE DISPLAY SHOULD MEAN
SOMETHING.** The delete test: remove any mark that carries no datum; if the
information content is unchanged, the mark was decoration.*

## The data, by stream (all real, all live-proven, three full matches vaulted)

### The market (odds stream, TxLINE devnet, ~60s delayed StablePrice)
- **1X2 win-probability triple** (home/draw/away, de-vigged, sums to 1):
  observed cadence bursts to ~1/sec pre-match, every 2–15s in-running;
  ~900–2,600 usable ticks per match after downsampling (bundles keep ALL
  ticks around events — "protected swing ticks").
- **Full history is available** (the bundle is in client memory; a seam
  exposing the tick ring to any renderer exists in the ledger builder and
  can be widened on request). The market is not just a current value — it
  is a CURVE with thousands of real points.
- **Suspensions**: during goal checks the feed emits EMPTY price vectors —
  the market literally holds its breath (6 suspended ticks around the
  ARG–CPV equalizer). These are data, currently invisible.
- **The 90' settlement**: the primary 1X2 settles on the 90-minute result.
  After a level 90th minute it resolves to draw≈1 and DIES — honest,
  dramatic data in itself. **BUT the wire keeps a full ET-scoped 1X2 alive
  (MarketPeriod:'et' — 464 real ticks during ARG–CPV's extra time, same
  de-vigged triple shape), plus 'penalties'-period markets during a
  shootout. The belief-curve can honestly continue through every phase —
  the period hand-off seam is a coordinator commitment (~2h) whenever the
  design wants it, provided the surface labels the market it's showing.**

### The match (scores stream, real-time, UpperCamelCase envelopes)
- **Goals** with a confirmation ladder: unconfirmed → confirmed (~90s
  apart) → enriched (GoalType, PlayerId). Each carries clock + score line.
- **The full event palette, each with minute/clock + acting side**: shots
  (with Outcome upgrades — e.g. Woodwork — via amend envelopes), corners,
  free kicks, yellow/red cards, substitutions, injuries, announced
  additional time, `possible {Goal|Penalty}` (the held-breath VAR moment),
  retractions (action_discarded), **danger/high-danger possession spells**
  (live pressure, per side, timestamped — currently parsed and shown only
  as folded ledger minors), **penalty_outcome per shootout kick**
  (Scored/Missed, per side).
- **The complete 13-rung phase ladder** (kickoffs carry running clocks;
  breaks don't; two terminal shapes + two seal shapes — all observed live).
- **Clock**: seconds, continuous, with clock_adjustment corrections.

### The crowd (stands service, wss://rooot-stands.fly.dev — real, deployed)
- **Rooted counts per end** — live joins; every increment is one real
  human choosing an end. (The service knows each anonId; the wire ships
  counts at 4Hz. Per-join deltas are derivable client-side from count
  changes; a per-join event seam is a small service addition if wanted.)
- **Cheers** — real taps, batched per fan per 120ms, decayed server-side
  into roar (cheers/sec per end, 3s window). Delta-per-tick is derivable:
  every unit of roar traces to actual thumb hits.
- **Faith** — the trailing side (derived from score, never from the crowd
  bus); when on, that end's cheers count double in the stands score.
- **Presence** — connected fans per end (in the service registry).

### The receipts (calls — devnet memo path, relayer pending)
- A call = claim + minute + THE MARKET'S TRIPLE AT THAT SECOND + txSig +
  proved/pending. The fan's conviction, notarized against the curve.

### The keepsake pipeline (already built, data-pure)
- MatchArc: downsampled odds path (~20s buckets, 443 points for AUS–EGY),
  goal marks, verdict aggregates, provenance refs. The relic printers
  consume ONLY this — a keepsake is already a data object.

## The current display, audited (what encodes vs what decorates)

CARRIES DATA: territory extents (3 numbers) · 50% seam (1 constant) ·
score/clock/phase chips · every ledger row (one wire event each — the one
surface that already passes the law) · swing chips (2 real ticks) · rooted
counts (2 numbers) · roar meters (2 numbers) · faith badge (1 bit) · feed
state (1 enum) · REPLAY badge.

DECORATION (fails the delete test): every individual dot inside the
territory fields (pattern fill; the field's EDGE is the datum) · all crowd
pictogram figures + bunting/flag rows (fixed art next to a real number) ·
paper tooth/grain/vignette/warm-drift · ink jitter/rim-gain/weight-breathing
(last night's pass — reverts cleanly if directed; it's isolated in
lib/ink.ts) · print frame/caption/serial in LIVE mode · the roar-ring
instrument (redundant with the meter) · pop-ball except as brand mark.

Ratio today: ~fifteen live numbers carried by tens of thousands of marks.
That ratio is the diagnosis.

## THE PRIME REFERENCE (owner-named): AI Reach / the Large Labor Model

largelabormodel.com — the owner's own work (local: `/Users/ls/Documents/AI
Reach/ai-reach/`, incl. `docs/hero-2041.png`, the `mirror/` interactive, and
`design/Revisions/mirror-albers-wireframes.html`). Why it is the standard,
as observable fact: the hero is THIRTEEN RECTANGLES and nothing else — each
one a territory of work, its AREA the real worker count, its color its
identity, its label the name + two numbers. Zero texture, zero chrome; every
unit of ink maps to real people; it passes the delete test at 100% while
being bold, colorful, and beautiful. The design session should open the live
site and the local mirror pages before proposing anything.

## Mappings the data can support 1:1 (FACTS, not designs — form is the
design session's; each line just states that the data exists to honor it)

- **One mark = one rooted fan.** 8,153 rooted = 8,153 marks (with an HONEST
  printed bin scale once density demands it — "· = 10 fans" stated on the
  surface). Joins appear live.
- **One spark = one cheer.** Roar becomes the visible decay of real taps.
- **The pitch as the match's timeline.** Rows = minutes; each row's split =
  that minute's real probability triple → the tide becomes the ENTIRE
  market curve woven so far, the live edge is now, suspensions print as
  visible held-breath gaps, and the full-time surface IS the keepsake
  forming all match long (watch → own, one object).
- **Every event pinned at its minute** on that same structure (goals,
  cards, woodwork, danger spells as pressure runs, each shootout kick).
- **Your call = your mark at your minute** stamped with the curve's value —
  the receipt, visible in the weave.
- **A schematic pitch** is fully compatible with all of the above — the
  data needs geometry, not scenery.

## Engineering commitments (mine, on request, same-day)

1. Odds-history seam: expose the full tick ring (typed, read-only) to any
   renderer. (~1h)
2. Crowd delta seam: per-join / per-cheer-burst events over the existing
   socket if count-derived deltas aren't enough. (~2h, service + client)
3. Decoration strip: lib/ink.ts character + tooth/grain OFF behind one
   switch; live-mode chrome already separable. (~1h)
4. ET-market decision support: enumerate what other SuperOddsTypes the wire
   carries in-running for a knockout (evidence scan of the vault). (~1h)
5. Whatever seam the design session names that the data can honestly feed.

## RICHER STATS — the answer (evidence-scanned Jul 4, live matches)

**We already have most of it, FREE, from TxLINE — just unsurfaced.** Per
complete match, from the SAME scores stream we parse:
- **Corners** — running totals per period (Score.{H1,H2,ET,Total}.Corners). Clean numbers.
- **Cards** — Yellow/Red running totals per period (Score.*.YellowCards).
- **Shots** — ~57–63 `shot` actions/match, each side-tagged + minute-stamped.
  Special outcomes (Woodwork, …) arrive via action_amend. (Clean on-target
  split is NOT reliably amended — see gaps.)
- **Possession — DERIVABLE and honest**: the possession-spell stream
  (possession / safe / attack / danger / high_danger, each side + clock)
  gives time-share. PROVEN: ARG–CPV → ARG 65% possession (matches reality).
  BONUS: **dangerous-possession share** (ARG 70%) — quality/territory, not
  just quantity. Richer than a flat % and on-brand (data-as-experience).
- **Free kicks, throw-ins, goal kicks** — countable from actions.
- **Goals** — scorer names (rosters), GoalType (header/own/…).

**THE OPAQUE WIN: the `Stats` block.** Every scores envelope carries a
`Stats` map — 64 distinct keys, 19 go non-zero per match — of numeric
stat-key → value. The OpenAPI models it as a free-form `Map_ScoreStatKey`
(keys NOT enumerated), so we can't decode "7008"=4 etc. without TxODDS's
stat-key catalog. This almost certainly holds shots-on-target, offsides,
fouls, possession% pre-computed. **ACTION: one email to TxODDS for the
ScoreStatKey legend — free, they're the sponsor, and it's a strong
API-feedback-bank item ("publish the stat-key catalog / add it to the IDL").**

**GENUINELY MISSING from TxLINE** (would need external): passes / pass
accuracy, clean shots-on-target count, xG, formations, player-level stats.

**External APIs — verdict: DON'T PAY YET.** API-Football FREE tier is DEAD
(live-probed: "Free plans do not have access to this season" for WC2026).
Its PAID tier (fixtures/statistics: shots/possession%/passes/pass%/fouls/
offsides, ~$19–39/mo) would hand us the pre-computed sheet incl. passes —
the one thing TxLINE lacks. But TxLINE already covers the fan-legible core
(possession, territory, shots, corners, cards) for free and IN OUR PIPELINE.
Recommendation: surface the free TxLINE stats first; email for the Stats
catalog; only buy API-Football paid if passes/pass-accuracy prove essential
to the design AND the decoded Stats block doesn't contain them.

## THE FIVE THREADS — now wired (for the Full Cloth prototype, Jul 4)

The design's "Full Cloth" (throughlines-jul4.html) needs five continuous
threads + typed event marks. All five are now REAL seams, proven on ARG–CPV:

| Thread | Source | Seam | Shape / range |
|---|---|---|---|
| BELIEF | 1X2 odds | `onOdds` (OddsTick) + `period:'full'|'et'` | pHome/pDraw/pAway 0..1, sums 1 |
| POSSESSION | possession spells | `onSpell` → `TextureBuilder` → TextureSample.possession | {home,away} share 0..1/minute |
| PRESSURE | danger-grade spells | same → TextureSample.pressure | {home,away} threat-share 0..1 |
| TEMPO | event rate | `builder.pushTempoAt(minute)` → TextureSample.tempo | events/minute (int) |
| CROWD | rooted/roar | `CrowdView` (contracts/ledger) | counts + roar/s, never mixed |

`TextureBuilder` (archive/src-spa-frozen/apps/web/src/texture) is pure + subscribe()-based like the
ledger builder; `parseSpell` (normalize) is the stateless atom. ReplaySource
forwards spells via `onSpell` — the loom prototype on replay consumes it now.
Proven: at 58' CPV held 90% possession AND 100% pressure — they scored. The
cloth's masthead claim is literally the data.

**Typed event marks (ledger enrichments, all live):** goal `goalKind`
(Shot/Head/Own — sew the right patch) · shot `detail`
(OnTarget/OffTarget/Blocked/Woodwork) · VAR as a **span** (`var`→`var_end`,
detail OPEN/END + outcome e.g. "Stands") · penalty outcome, cards, subs,
injuries — all in `parseLedgerMessage`.

**DEFERRED (deliberate, not blocking the prototype):** the LIVE service
texture channel. Spells are ~5k/match — shipping them raw to every socket is
a firehose. Correct design: the SERVICE runs a TextureBuilder and broadcasts
~90–120 `TextureSample` FeedMsgs (one/minute + a live partial), not raw
spells. Build that once the prototype consumes texture AND not onto a live
service mid-match. Replay path (the prototype's test bed) needs nothing more.
