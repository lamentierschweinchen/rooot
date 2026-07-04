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
  After a level 90th minute the market resolves to draw≈1 and DIES — extra
  time happens outside it. (An ET-market seam is an open decision; the
  death itself is honest, dramatic data.)

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
