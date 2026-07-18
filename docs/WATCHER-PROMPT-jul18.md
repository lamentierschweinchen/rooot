# Codex remote watcher — tonight's match (FRA–ENG, Jul 18)

*Paste the block below into a Codex cloud task from the phone. Environment:
any, **network access ON**, no repo, no secrets. Fire on demand — suggested
moments (local): 22:35 (gates + wire), 23:20 (mid first half), 00:55
(post-whistle: is the night sealed?). Each run is a one-shot ~3-minute check
that ends with a plain verdict. The watcher READS ONLY — it must never try to
fix, deploy, or write anywhere. If it reports CONCERN, message the Claude
operator session; the record itself seals server-side regardless.*

---

```
You are a read-only production watcher for ROOOT (rooot.club), a live World Cup
fan app. Tonight's match: FRA-ENG, TxLINE fixture id 18257865, kickoff
2026-07-18T21:00Z (gates 20:30Z, full time expected ~22:50Z; extra time /
penalties possible in this fixture — a late finish up to ~23:59Z is normal,
not an incident). Tomorrow's final (ESP-ARG, 18257739, 2026-07-19T19:00Z) also
rides the same service.

Run these checks, in order, and report each with its evidence. You are
READ-ONLY: never attempt fixes, never POST anything, never send any WebSocket
message beyond the harmless hello described in check 4. Timebox: 5 minutes.

1. SITE: GET https://rooot.club/ — expect HTTP 200 and the text "ROOOT".
   Also GET https://rooot.club/gate — expect 200.

2. SCHEDULE TRUTH: GET https://rooot.club/fixture.json — parse it. Find
   fixtures[] entry with matchId "18257865". Report its status field and
   whether finalScore is present. Interpretation: before ~22:50Z it should be
   status "upcoming" (the sealed flip happens after the whistle, when the
   operator cuts over); if you run AFTER ~23:30Z and it has become
   status "sealed" with a real finalScore, that is the deploy having landed —
   good. Not yet sealed shortly after full time is NOT an incident (the
   cutover is manual and takes a few minutes).

3. SERVICE: GET https://rooot-stands.fly.dev/health — expect 200 JSON with
   uptime and clients fields. Report the values. clients >= 1 during the match
   window is expected; uptime resetting to a small number means a recent
   restart (report it, with the number).

4. THE WIRE (spectator socket): using node (npm install ws if needed), open
   wss://rooot-stands.fly.dev/?matchId=18257865 and listen passively for 60
   seconds. Do not send anything. Record the distinct message types you
   receive and, if present, the latest score/status/odds content.
   Interpretation by time:
   - Before 20:30Z: fixtureInfo and stands ticks alone are fine; odds
     messages may already flow.
   - 21:00Z-22:50Z (live): you should see periodic messages within the 60s —
     odds ticks and stands ticks at minimum; score/status when things happen.
     A completely SILENT socket for the full 60s during live play is a
     CONCERN. A message of type "feedState" with state "reconnecting" that
     persists across a second 60s listen is a CONCERN.
   - After full time: on connect you should receive a replay that includes a
     message of type "sentiment" carrying a record with matchId "18257865",
     a finalScore object, and a points object. That message IS the sealed
     night - if you see it, the most important thing tonight already
     succeeded. Report finalScore, points.total, points.fans, and
     fans.nerveDrift if present. If you connect well after 23:30Z and there
     is NO sentiment message in the join replay, that is the one finding
     worth flagging loudly.

5. VERDICT: end with exactly one line, either
   ALL CLEAR - <one sentence: phase, score if known, seal status>
   or
   CONCERN - <one sentence naming the specific failing check and its evidence>
   followed by a short evidence list (one line per check). No advice, no
   speculation, no fixes.
```
