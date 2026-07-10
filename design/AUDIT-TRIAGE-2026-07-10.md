# Audit triage — FRESH-EYES-AUDIT into lanes (coordinator, 2026-07-10 ~15:00)

> **PRIORITY OVERRIDE (owner, 2026-07-10 evening — supersedes the "tomorrow" scheduling below and
> the earlier demo re-bake yes):** *"At the moment I don't care about the demo even a little bit.
> The only thing I care about is pushing development on what's usable. Sample data is interesting
> insofar as it can help us with development (e.g. feeding a data feed so we can ensure it is read
> and displayed correctly). We're not even close to needing to create a demo for judges. We need to
> push the product."*
>
> Applied: **C2, C4, C5 are PARKED** (demo-only). **C1 parked** except any live-surface half.
> **C3 splits:** the demo re-bake is parked; whether the LIVE adapter passes player names stays
> relevant (live wire carried scorer names at the premiere — verify tonight in passing). **C7 stays
> high** — the added-time clock is a live-match problem. The audit's demo/walkthrough findings remain
> recorded here (nothing lost), but nobody spends time on them until the owner reopens the demo.
> Sample data (baked SUI–COL replay, canary's local stack) remains sanctioned as dev tooling only.

*Companion to `design/FRESH-EYES-AUDIT.md`. Two clocks tonight: the LIVE gate (kickoff 21:00 CEST —
the post-mortem Release Gate, live paths) and the DEMO walkthrough (judges, Jul 16). The audit is
demo-scoped; most findings are demo/seams work. Items marked **LIVE-TONIGHT** are on tonight's real-fan
path and jump the queue.*

## Coordinator lane (data / adapters / sim / bake) — I take these

| # | Item (audit ref) | When |
|---|---|---|
| C1 | **`__loom.mode: 'live' \| 'replay'`** — the adapter currently drives demo cloth as `live`, which makes the loom masthead lie (LIVE on a tape, §3.2) and makes THE PRESSING unreachable in demo (§1.2-8, `ended=(!M.live…)`). I add an honest additive mode signal to `loom-adapter.js` + `demo-feed` path; Design switches masthead label + seal gating to consume it. | tonight, after the gate chain |
| C2 | **crowd-sim honesty** — reveal tallies real `momentReact` picks instead of write-only (kills the hardcoded "6,730 / 9,900" fabrication, §3.4 BLOCKER, with Design's render fix); rooted counter actually moves on ROOT (§4.2). | tonight-late / tomorrow |
| C3 | **Event player-names null in the bake** — Design's ORIGINAL P0 (their handoff §P0), re-confirmed by audit (§7 note). Re-bake `plate/demo-suicol.js` with names; THE BOOK / BENCH render real names. | tonight-late / tomorrow |
| C4 | **Demo shared clock substrate** — lenses each boot their own 150s replay (§3.1 BLOCKER "dial resets the match"). I provide one shared replay epoch (demo-feed start-epoch param / parent-owned clock); Design wires the lenses to ride it. | tomorrow (judges path) |
| C5 | **Re-bake demo fixture with goals** (§1.2-7: the walkthrough is a 0–0 — GOOOL, goal-mouth ball, chalk-off never fire; ARG–CPV 3–2 data exists in `plate/arg-cpv-data.js`) — data side of a joint job with Design (copy, samples, `demo-seat` alignment). | owner call → tomorrow |
| C6 | *(already in flight)* consensus `n` on the wire ✓ · discrete `cheerEcho` (chain T2) · 3-state verdict replay (chain T4) — the data behind §4.2's open blockers. | today, in the chain |

## Design lane (their `.html` — handing back with data attached)

**LIVE-TONIGHT (real fans hit these at 21:00):**
1. **Terrace crowd-vs-market panel** (§3.4-1, audit's #4 verdict): decimals read as a broken second
   scoreline; no `n`; unlabeled market. The data is ready now — consensus carries `n`/means/outcome
   (my data-shapes handoff §2). "THE CROWD SAYS SUI · THE MARKET SAYS COL 39% · 14 CALLS IN" needs
   only pixels.
2. **Terrace keepsake verdict → 3-state** (§1.1-3, `terrace.html:453-455`) — `predictVerdict` sends
   `exact|outcome|wrong` at FT (replay-on-reload lands today, chain T4). The Release Gate's "correct
   side-aware verdict at full time" renders HERE.
3. **Gate lurker lockout** (§2 BLOCKER, `gate.html:233`) — owner call below; if agreed, make the call
   skippable tonight (side-only entry). Cheap, and it's the front door real fans hit first.
4. **Landing de-stale** → tonight ESP–BEL (already in my data-shapes handoff; `__fixture` is live).

**Post-gate / judges (their queue, audit §§2–5):** no-legend sweep (loom panel, stadium rings/
instruction bar) · FT beats on ground/stadium + FT→cabinet seam (KEEP writes, cabinet pull) ·
keepsake-from-scarf seam (§3.5 BLOCKER) · showcase dead-language rewrite + mode-carry links ·
CONTROL card + possession-vs-territory on the overview (post-mortem blocker, `stadium.html:507`) ·
demo side-carry (`ground.html:169-176`) · voice sweep (DE-VIGGED, 1X2, XP, "1 OFF") · gold-seam
canon (§4.2: possession seam + shuttle borrow gold — pick the canonical meaning).

## Owner calls (three, crisp)

1. **Gate: make the call optional?** Audit BLOCKER; the laws' lurker is locked out at the door, and
   optional-call also softens the post-mortem's allegiance-priming worry. *Recommend: yes, tonight.*
2. **Specimen quiz (killed Pulse v1) — delete for good?** Still wired with `correct:` scoring, "+10
   XP", and an invented market quote, one back-button from the honest demo (§1.1-4, §3.6).
   *Recommend: yes — Design rips it out; the six-feeling pulse (real schema, my §4 shapes) is the
   replacement.*
3. **Re-bake the demo around a match with goals** (ARG–CPV 3–2 exists) so the walkthrough shows
   GOOOL/seal/keepsake — the judges' beats. Joint Design+me, ~half a day. *Recommend: yes, tomorrow,
   not tonight.*

## Owner verdicts (2026-07-10 afternoon — these are canon)

1. **Gate: NOT optional — the lurk option is removed.** Pick a team, predict a result; entry requires
   both. The audit's BLOCKER-1 recommendation is overruled. AND fix the score mechanism: keep
   tap-to-set (no arrows, no keyboard) but the tap **cycles — after 9 it wraps to 0** (today it dead-ends
   at 9 with no way back). Design lane, tonight (it's the live front door).
2. **Specimen quiz:** explained to the owner, verdict pending below.
3. **Demo re-bake around an exciting game: YES** — tomorrow, joint (my C5 data + Design copy/samples).

## C7 · The added-time clock (owner, 2026-07-10) — CONFIRMED on the wire, contract to follow

The premiere capture proves the shape: odds-tick minutes ran `44 45 46 47 48 49` (first half played
45+4 as literal 46–49), then the second half **rewound to 45**: `49 → 45 46 47 48 49 51…`. Minutes
45–49 occur twice in one match; same will happen at 90+N → ET. Any axis keyed on raw minute
double-books that cloth. The fix is split:

- **Mine (adapter/data):** phase-qualified time on every timed datum — `(phase, minute)` + a display
  label in football notation (`45+2′`, `67′`, `90+4′`), phase tracked from the status feed; ordering
  key = (phase, minute), never minute alone. Lands as an additive enrichment on `__loom`/`__stats`
  after tonight's gate chain; exact shape goes into HANDOFF-2026-07-10-tonight-data-shapes.md when it ships.
- **Design (the loom + any timeline):** a piecewise axis — each half's band as long as it truly ran
  (45+N is *woven length*, duration-true), a half-time selvage seam between bands, marks labeled in
  football notation. "45+3" sits at the end of the first band; "46′" starts the second — they never share x.
- **Tonight:** live loom behaves exactly as it did at FRA–MAR (survived, unflagged) — not gate-blocking;
  C7 queues directly after the chain.

## What the audit does NOT change

Tonight's live-gate chain (manifest ✓ → presence → persistence → verdict replay → canary) is
untouched by the audit and stays the critical path — the audit explicitly did not re-verify live
paths. Demo/walkthrough findings queue behind the 21:00 gate, then become the pre-submission list.
