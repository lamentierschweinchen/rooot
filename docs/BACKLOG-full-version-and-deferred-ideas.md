# ROOOT — the full version & deferred ideas (backlog)

*For the incoming coordinator instance (and owner/Codex/Design). Companion to `archive/docs-consumed/docs/HANDOFF-2026-07-10-coordinator-session.md`. Its job: make sure the ideas that only ever lived as concepts — or were deprioritized to ship the live prototype — are written down, not lost. Tonight's mandate is the post-mortem Release Gate; THIS doc is everything beyond tonight that the vision includes. Read it so you know what "the full version" means before you make scope calls.*

**Source docs to read for the recorded backlog** (this doc consolidates + points to them; read them for detail):
- `archive/docs-consumed/COORDINATOR-TODO.md` — the coordinator's own backlog (the data/wire/chain/deploy list, the comparisons, feed-widening, data limits).
- `design/ROADMAP.md` — the design build-list / full picture (the app shell, the profile, the seams; ~Jul 19 horizon).
- `design/experiments/LOOM-NEXT.md` — the loom's design journal (A1–A31; loom motion, shootout board, next ideas).
- `archive/design-docs-consumed/design/QUEUE-jul7.md`, `archive/design-docs-consumed/design/BRIEF-*.md`, `archive/design-docs-consumed/design/GAP-ANALYSIS.md`, `archive/design-docs-consumed/design/STATUS-DESIGN.md` — design lane queue + briefs + gaps.
- The YOUR SEAT spec's **"Later" + "Non-goals"** sections: `docs/superpowers/specs/2026-07-09-your-seat-identity-retention-design.md` §9 + §12.
- The task tracker's pending items: **#5 submission · #8 stands · #10 XI card · #11 durability+dynamic fixture · #12 GATE+PRESSING · #13 comparisons · #14 threads · #15 copy+device**.

---

## 1 · THE DATA PRODUCT — "the gaps that ARE the story" (highest-value deferred)

The premiere proved the raw signal (crowd 60% Morocco vs market 14% — a +45.7pt gap). The *product* is surfacing that as first-class, labeled comparisons. Recorded in `archive/docs-consumed/COORDINATOR-TODO.md` P1 as **the JUDGE** ("right now only raw streams surface, not the gaps that ARE the story"):

The seed (`archive/docs-consumed/COORDINATOR-TODO.md` P1) was three comparisons — OPTIMISM GAP (predict−market) · FORESIGHT (belief−result) · UPSET (market−result). **The owner's fuller canonical list (verbatim — these ARE the product; preserve the framing and language):**

1. **Optimism Gap** — how much a fanbase's predicted outcome differs from the market at kickoff. Example: Argentina fans predict 82% win-equivalent while market says 64%. That gap is proprietary ROOOT data.
2. **Doubter Index** — among people rooted for a side, how many predict that side will draw or lose. Even better: track whether the doubters were right. This is very human and very shareable.
3. **Foresight Alpha** — did a fan or fanbase beat the market? Score predictions against final result, but weight them by how unlikely the market said the outcome was when stamped.
4. **Courage-Adjusted Calls** — for rare calls: proved call value = how much the market disagreed at the time. Calling "comeback" at 12% is materially different from calling it at 48%.
5. **Faith Under Fire** — cheer intensity per rooted fan while losing, or while the market gives your side a low chance. This is probably the purest ROOOT stat: loyalty measured without pretending it changes the game.
6. **Roar Elasticity** — how strongly a crowd reacts to market movement, goals, VAR, danger spells, or shots. Some fanbases may be calm, others violently reactive.
7. **Aftershock Half-Life** — how long it takes a stand's roar or mood to return to baseline after a goal, VAR scare, red card, woodwork, or shootout kick.
8. **Held Breath Index** — TxLINE suspensions and possible {Goal|Penalty} moments are gold. Measure how long the market froze, how the crowd reacted, and whether the moment resolved into nothing or history.
9. **Pressure Without Reward** — territory, danger possession, shots, corners, woodwork, and goals let us say: this side pressed and pressed, but reality refused. Not xG, not "deserved," just pressure compared to outcome.
10. **Match Uncertainty / Chaos Score** — market entropy plus probability volatility plus late swings plus score state. Gives every match a collectible "how wild was the belief curve?" rating.
11. **Mood Divergence** — during react windows, measure how far apart the two ends' emotional histograms are. The product line is already there: their dread vs your hope, their disbelief vs your relief.
12. **Attendance Gravity** — which teams, moments, or match states pull people into the room. Join spikes after goals, VAR, danger spells, or social sharing become a real "this moment attracted a crowd" stat.

