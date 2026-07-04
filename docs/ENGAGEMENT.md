# ENGAGEMENT / RETENTION — the prediction spine (owner direction, Jul 4)

*Owner's frame: this is the retention mechanism. Logged here + staged for the
design session. Coordinator's read on honesty + wireability included.*

## The core loop: ROOT + PREDICT

When a fan enters, they do two things, not one:
1. **ROOT** an end (existing — which stand you're in).
2. **PREDICT** a final scoreline (new — "I say 2–1 Argentina").

The prediction is the **universal, one-per-fan CALL made at entry** — low
friction, everyone makes exactly one. It's stamped with the market's triple at
that second (the receipt), resolved at full time → the scorecard/keepsake. This
UNIFIES the mechanics: the rare drama-spike calls become the *premium* calls on
top of the universal entry prediction; the keepsake has a spine (were you right?);
and the reason to come back is built in — you're invested in an outcome you named.

## What it unlocks: THREE beliefs, one honest object

We now have three distinct belief signals about the same match:
- **THE MARKET** — TxLINE de-vigged odds (sharp money / bookmakers).
- **THE CROWD** — fans' aggregated predicted scoreline (NEW).
- **THE RESULT** — what actually happens.

"On average, people think this ends 2.1–0.9" is a real, honest, free statistic
(our own data). The *gap* between crowd and market is content: fans are
optimistic about their team — now measurable. The gap between both and the
result is the drama, notarized.

**HONESTY RULE (extends market≠crowd):** the crowd prediction is NOT blended
into the market tide. It's a distinct visual language — e.g. a GHOST target /
pins on the loom (where the crowd thinks it lands) beside the woven market body
(live probability) and the sewn patches (actual goals). Three beliefs, three
materials, never mixed.

## Filters — the interesting part

Slice the crowd prediction by:
- **rooted end** — "Argentina fans predict 2.4–0.8; neutrals predict 1.9–1.1."
- **prediction itself × allegiance** — the richest cut: "of Argentina fans,
  70% predict a win, 20% a draw, 10% a LOSS" — the *doubters within a fanbase*.
  Honest, human, and content a flat neutral bucket could never give.

## The NEUTRAL question (owner leans no — coordinator agrees, with a twist)

**Recommendation: NO standalone neutral STAND.** A neutral end breaks the
two-sided honesty geometry (the loom has two selvages, the pitch two goals,
"lose the match win the stands" needs you IN a stand). It would also become the
low-commitment default that drains the two ends.

**BUT decouple PREDICTION from ALLEGIANCE.** You can root Argentina and predict
a draw — honest, and it delivers the no-affiliation signal *better* than a
neutral bucket: the market-comparable "unbiased" baseline comes from everyone's
predictions regardless of end, and you additionally get the doubters-within
content above. The genuine no-affiliation watcher is already served by the
existing **"adopt an end for 90 minutes"** path — a choice to experience a side,
not a lifelong claim. So: two ends only; prediction is its own axis; adopt-an-end
is the honest neutral's door.

## THE STANDS — where the social lives

The social layer (the universal prediction + its aggregate, the rare calls,
event reactions/sentiment, row/team chat) mostly lives in a distinct **STANDS**
area — a panel/section that is the social home. It also *informs the live
visual* at the edges (the loom's "crowd weaves the border"): rooted counts in
the selvage, the prediction-consensus as the ghost target on the belief thread,
reactions as sparks. The Stands is the room; the cloth shows its shadow.

## Wire implications (coordinator — all honest, all free, our own data)

- **New crowd message**: `predict { anonId, side, home, away, atMs }` on the
  stands service (contracts/crowd.ts). One per fan; re-predict allowed until
  kickoff, then locked (a prediction is a claim on the future — lock it when the
  future starts).
- **Server aggregation**: mean + modal predicted scoreline, group-by rooted
  side, group-by predicted-outcome. Ships as a periodic `consensus` StandsState
  field or its own message. ~cheap (one number set, not per-fan).
- **Resolution**: at FT, each prediction → exact/outcome/wrong, feeds the
  scorecard's FORESIGHT and the "were you right" keepsake line.
- **Ties into**: the existing receipts/relayer (a prediction is the entry call,
  optionally on-chain), the scorecard ratings (FOR already = foresight), the
  loom's ghost-target render.

**Nothing here needs an external API.** Predictions are our own crowd data; the
market comparison is TxLINE; the result is the wire. All free, all honest.
