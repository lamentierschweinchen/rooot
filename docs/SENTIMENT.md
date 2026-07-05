# ROOOT — THE THREE SENTIMENTS (conceptual grounding)

*Owner's framing (Jul 5): we capture three kinds of sentiment. This names them,
their differences, and where the value + beauty live. Not a rebuild of anything
below the app — a LENS on it. It also flags what the backend should persist so
the comparison becomes valuable, not just visible.*

## BET · BELIEVE · FEEL · HAPPEN

Three sentiments plus reality — four different relationships to the same
uncertain event:

| | what it is | source | clock | character |
|---|---|---|---|---|
| **BET** — market | what you'd *wager* | TxLINE de-vigged 1X2 | continuous, **LEADS** | calibrated, cold, money-backed |
| **BELIEVE** — fan | what you *think* will happen | predict + allegiance + calls | fixed at entry (locks at KO) | considered, **biased by hope** |
| **FEEL** — in-game | what you *feel* as it unfolds | react/pulse + roar/cheer | real-time, **LAGS** the event | reflexive, present-tense, raw |
| **HAPPEN** — result | what actually occurs | the wire (goals/score) | the events themselves | the judge |

The three clocks are the key: the **market leads** (it prices a goal in as the
danger spell builds), the **prediction is a fixed reference** (a claim on the
future, set at kickoff), and the **reaction lags** (the roar spikes *after* the
ball hits the net). Around every event there are three phases —
anticipation (market) · expectation (belief) · aftershock (feeling) — with the
event as the pivot.

## The value is in the GAPS, not the streams

No single stream is the product. The comparisons are:

- **BELIEVE − BET = the optimism gap.** "The market gives Argentina 65%, but
  Argentina fans predict 2–0 (≈80%)." Fan bias, *measurable, per fanbase* — a
  proprietary dataset nobody else has (it's our own crowd, not scraped).
- **BELIEVE − HAPPEN = foresight.** Who called it. The scorecard's FOR; the
  season-long "sharpest fanbase."
- **BET − HAPPEN = the upset.** Where the money was humbled — the drama the
  single probability bar erases.
- **FEEL vs the moment's real import.** Did the home end erupt 🚀 at a goal the
  market says barely helped them (an offside pending)? The gap between felt
  emotion and objective meaning = how *in-tune* a crowd is.
- **FEEL split across ends.** "Their 💀 vs your 🚀" — the emotional asymmetry of
  one moment.

## Beautiful: three materials, one cloth — never blended

The honesty rule (market ≠ crowd) generalizes: **three sentiments, three visual
materials, never mixed.**
- BET = the woven ground (the belief tide) — already the loom's body.
- BELIEVE = a **ghost target** on the cloth (where hearts think it lands),
  distinct from the woven weft.
- FEEL = **sparks / pulse** at the moments (the reaction bursts, the roar edge).
The drama is watching all three converge on HAPPEN. A judge feels the arc in
the *relationship between the layers* before reading a number.

## Valuable: the sentiment fingerprint (a data product)

Persisted over a tournament, each fanbase gets a **sentiment fingerprint**:
- **optimism** (mean BELIEVE − BET),
- **volatility** (how much FEEL swings per event — sentiment beta),
- **foresight** (BELIEVE − HAPPEN accuracy),
- **loyalty under fire** (faith: FEEL intensity while behind).
This is at once a collectible identity ("the most deluded / most loyal / sharpest
fanbase") AND a genuine data product — the **fan-sentiment index** a broadcaster
or sponsor would pay for: market vs crowd vs result, per fanbase, provable
on-chain. It's the commercial-path axis of the judging with real substance.

## What we already capture vs what the backend should PERSIST

- **Captured live (in-memory, per match):** BET (market curve → MatchArc ✓),
  BELIEVE (predict consensus ✓ wired; allegiance/roar ✓; calls ✓ relayer),
  FEEL (react/pulse — schema'd, next to build; roar ✓).
- **The gap for VALUE (comparison over time):** persist a per-match
  **SentimentRecord** at full time — the market curve summary + the fan
  consensus (by end) + the reaction histogram (by moment) + the result — so
  divergences are computable across matches and the fingerprint accrues.
  Today these live only in the match room and die at FT. The keepsake pipeline
  (MatchArc + provenance) is the natural home: extend it to carry the fan +
  reaction aggregates, and the sentiment dataset becomes a durable, provable
  by-product of the keepsakes we already mint. No new capture — just don't
  throw the aggregates away.

## One line for design

Every surface is really showing **bet vs believe vs feel, resolving into
happen.** If a mark isn't one of those four (or a gap between them), question it.
