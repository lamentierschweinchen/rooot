# BRIEF — The Stat Families (coordinator → design)

*The definitive list of stats we can compute off the TxLINE wire, and the honest
data contract you build against. Verified against real match recordings, Jul 7.
Coordinator owns the wire → `window.__stats`; you own how they're worn.*

---

## The one rule that shapes everything

**We only ever show what the wire actually says. Counts are counts, never dressed as
percentages. Every rate is derived from the counts, client-side — nothing is served
as a %.** A stat with no data shows an honest blank (`—`) or is withheld, never a
faked 0 or 50/50. This is the delete test: every dot means something.

Two consequences you'll feel:
- **Possession %** is the one *computed* number — a time-share of the possession
  stream, honestly **gated** (withheld until ~90s AND both sides have had the ball,
  so a fresh mid-match join never shows a false 100/0). Until then it falls back to
  the **territory** share, clearly relabelled "PRESSURE · SHARE OF TERRITORY".
- **On a late join, the count families accumulate from when the fan connected**
  (the score is authoritative and always correct; the rest are since-connect until
  server-side accumulation lands — a coordinator P0). Don't present a late-join count
  as a full-match total without that caveat.

---

## The data contract — `window.__stats`

Opt in with `?statsfeed=1` (or on `/`, `/live`, `/count-live.html`, `/stadium.html`).
Subscribe: `window.__statsAdapter.onStats(cb)` → fires on every update. Shape:

```
{
  minute,                       // match minute (number | null)
  home: SideStats, away: SideStats,
  var: [ {type, outcome, minute} ],   // MATCH-LEVEL (see note) — not per side
  pending: [ ... ]              // families not yet decodable (empty = all resolved)
}
```

`SideStats` (per side):
```
goals,                                       // authoritative (Score.Total) — always correct
shots: { total, onTarget, offTarget, blocked, woodwork },
corners, fouls, offsides, freeKicks,
cards: { yellow, red },
possessionPct,                               // computed time-share, gated (null until trustworthy)
territory,                                   // pressure share 0..1 (fallback for possession)
attacks: { danger, highDanger },
subs:    { count, moves: [ {inName, outName, minute} ] },
injuries:{ count, list:  [ {player, outcome, minute} ] },   // outcome ∈ OnPitch|NotReturning|OffPitch
penalties:{ scored, missed, retake, list: [ {taker, outcome, minute} ] },
scorers: [ {name, type, minute} ]            // type ∈ Shot|Head|Own
}
```

Names (scorers, subs in/out, injured player, penalty taker) all resolve through the
same **`lineups` roster** the wire sends — so you get real player names, free.

---

## The families — where each comes from

**PER-SIDE (all computable):**

| Family | Wire source | Detail you get |
|---|---|---|
| goals | authoritative `Score.Total` | count (always correct, any join) |
| shots by outcome | `shot` · `Data.Outcome` | OnTarget · OffTarget · Woodwork · Blocked |
| corners | `corner` | count |
| cards | `yellow_card` / `red_card` | yellow · red |
| **fouls** | `free_kick` (non-Offside type) | count |
| **offsides** | `free_kick` `FreeKickType='Offside'` | count |
| possession % | `possession` spell stream | time-share (computed, gated) |
| territory | danger / high-danger pressure | share (computed) |
| **subs** | `substitution` · `Data.Participant` | in + out **names**, minute |
| **injuries** | `injury` · `Data.Participant` | **name** + outcome (OnPitch / NotReturning / OffPitch), minute |
| **penalties** | `penalty` + `penalty_outcome` | Scored / Missed / Retake + **taker name**, minute |
| **scorer + type** | `goal` · `Data.GoalType` + `PlayerId` | **name** + Shot / Head / Own, minute |

**MATCH-LEVEL (NOT per-side — the wire gives no side):**

- **VAR** — `var` carries `Data.Type` (Goal · Penalty · RedCard · SecondYellowCard ·
  CornerKick · MistakenIdentity · Other); `var_end` carries `Data.Outcome` (**Stands**
  = decision upheld · **Overturned** = reversed). Paired by proximity. There is **no
  side on the event** — you may *infer* one from the adjacent goal/card, but the wire
  won't hand it to you. Surface it as a shared "VAR" strip, not a per-end number.
  *(Note: there is no disallowed-goal REASON field yet — offside vs foul — so a chalk-off
  shows "overturned" without inventing why.)*
- **Warming-up / on the pitch** — `players_warming_up` / `players_on_the_pitch` carry
  no side and no data. It's the pre-match "in the tunnel" **moment**, not a per-side count.

**NOT NEEDED — the numeric `Stats` block:** the "one email" decode is done. Possession,
shots, offsides, fouls do **not** live in the opaque numeric `Stats` map — they're all
events (above). The `Stats` block is only a redundant, period-bucketed tally of
goals/cards/corners. Ignore it.

---

## Derived rates (compute from the counts — never faked)

All client-side, pure functions of the counts:
- shot accuracy = `onTarget / shots.total`
- conversion = `goals / shots.total`
- box share, foul-to-card ratio, etc. — same idea

Present a rate only when its denominator is non-zero; otherwise `—`.

---

## Status (what's live vs coming)

- **Live now:** goals · shots-by-outcome · corners · cards · fouls · offsides ·
  possession % (gated) · territory · danger.
- **Wiring now (coordinator):** subs · injuries (parse done, surfacing) · penalties ·
  scorer+type · the match-level VAR block. `pending` will report anything still blocked.
- **Coordinator P0 behind all of it:** server-side full-match accumulation so every
  count is correct on any join, and recording every match (the API keeps no history).

Build against the contract above — it won't change shape as the to-adds land; the
fields just start carrying data. Ping the coordinator for any family you want surfaced
differently.
