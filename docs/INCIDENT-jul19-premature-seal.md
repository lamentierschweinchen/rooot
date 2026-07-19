# The final sealed itself at the wrong whistle

*ESP–ARG, fixture 18257739, 19 Jul 2026. Written the same night, from the capture.*

Spain beat Argentina 1–0 in the World Cup final, through Ferran Torres in the
105th minute, in extra time, against ten men.

ROOOT's permanent record of that match says `ESP 0–0 ARG, decided in 90`, and
it was written to Solana devnet at 21:16:15Z — while the match was still being
played. This is what happened, why, and what was done about it.

## What happened

| Time (UTC) | Event |
|---|---|
| 21:15:47 | wire sends `StatusId=5`, score 0–0 |
| 21:16:15 | service crystallizes + anchors `ESP 0–0 ARG, decidedIn: "90"` |
| 21:16:20 | wire sends `StatusId=6` — *end-of-90-before-extra-time* |
| 21:19:07 | extra time kicks off (`StatusId=7`) |
| 21:44:11 | Ferran Torres scores, confirmed, 1–0 |
| 22:02:02 | true full time (`StatusId=10`) |

The seal fired 28 seconds after the 90-minute whistle and 33 seconds before the
wire clarified that extra time was coming.

## Why

`mapLiveStatusId` in `contracts/normalize.ts` folds three StatusIds onto the
`FULL_TIME` phase: **5** (whistle at the end of regulation), **10** (end of
extra time, decided) and **13** (official final seal). Only 10 and 13 are
terminal. 5 fires at the 90-minute whistle of *every* match, including one
heading for extra time.

`predictLifecycle` finalized on the phase alone. It could not tell the
difference, because at the phase level there isn't one.

The ladder was decoded empirically from earlier matches. The comment in
`normalize.ts` recorded the uncertainty honestly — `5` was observed at the
straight-90 whistle of COL–GHA 2–0, a match genuinely settled in 90. The final
was the first live match to reach that rung 0–0 and continue.

Two further mechanisms then made it unrecoverable in place:

- `crystallizeSentiment` skips if a record already exists on disk — the durable
  dedup that stops double-anchoring after a restart.
- `resolvedMatches` (in memory, and persisted into the restart snapshot) means
  `predictLifecycle` never even reaches that disk check a second time.

At the true whistle the service logged nothing at all. It already believed the
match was over.

## What the fans saw

A `FULL TIME` keepsake with a COLLECT button, offering a scarf for a 0–0 result,
while the header clock ran on into extra time. The keepsake showed `CHEERS 0`,
`MINUTES WATCHED 0`, `POINTS +0` — the premature seal caught the reaction
windows empty.

Nobody collected. Had they, the mint is idempotent per `(pubkey, matchId)`, so
that fan could never have been given the correct scarf afterwards.

## What was done

**The bug is fixed.** A full-time from `StatusId 5` is now *provisional*: held
for a six-minute grace window, cancelled outright if play continues
(`EXTRA_TIME`/`PENALTIES`), finalized at once if a terminal 10/13 arrives, and
finalized on expiry if neither happens. The break codes 6/8/11 return `null`
from `mapLiveStatusId` and never reach the service, so the continuation itself
is the signal. The measured 5→extra-time gap that night was 200 seconds.

The cost is a delayed seal on a match genuinely decided in 90. That is the right
trade: a late-but-true record beats a prompt lie.

`services/stands/src/dev/fulltime-regulation-check.ts` pins the discriminator
against the real envelopes off the wire that night. The capture is gitignored,
so that check is now the surviving evidence of the sequence.

**The chain is corrected by addition, not erasure.** The premature anchor stays.
`scripts/correct-record.ts` rebuilds the record from the raw capture and anchors
a second entry whose hashed body names the record it supersedes and why.

| | record hash | anchor |
|---|---|---|
| premature | `c287badf714d…` | `5795aa2T3tH2…` |
| corrected | `79f4182ed673…` | `pYvzwKuisiNf…` |

Evidence for both is in `docs/pitch/evidence/`, captured within the hour before
devnet pruning.

Recomputed from the wire via the same builder functions the live seal uses:
`finalScore`, `phasePath` (now carrying `EXTRA_TIME`), `decidedIn: "ET"`,
`events`, `divergence`, `headline`, hash. Carried over verbatim: the crowd. The
fans' predictions, cheers, presence and points were really made and really
counted — the premature seal did not invent them, it graded them against the
wrong final.

Regrading flipped the crowd's foresight from **wrong** to **outcome**. They had
called a Spain win all along, and the premature record told them they had missed.

Events are deduped by ledger id and exclude the wire's own discards, so both
chalked-off Spain goals are absent and the winner appears once.

## A number that is honest but misleading

`upsetIndex` reads **0.94**, and the derived headline says "an upset the money
never saw". Spain were the pre-match favourite at 42%. The claim overstates it.

This is an artifact, not a fabrication. The wire published no extra-time 1X2
market — the capture carries only `period='full'`, last tick 21:13:42Z — so
`market.etClose` is honestly `null` and `computeDivergence` falls back to
`market.close`, the 90-minute line, which had correctly settled to `DRAW 94%`.

The number has not been hand-patched; it is what the real builder computes from
real data. The formula should mark `upsetIndex` not-computable for an
extra-time-decided match with no extra-time market, rather than fall back.
That is a `contracts/` change and a coordinator call.

## What the night proved worked

- **The capture.** 46,896 lines, unbroken through both VAR reviews, the red card,
  the winner and the terminal whistle. Two upstream gaps recorded faithfully: a
  70-second drop the recorder healed itself, and a 250-second market suspension
  where the connection stayed open and the upstream simply went quiet.
- **The held breath.** Both Spain goals that were chalked off arrived
  `Confirmed: false` and were never shown. The overturn at 113' reverted the
  scoreline via a discard carrying the corrected total. The uphold at 105'
  settled through a re-emitted confirmed goal. Both VAR branches behaved.
- **The roster.** Recorders started at T−74, ahead of the ~T−60 lineups
  broadcast, so the scorer resolved by name from the wire's own envelope.
- **The refusal to invent.** An `action_discarded` carrying no `Score` block was
  correctly ignored rather than treated as a 0–0 reset.

The honesty machinery did its job all night. The phase ladder is what failed.

## Still outstanding

- The service's volume still holds the premature record, so the live site still
  shows the 0–0 seal. Correcting it needs the record file removed **and** the
  `resolvedMatches` flag cleared from the restart snapshot — the flag is
  restored on restart, so removing the file alone is not enough.
- `upsetIndex` fallback, above.
- The cutover has deliberately **not** been run: it would put a sealed result on
  the front door while the service still serves the wrong one.
