# Starting XI empty in both live games — root-cause diagnosis (read-only)

Matches: NOR–ENG (18213979) and ARG–SUI. Tomorrow: France–Spain (18237038).
Verdict: **candidate (c) — a timing / process-lifecycle gap.** Not (a) baked-only,
not (b) API-Football, not (d) shape mismatch, not (e) never-fetches.

## Data-flow map (source → adapter → render), with the break point

1. SOURCE — the TxLINE **scores** SSE stream. Lineups ride it as a one-shot
   `Action:"lineups"` envelope carrying BOTH full squads (`Lineups[]`, top-level),
   per player `starter/starred/rosterNumber/positionId/player.{normativeId,preferredName}`.
   NOT API-Football (docs/DATA.md:75 "NOT USABLE and NOT NEEDED"; the key in
   `.secrets/api-football.json` is parked/unused — no code reads it).
2. PARSE — `contracts/normalize.ts:322 parseLineups()` → `{ fixtureId, byPlayerId,
   lineup:{home,away} }`. Verified against a REAL envelope from
   `fixtures/scores-night-20260703.jsonl` (fixture 18176123): Action/FixtureId/
   Participant*/Lineups[] all present, 11 `starter===true` per side, real names
   ("Beach, Patrick"). **Parser and its output shape are correct — not the bug.**
3. INGEST — `services/stands/src/ingest/txline.ts:148-155`: on a `"lineups"` line it
   (a) UNCONDITIONALLY latches `rosterByFixture.set(fid, r)` (this is what names
   goals/cards/subs), and (b) emits `{type:'lineup'}` only if `fixtureIds.has(fid)`.
4. CACHE + REPLAY — `services/stands/src/server.ts:692-693` stores
   `snapshotFor(matchId).lineup = msg`; `:739` replays it to every freshly-joined
   socket ("who's playing — instantly"). Correct — replays only what it holds.
5. CLIENT ADAPTER — `apps/web/public/stats-adapter.js:265` `case 'lineup': stats.lineups
   = msg.lineup`. Starts `null` (:81).
6. RENDER — `apps/web/public/stadium.html:579-580` `var lu=s.lineups||{};
   fillXI(el('xiH'),lu.home,...)`. `fillXI` (:489-490) prints
   **`TEAM SHEET NOT IN YET`** when the array is null/empty.

**Break point = between the wire and step 3/4.** If the stands service is not
holding a `lineup` snapshot, everything downstream is honest-empty.

## Why it was null in BOTH games (the proof)

- **Lineups are a one-shot, PRE-KICKOFF event.** Across all 14 fixtures in
  `fixtures/scores-night-20260703.jsonl` the first `lineups` envelope lands
  **-20 to -114 min before kickoff (typically ~-45 min)**, 1–4 emissions, then never
  again. (Computed from receivedAtMs vs the `kickoff` action per FixtureId.)
- **SSE has no replay of past events.** A stands connection established after the
  drop never sees that fixture's lineups on the live stream.
- **The startup snapshot seed does NOT recover lineups.** `txline.ts:365-429`
  seeds `/api/scores/snapshot/{fid}` on (re)start — but it was purpose-built for
  status/score/CLOCK recovery (its comments + the CLOCK-SEED block only inspect
  StatusId/Clock; built at CAN–MAR Jul 4 for "KICK OFF SOON / still tide"). The
  captured service state `services/stands/captures/premiere-fra-mar-18209181-*.json`
  holds subs/cards/goals but **zero lineups** — i.e. the snapshot the service keeps
  does not retain the one-shot roster. (Open item: confirm by probing
  `/api/scores/snapshot/{fid}` for `"Action":"lineups"` — see Fix 0.)
- **No disk persistence of the roster.** `snapshot.ts` crystallizes fanStats /
  moments / triggers only — never `snap.lineup` / byPlayerId. A restart cannot
  reload lineups from disk either.
