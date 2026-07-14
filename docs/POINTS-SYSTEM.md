# ROOOT — The Points System (decision of record, 2026-07-14)

Owner-approved after an independent pressure-test (`scratchpad/points-pressure-test.md`).
Points are a **measure of proven foresight**, never a currency. This spec is the source of
truth; the tonight-shippable slice and the full build are both defined below.

## The five decisions (locked)

1. **Signed edge over the number you faced.** A call's worth = `round(100 × (happened − p))`,
   where `happened ∈ {0,1}` and `p` = the probability you faced at the moment you called.
   Netted across your calls. **Wrong subtracts.**
2. **Two foils, never crossed.** Score/outcome calls grade against the **de-vigged market
   (1X2)**. NEXT GOAL grades against the **crowd's split** (the market never prices "next
   goal" — borrowing its odds would fabricate a number, law #1). Market is shown as *context
   only* on NEXT GOAL.
3. **Server-authoritative, derived — not a stored balance.** Points are a pure function of
   facts the service already stamps and seals; recompute from the sealed record → same number.
4. **They translate into:** a line in your sealed on-chain record · the virtue **pins** (struck
   at a threshold *count* of real events) · a **per-fanbase** season fingerprint.
5. **Tonight: show the real verdict, no new backend.**

## Why signed (the property that makes it honest + unfarmable)

`reward = 100 × (happened − p)` is a proper scoring rule. Consequences:
- Right on a 20% call → **+80**; wrong on it → **−20**. Right on a 65% favorite → **+35**;
  wrong → **−65**.
- **A fan whose belief equals the number scores 0 in expectation, every pick.** You only gain
  by seeing what the market/crowd didn't.
- **Straddle-proof:** two accounts taking both sides of a 2-outcome call sum to exactly 0
  *before* the result (`+(1−p)` and `−(1−p)`). Kills favorite-farming, spam-calling
  (EV-0 per extra call), late-syncing to the market (agreeing earns nothing), and sybils.
- This is the sharpened form of "courage-adjusted calls" already in the contracts
  (`marketAtPredict`, crowd.ts:126) — not a new idea, the honest version of an existing one.

## The data (what exists vs what the build adds)

**Already stamped + sealed (so tonight is display-only):**
- NEXT GOAL resolution carries `outcome` · `happened` · `marketAtCall` (crowd.ts:271-275),
  persisted through restart (snapshot.ts:170).
- Gate prediction carries `marketAtPredict` (crowd.ts:136) and resolves to
  `verdict: exact | outcome | wrong` (crowd.ts:252).
- The server holds the opening de-vigged triple (accumulator `market.open`; `tripleWindow`).

**The build adds (small, additive):**
- `crowdAtCall` — the crowd's NEXT GOAL split at call time, so NEXT GOAL scores against its
  correct foil (crowd, not market). `marketAtCall` stays as display context.
- The derived point function (below) + its persistence into `FanStats` / the sealed record.
- The kickoff market baseline surfaced to the *live* client (for honest drift — see Plate).

## The scoring, precisely

- **GATE score/outcome** (at full time): `100 × (hit − marketAtPredict[outcome_you_picked])`.
  `hit=1` if your predicted outcome (W/D/L) occurred. Exact-score is a separate commemoration
  line, not extra signed points (keeps the rule one clean thing).
- **NEXT GOAL** (per resolved call): `100 × (hit − crowdAtCall[end_you_called])`,
  `hit=1` if that end scored next (or 'none' resolved at FT).
- **Presence** (cheers/minutes): **not scored.** It's real and it's shown as counts, but it is
  never summed into the foresight number — mixing effort with edge is the dishonesty to avoid.
- A match's points = the netted sum of the above. Carried per fanbase for the season fingerprint.

## What points become — and the bright line

- **Sealed record line:** e.g. *"3 calls · 2 proved · +58 vs the numbers you faced."* Written
  into the SHA-256-anchored `SentimentRecord` at full time, bound to your passkey at Collect.
- **Virtue pins** (struck at a threshold *count of real events* — monotonic, non-spendable, a
  service medal not a balance): THE ROOT (matches rooted) · THE CALL (calls proved) · AGAINST
  THE TIDE (proved a call the foil rated unlikely, edge over a threshold) · THE TWELFTH (cheer
  volume). Bronze→silver→gold by count. Mint as Metaplex relics like the scarf. *(Thresholds
  are the owner's to tune; the principle — count of real events, not a point balance — is fixed.)*
- **Per-fanbase season fingerprint** (collective): *"England's fans beat the market +9% this
  tournament."* No individual standing.

**The bright line (law #3): a point measures & commemorates — it is never spent, bought,
traded, staked, or ranked against other fans.** No personal leaderboard (an explicit non-goal
in the backlog, and the gambling-feel trap).

## The plate stats (companion decisions)

- **HEART vs HEAD** = of fans rooting a side, the share who predict *their own team to win* is
  HEART; draw or loss is HEAD. From `consensus.byRoot`. Client-derivable, no backend.
- **Drift since kickoff** must baseline at *kickoff*, sent by the server (accumulator open), or
  a late joiner measures drift from their arrival — two fans, two "drifts," dishonest. Until
  the server baseline ships, the label must read **"since you joined,"** not "since kickoff."

## Tonight (FRA–ESP 19:00) vs the build

**Tonight — terrace only, no backend, honest:** delete the client `+10 XP`. On a resolved
call, show what the server proved: *"SPAIN SCORED · you called it ✓ · the market gave them
22%"* and a this-match tally *"2 of 3 right"* (survives reload via verdict replay; never summed
with cheers). Drift label honest per above.

**The build (this week, none blocking the match):** stamp `crowdAtCall`; the derived signed
point function; seal the points line into the record; wire one pin end-to-end (THE CALL) as the
first real translation; the per-fanbase fingerprint; the server kickoff-drift baseline.
