# ROOOT — Data Architecture (the blueprint we should have started with)

*Written 2026-07-14, after a week of building without a data engineer and paying
for it. This is the honest map: what the system is (named properly), what the
suffering actually was, what we adopt now, and what's roadmap. Sources: four
research passes mapped against our code — `scratchpad/research-{sports-data,
crowd-systems,event-sourcing,anchoring}.md` — each claim cites code or a source.*

## 1 · The confession, quantified

We built the backend feature-by-feature without naming the data patterns we
needed. The tax, incident by incident:

| Incident (this week) | The missing name |
|---|---|
| OOM ×3 nights — matches never freed | **State lifecycle / eviction policy** |
| `anchorTxSig: null` on every record | **Transactional outbox** (write, then reliably do the side effect) |
| Late joiners saw "LIVE" after full time | **Hot state vs durable record** — two read paths, one truth |
| Starting XI empty in two live games | **Event replay** — one-shot events must be recoverable |
| Three matches mashed on one screen | **Reference data** — fixtures/teams hardcoded in 8 files |

The strongest single piece of evidence: the **idempotent consumer** pattern was
hand-reinvented **four separate times** in `server.ts` (`openedTriggerIds`,
`nextGoalResolvedIds`, `resolvedMatches`, `sentimentRecordExistsOnDisk`) — and
"parse a recorded capture into typed events" was reimplemented **four times**
across `replay.ts`, `bake-demo.ts`, `_tofeed.mjs`, `replay-inspect.ts`. Nothing
was architecturally wrong; everything was unnamed, so nothing was shared.

## 2 · What the system actually is (named)

ROOOT is an **event-driven projection system with a durable record layer and an
on-chain commitment layer**. Named properly:

```
TxODDS SSE  ──▶  normalize.ts  ──▶  in-memory projections  ──▶  surfaces (WS)
 (the wire)      (projection)       (per-match state,           (gate/terrace/
                                     folds, counters)             loom/stadium)
      │                                   │
      ▼                                   ▼ at full time
 fixtures/*.jsonl                 sentiment record (JSON, volume)   = materialized view
 (recorded event log,                     │
  hand-run recorder)                      ▼
                                  sha256 → SPL-Memo anchor          = commitment layer
                                          │
                                          ▼
                                  Metaplex Core scarf (Collect)     = the fan's copy
```

**Research-validated convergences** — patterns we built independently that match
production systems (see the four research docs for sources):

1. Token-bucket cheer throttle — Twitch's shape (`decay.ts`)
2. Heartbeat-verified presence, not raw connections — Discord/Slack (`server.ts`)
3. Windowed reveal with cross-restart dedup — ahead of documented precedent
4. Compensating events, never mutation (VAR reversals) — Sportradar's model (`normalize.ts`)
5. Ring-buffer join-replay + durable seal for late joiners — Betfair/Ably continuity
6. Hash-only anchor for big records, inline memo for small — OpenTimestamps-correct (`relay.ts`)
7. Tolerant reader / additive schema evolution — snapshot v1→v6
8. Outbox-with-repair-sweep — `crystallizeSentiment` + `backfillAnchors`

**The honesty differentiator is real, not a strawman:** MLB's pandemic fan-noise
app converted real taps into a *percentage* for playback — the exact fork our
law #1 forbids. No researched system documents an "honestly empty" rule like
ours. Honest counts are a product moat, and now a research-backed claim.

## 3 · The honest gaps

- **The live service is not event-sourced.** `snapshot.ts` persists mutable
  state every 30s, not the events that produced it; a mid-window crash loses
  the window. The event log exists only when the recorder is hand-run.
- **Reference data is scattered** — fixture/team info hardcoded in 8 files;
  `contracts/feed.ts` already declares a `fixtureInfo` message no one emits.
- **No feed gap-detection** — reconnects resume from zero knowledge; TxLINE's
  `Seq` field is parsed nowhere (verify monotonicity before trusting it).
- **Correction matching is heuristic** (kind+clock+side) because the wire sends
  no back-reference id — a wire limitation to watch, not ours to fix.

## 4 · Adopt now (cheap, each hours-not-days)

| # | Change | Fixes | Effort |
|---|---|---|---|
| 1 | Server emits `fixtureInfo` from `teams.ts`; surfaces consume by id | the 8-file hardcode, forever | hours |
| 2 | Populate `txlineRefs` with real TxODDS validation proofs pre-hash | "relics carry their own provenance" — free under the existing anchor | hours |
| 3 | `eventstore/` module: ONE canonical capture-reader + named projections | the 4× parser reinvention; the data-explorer seed | done tonight (shadow) |
| 4 | Watermark log per fixture (last-dispatched `Ts`) + post-reseed assert | silent gap risk on reconnect | half-day |
| 5 | Anchor `fingerprints.json` (same helper, new kind) + Core immutability flag | the sellable dataset gets a commitment; "yours forever" becomes on-chain fact | small |

## 5 · Roadmap (named, costed, not now)

- **Write-side event sourcing** — the live service appends events (disk-budgeted,
  byte-capped, rotated) and rebuilds projections at boot. Real engineering: we
  carry a fresh 200GB scar from an unbounded log. Post-tournament.
- **SQLite + Litestream as the durable layer** — the documented single-node scale
  path (we're already on Fly volumes). Adopt when the record count justifies it.
- **Sharded fan-out** — only past ~5-10k concurrent sockets per match room.

## 6 · The data story (what an acquirer is buying)

Per match, ROOOT produces a dataset nobody else has: **what real fans believed,
timestamped against what the market believed that second, resolved by what
actually happened** — plus per-fan longitudinal fingerprints (optimism,
foresight, loyalty across matches; `docs/SENTIMENT.md`). Every record is
hash-anchored on-chain at the whistle, market claims carry the provider's own
merkle proofs (adopt #2), and the counts are honest by construction (see §2).
The engagement mechanism that generates this data is the same product the fan
loves: root once, cheer constantly, call rarely, keep what you lived.