- **Direct evidence, NOR–ENG (docs/sprint-log/NOTES-double-header-2026-07-11.md):** the wire
  WAS emitting `lineups` pre-KO (monitor at 22:44 "now seeing … `lineups`,
  `players_warming_up`"), yet the Fly **service** was unstable around the match —
  pre-KO restarts and a 23:22–23:26 "LIVE-SEVERITY … Fly service path unresponsive"
  entry — amid the Jul 11–13 OOM/restart churn (git: stands OOM, match eviction,
  footage byte-cap, fly.toml 512mb pin). A service whose current in-scope SSE
  connection started AFTER ~-45 min never held the roster.
- **Same envelope names the BOOK and BENCH.** `normalize.ts:644` (goals), `:1015`
  (cards), `:1041` (injuries) resolve names via `roster.byPlayerId.get(pid)`. Roster
  is built ONLY by `parseLineups`. So the one missing envelope empties the TEAM
  SHEET *and* nulls every player name in THE BOOK / THE BENCH — exactly the audit's
  "team-sheet + BOOK/BENCH break on null player names." One cause, three symptoms.

Operational trigger (either/both, both fit "both games"):
(i) service restart/redeploy after the pre-KO drop; (ii) fixture added to
`TXLINE_FIXTURES` (static per-deploy env, `index.ts:52-54`) via a deploy after the
drop. Both reduce to: the in-scope SSE connection began after the one-shot lineups.

## Is lineup data available at all? YES.
Real XIs are on the TxLINE scores wire, pre-KO, same license (docs/DATA.md:66-74,
"Messi 28' … all from tape"). The pipeline parses them correctly. The only problem
is CATCHING the one-shot before/at connect time and surviving a restart.

## Fix plan (ranked by effort)

**Fix 0 — Probe the snapshot (5 min, no code, decides Fix 2's shape).** With the
token, `GET /api/scores/snapshot/{18237038}` and grep for `"Action":"lineups"`.
- present → the seed already recovers lineups; the bug is purely "service wasn't up
  / fixture not in TXLINE_FIXTURES at boot" → Fix 1 suffices, just verify the seed
  log `snapshot for {fid}: N envelopes replayed`.
- absent → the seed structurally can't recover it → land Fix 2a.

**Fix 1 — SMALLEST, makes real XIs show tomorrow (operational, no code).** Deploy
stands with `18237038` in `TXLINE_FIXTURES` and bring it up **≥60–75 min before KO**
(before the one-shot drop) and DO NOT restart/redeploy it through kickoff. Verify
live: `live-monitor.mjs 18237038` (or a client) receives a `lineup` msg and the
stadium TEAM SHEET fills with real names pre-KO. Fragile: any OOM restart in the
window loses it again — leans on the OOM fixes already landed.

**Fix 2 — ROBUST recovery (small code, the real fix).**
- 2a (preferred if Fix 0 shows snapshot lacks lineups): in `seedSnapshot`, fetch the
  lineups explicitly on startup (dedicated TxLINE lineups/roster REST endpoint if one
  exists; the wire clearly has the roster server-side) and replay through `dispatch`
  exactly like the existing seed. ~15–30 lines in txline.ts.
- 2b (defense in depth): persist `snap.lineup` + byPlayerId to disk (extend
  snapshot.ts crystallize) and reload on boot. Only helps if the process-lineage saw
  lineups at least once; a cold first-boot-after-drop still needs 2a. So 2a primary.

**Fix 3 — HONEST fallback (design; if lineups genuinely don't arrive at runtime).**
Keep the honest empty state; sharpen copy at `stadium.html:490` from
`TEAM SHEET NOT IN YET` to state the timing truth (e.g. `LINE-UPS DROP ~1H BEFORE
KICK-OFF` pre-match). **Never fabricate players** (honesty law #1). Empty-when-unnamed
is correct behavior, not a bug to paper over.

## Tomorrow (France–Spain 18237038) recommendation
Run Fix 0 now. Do Fix 1 regardless (service up 60+ min early, fixture pinned, no
restart through KO). If Fix 0 shows the snapshot lacks lineups, land Fix 2a before KO
so an OOM restart can't wipe the sheet again. Verify at runtime that a `lineup`
message arrives and the TEAM SHEET shows real names before kickoff. If lineups
genuinely never arrive, ship Fix 3's honest copy — do not fake names.
