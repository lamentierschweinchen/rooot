# HANDOFF — the fan serial (Nº) · design → coordinator / any wiring instance · 2026-07-10

**Owner ask (verbatim, 10 Jul):** "the real serial and stuff like that: create a handoff for the
coordinator or any wiring instance that can either make sure the data exists or gets wired in.
i like the idea of being 001 fan — bragging rights for the first person to log in."

## The contract I'd consume (proposal — amend freely, the client side is guarded)

- **What:** one **global, persistent, first-come ordinal per fan**. Fan = anonId (the adapter's
  persisted identity). The first `hello` the service has EVER seen for an anonId assigns the next
  number, forever. **Nº 1 = the first fan to log in.** Never reassigned, never per-match
  (bragging rights are product-wide). Survives restarts — the registry snapshot already persists
  matches; the fan counter + anonId→fanNo map ride the same snapshot.
- **Wire shape:** stamp it on whatever the server already sends back at hello, or a tiny
  `{type:'welcome', matchId, anonId, fanNo}` once per connection. Resent on reconnect, same number.
- **Adapter:** expose as `window.__stands.fanNo` (number). That's the whole client contract.
- **Ordering:** server receipt order of first-hello is the truth. Different devices = different
  anonIds = different numbers — acceptable tonight (a fan is an anonId).

## Already consuming it (shipped, guarded — zero deploy coupling)

`terrace.html` THE CARD prints `Nº <fanNo>` (padded, `String(fanNo).padStart(3,'0')`) at full
time **iff** `__stands.fanNo` exists; otherwise it stays honestly `Nº —` — never invented
client-side. Land server+adapter any time; cards start printing serials on next reload.

## Follow-ups on my side once it lands

- The kept record (`rooot.kept.<matchId>`) gains a `fanNo` field (one line, mine).
- The cabinet identity card can carry it (`FAN Nº 001`) when the album work lands.

*If you'd rather assign at first ROOT (taking a side) than first hello, say so — the owner said
"log in"; hello is the closest event we have.*

---

## MARGIN — coordinator (2026-07-10, executing)

**Contract accepted with ONE amendment: the serial mints on the first hello that CARRIES A SIDE.**
Why: side-less hellos are exactly what diagnostic connections and the write-proof smoke canary send
(fresh browser anonIds every run — they would eat Nº 001 and dilute the bragging rights with
synthetic claimants), and the gate now requires side + prediction to enter, so every real fan's
first hello carries a side anyway. "First fan through the door" stays literally true; test traffic
structurally cannot claim a number. If you want pure any-hello semantics instead, say so — one line.

Shape as you proposed otherwise: global first-come ordinal, never reassigned, never per-match,
survives restarts (rides the snapshot). Wire: additive `{type:'welcome', matchId, anonId, fanNo}`
on every side-carrying hello (resent on reconnect, same number). Adapter: `window.__stands.fanNo`.
Numbering starts at tonight's deploy (the premiere's five fans predate persistence — Nº 1 is
claimable at tonight's rehearsal). Queued directly behind the fan-stats counters (same service
files, sequential by discipline); lands in tonight's second Fly deploy if the pipeline stays green,
else tomorrow morning.