These are BET vs BELIEVE vs HAPPEN made explicit. Wire them labeled, market ≠ crowd always. **Tonight's blocker #6 (side-aware verdict) is the first brick of Foresight Alpha; the persistence work (blocker #1) is what makes the rest computable — see §2's harvesting mechanisms.**

**Post-mortem product question (unresolved):** every fan predicted in line with their allegiance — "choose your end, then predict" harvests passion but **no doubt / contrarian belief**. Consider decoupling the sequence, or explicitly capturing conviction/doubt, so the gap includes disagreement, not just tribalism. *Owner call.*

## 2 · IN-GAME / LIVE PREDICTION — "mini-preds" (OWNER-ELEVATED 2026-07-10: build to experience)

> **Owner (2026-07-10 evening):** "the v2 in-game predictions are actually something i'd like to have
> or at least explore (need to experience this in-game so i can judge the mechanism) — it's also data
> produced that we can use which is potentially valuable and unique." Judgment mode: he judges by
> EXPERIENCING it during a real match, not from a spec. Coordinator's proposed v1 (pending his nod):
> **NEXT GOAL** — during live play a fan calls which end scores next (or "no more goals"); stamps the
> live de-vigged market triple at call time (BET), aggregates the crowd's split with n (BELIEVE),
> resolves on the next wire goal or FT (HAPPEN); per-fan verdict + crowd tally; persists into the
> SentimentRecord. Chosen for: always-relevant, naturally repeating, resolvable within minutes, and
> the cleanest first feeder for Foresight Alpha (§1.3) and Courage-Adjusted Calls (§1.4). Target:
> server mechanism + minimal Design seam built the day after the ESP–BEL gate night; owner experiences
> it live at the next fixture (NOR–ENG Jul 11 or ARG–SUI Jul 12). Tonight's SentimentRecord/persistence
> substrate (post-mortem blocker #1) already accommodates it additively.

Today prediction is **pre-match only** (side + scoreline, locked at kickoff). The full version is **live, in-game prediction** — recorded only as the open question "**mini-preds?**" (`archive/docs-consumed/COORDINATOR-TODO.md:31`, gating the crowd-frame wiring alongside "gamification? crescendo?"). This lived largely in conversation and is **NOT specced**. Known shape of the idea:

- Live micro-predictions during the match (candidates: next goal / next scorer, next card, the score at the next interval, will the lead hold, penalty outcome) — each a fresh belief tick to compare against the live market + what happens.
- The **data to pull from it**: the crowd's live *belief trajectory* vs the market's live line vs the event stream — a moving BET/BELIEVE/HAPPEN, not a single pre-match snapshot. Per-moment consensus tied to the Pulse drama windows (§4).

**The owner's canonical harvesting mechanisms (verbatim — "the most valuable new harvesting mechanisms would be small"). These are what to BUILD to feed §1's stats:**

- **Persist a full-time `SentimentRecord` for every match** — market summary, prediction consensus, cheer/roar curve, reaction histograms, pressure texture, result, provenance. *(This is post-mortem Blocker #1's durable persistence, done richly — the record IS the data product's substrate. The premiere's was never crystallized because `18209181` was missing from `teams.ts`.)*
- **Keep prediction edit history**, not just the latest prediction. Changing from 2-0 to 1-1 before kickoff is "**nerve drift**," and that is fascinating.
- **Add an optional confidence seal** to predictions or calls, but keep it **non-financial and non-betting in feel**.
- **Persist event-centered windows**: 60 seconds before and 180 seconds after goals, VAR, possible goals, red cards, penalties, woodwork, major market swings. *(These are the same drama windows Pulse/§4 fires on.)*
- **Add a post-match "keep this moment" action.** What fans choose to preserve is itself a beautiful memory statistic. *(Ties into the cabinet/album §6 and the crop-test share loop.)*

**In-game micro-prediction candidates** (still to spec — "mini-preds"): next goal / next scorer, next card, the score at the next interval, will the lead hold, penalty outcome — each a fresh belief tick to compare live against the market line + the event stream, so BET/BELIEVE/HAPPEN becomes a moving curve, not a single pre-match snapshot.

> **Note the sequencing:** none of §1's stats are computable without §2's persistence. So tonight's blocker #1 (durable aggregates) is not just a robustness fix — it's the foundation the entire proprietary-data product is built on. Build the `SentimentRecord` shape with §1 in mind.

## 3 · FEED-WIDENING — more signal off the wire (coordinator, recorded)

From `archive/docs-consumed/COORDINATOR-TODO.md` P1/P2 + `design/ROADMAP.md` §6:
- **Pressure/possession timeline**, **penalty-next-team** prediction, **injuries** (side+player+outcome — parsed, not woven), the **hydration/cooling break** (Action=comment · "Water-drinking break" → a blue water thread, NOT a suspend fallback).
- **positionId → formation** — the XI carries raw position codes; map to GK/DEF/MID/FWD or a formation so design can draw a team-sheet shape.
- **Honest data limits (not fixable by us):** no disallowed-goal REASON on the wire (show "overturned"); possession% is a gated time-share (never false 100/0); territory is an attacking-pressure proxy, labeled; TxLINE coverage can start late (flag + record).

## 4 · PULSE / LIVE MOMENTS (half-built, deprioritized live)

The server emits drama-window "moments"; the live product never wired them (post-mortem: 6 real windows, 0 reactions; picker only fires under DEMO; handler expects an obsolete `verdict` kind). Full version: the **live moment prompt + split-reveal** around the server's feeling tokens (muscle/fire/fear/prayer/disappointment/anger — the six Pulse patches). Tonight: wire to the current schema *or disable honestly* (blocker #5); the rich version is beyond tonight.

## 5 · THE APP SHELL / NAVIGATION — "the biggest structural gap" (design, `ROADMAP.md` §2)

Each room is its own page; nothing ties them into one app. Full version: **the ground is home; the rooms are lenses you turn to** — enter through the door once → land in the ground → a dial swipes the centre between the loom and the stadium, the crowd frames it → tap your end for the full terrace → a quiet corner → your cabinet. Plus **composite coherence** (one score/minute across frame/loom/stadium via a postMessage bridge). This is design's biggest build; the coordinator provides the one-true-score plumbing.

## 6 · THE PROFILE / CABINET / ALBUM — retention (partly built as YOUR SEAT)

The identity/keepsake layer is **built on the `your-seat` branch** (see handoff §5) — passkey wallet, mint-to-fan, album. Deferred *within* it (spec §9 "Later"): **pins/patches as their own assets**, the **season-ticket relic**, **share-cards** (the crop-test social loop — every relic sent to a friend is the next fan's front door), **THE ALBUM** as a season rail (matches-attended, GOT·GOT·NEED across the tournament), cross-ecosystem key migration, the optional **key backup/export** (Task 12), and the **Privy fallback** (Task 7 — needs the owner's appId). **Non-goals (deliberately out, spec §12):** leaderboards, standings, foresight-*ranking*, competitive scores, mainnet, seed-phrase UX, forcing identity at the gate. The seven **virtue pins** are sample today → real counters is post-MVP.

## 7 · THE LOOP BOOK-ENDS + CHECKPOINT RHYTHM (`archive/docs-consumed/COORDINATOR-TODO.md` P0, #12)

- **THE GATE** — pick-an-end + call-the-score must LOCK at kickoff and **notarize on-chain** ("a claim on the future starts when the future does"). `__stands.root/predict` exist; wire the kickoff lock + the labeled on-chain record of both.
- **THE PRESSING** — FT relic (scarf + scorecard + stubs) crystallizes on-chain. *Built + devnet-proven on the your-seat branch; reconcile per handoff §5.*
- **Checkpoint rhythm** — half-time reads the door's call (✅); **OT / penalties re-calls** still to build.

## 8 · SUBMISSION (task #5, by Jul 16 — hackathon)

Tech doc (the architecture: one server, two buses, the honesty law, the seams) · demo video (the loop: GATE → MATCH → PRESSING → ALBUM) · repo cleanup + README · the honesty/feedback write-up. Keep the deploy green through the tournament.

## 9 · CRAFT / POLISH (design, `ROADMAP.md` §5, LOOM-NEXT)

Loom living/breathing motion + shootout-board elevation (woven knots, the held breath); stadium GOAL "symbol + count" + CONTROL plate register; socket the per-team generated balls over the SVG; copy crystallisation (the poetry earns its place once surfaces settle); the loom pre-kickoff "the weave begins at kickoff" affordance (reassessed marginal).

## 10 · AUTOPILOT — match nights with zero team oversight (owner question, 2026-07-10)

The owner's end-state: "everything is set up, everything works" — no human in the loop per game. Honest
assessment: **achievable for normal games; a thin monitored residual remains.** The per-game manual steps
today and their automation path:

- **Fixture rotation** (today: `fly secrets set TXLINE_FIXTURES` + `fixture.json` + landing copy per game)
  → the service already reads `/api/fixtures/snapshot`; it can rotate active fixtures itself and SERVE the
  manifest (`/fixture` endpoint replaces the static file), landing reads `__fixture` → zero per-game touches.
  Tonight's manifest is deliberately the first brick of this.
- **Pre-match assurance** (today: humans re-test) → the canary's smoke mode on a schedule (T-2h, T-30m)
  + `live-monitor.mjs` wired to a notification channel → a green/red light nobody has to ask for.
- **Degraded-mode honesty** (today: a human notices odds-without-scores, coverage gaps — see
  txline-scores-coverage-gap) → automate the DETECTION: surfaces render "LIVE · market only" honestly when
  the scores feed is silent; the human is only paged, never required for the fallback itself.
- **The residual that stays human:** TxLINE token renewal (JWT expires 2026-08-02), platform incidents
  (Fly/Vercel), upstream coverage escalations to TxODDS, and anything product/design. Alerting, not attendance.

Estimate: ~1–2 focused days after the tournament-critical path. Not tonight; tonight's manifest +
persistence + canary are its foundation.

---

## 11 · THE FRIEND LAYER — an additional experience, not a feature (owner call, 2026-07-17)

The Jul-16 cold UX review named this the product's biggest gap: ROOOT gives a fan *a
crowd*, not *their friend* — no inviter identity, shared room, presence, reaction
trail, or post-match two-person recap. The owner's call: this is **an entire second
experience**, deliberately out of the submission and onto the roadmap. The shape when
we build it:
- **Friend-aware deep links** — "Maya invited you · she's in the ARG end"; inviter +
  match context survive the gate.
- **Presence + shared reaction trail** — see your friend's side, prediction, cheers on
  the surfaces you both watch (not chat; ambient).
- **Two-person full-time recap** — who called it, who cheered louder, side by side on
  one keepsake-grade card.
- **Rooms** — a match link that holds a small group's ends together across surfaces.
The minimal **scarf share** (native share of the minted PNG + link) ships in the
submission; the full share-card/OG system rides with this layer.

## 12 · HARDENING DEFERRED FROM THE SUBMISSION (Codex review, 2026-07-16)

Consciously flagged-not-fixed for devnet; first mainnet work:
- **Mint auth** — prove key ownership (server nonce signed by the derived key);
  today anyone can mass-mint at the service's expense (devnet-acceptable).
- **Law-8 fallback** — capture-fail currently mints the code-drawn `scarf-svg`;
  owner decision pending on fail-closed instead.
- **Album fail-closed** when the collection is unresolvable (env-pinned today).
- **Privy claim path** for PRF-less devices (today: honest error only).
- **Hero feed slimming** — the 2.6MB baked replay carries duplicated raw envelopes.

---

## HOW TO USE THIS

Tonight = the Release Gate only. Everything here is **deliberately deprioritized** — do not pull it into tonight's scope. But when the owner asks "what about X" or you're weighing a scope call, this is the map of the full version so nothing gets silently dropped. **§2 (in-game predictions) is the one with a real hole — get the owner/Codex/Design to fill it before it's lost.**
