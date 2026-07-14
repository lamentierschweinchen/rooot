# HANDOFF — ROOOT coordinator session → new instance (2026-07-10)

*You are the incoming coordinator instance for ROOOT. The prior coordinator hit its context window mid-effort and wrote you this. Read it fully before acting. It is self-contained: it assumes you know nothing about this project.*

---

## 0 · READ-FIRST (in order)

1. This file (top to bottom).
2. `docs/POSTMORTEM-fra-mar-2026-07-09.md` — the live-game post-mortem. **This is your mandate for tonight.**
3. Your auto-loaded memories (in `~/.claude/projects/-Users-ls-Documents-Beautiful-Blockchains/memory/`): `project_rooot.md` (repo + design canon + owner working method — CRITICAL), `rooot-your-seat-branch.md` (the identity layer you built), `rooot-live-premiere.md`, `rooot-loom-event-curation.md`, `txline-*` (the data feed).
4. `design/HANDOFF-coordinator-data-wiring.md` — Design's ownership contract with you (data vs surfaces). **Read before touching any `.html`.**
5. `design/GAP-ANALYSIS.md`, `design/STATUS-DESIGN.md` — Design's current state.
6. `docs/BACKLOG-full-version-and-deferred-ideas.md` — **the full-version vision + every deprioritized idea** (the data product / the three comparisons, in-game "mini-preds", feed-widening, the app shell, the album, the book-ends). Read it so you know what "the full version" means and what is deliberately OUT of tonight's scope — and note §2 (in-game predictions) has a real hole the owner must fill.

**Repo:** `/Users/ls/Documents/ROOOT` (macOS case-insensitive; the post-mortem writes it `/rooot`). Working branch is `main`. There is a separate worktree at `/Users/ls/Documents/ROOOT-your-seat` (see §5).

---

## 1 · WHAT ROOOT IS

A World Cup fan-experience artifact on Solana (devnet), for the TxODDS Solana hackathon, live at **rooot.club**. The thesis, now **proven live**: **BET vs BELIEVE vs HAPPEN** — the betting market's number, the crowd's real belief, and what actually happens are three different things, and the *gap* between them is a proprietary signal. On Jul 9 (France 2–0 Morocco) five real fans produced it: the market gave Morocco ~14%, the crowd gave Morocco 60% — a **+45.7pt heart-vs-market gap**. That is the whole product in one number.

**Surfaces** (`apps/web/public/*.html`, static, served by Vercel): THE DOOR/gate (pick a side, call the score, read the market), THE GROUND (shell that iframes the others), THE LOOM/`woven-loom.html` (the match woven as cloth — market is the ground, play is the cords, events are stitched), THE STADIUM (the pitch as a map + THE BOOK + THE BENCH), THE TERRACE/stands (two-ended real crowd, cheer, Pulse reactions), THE CABINET (YOUR SEAT — the fan's kept relics/album), the walkthrough/showcase.

**Design language — PAPER & CLOTH** (`design/PAPER-AND-CLOTH.md`): paper documents/steps; cloth lives/breathes. **Honesty is a hard canon gate** (`design/HANDOFF.md` §3): market ≠ crowd, counts never shown as %, **nothing renders or mints that didn't happen**, no faces/FIFA marks. Copy law: plain, adult, no exclamation marks, show-don't-tell, no self-regard. Host-nation colour fields (verde/rojo/azul/blanco). The owner **steers by verdicts on frames** — sketch/show, don't write laws.

**Backend:** `services/stands` — a Node/TypeScript service on **Fly** (app `rooot-stands`, `wss://rooot-stands.fly.dev`). It ingests the **TxLINE** live SSE feed (odds/scores) for a fixture and broadcasts `FeedMsg` over WebSocket. Client adapters (`apps/web/public/*-adapter.js`) fold those into `window.__loom` / `window.__match` / `window.__stands` / `window.__stats` that the surfaces read.

---

## 2 · THE LANES (who owns what — coordination is the #1 lesson)

The post-mortem's core lesson: components were solid, the *assembled product + coordination* failed. **Stay in your lane; two instances never edit the same file.**

- **You (coordinator / data / backend):** `services/stands/*`, `apps/web/public/*-adapter.js`, `window.__seat`/`__album`/`__stands`/`__match`/`__loom`/`__stats` interfaces, the mint/on-chain path, `demo-*.js` data stubs, deploy (`flyctl deploy` is allowed; **`fly secrets set` is OWNER-ONLY — you are blocked, give the command**), git/origin reconciliation *for your own commits*.
- **Design:** all `apps/web/public/*.html` render, the visual language, the surfaces. They wrote you `design/HANDOFF-coordinator-data-wiring.md`.
- **Codex:** led the live game-time response; authored the post-mortem; owns the 3 unpushed `main` commits.
- **Owner (Lukas):** steers by verdict; runs `fly secrets`; makes product calls. Email lukas.c.seel@gmail.com. Builds art-quality blockchain viz; very high design bar.

**Commit trailer on every commit:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. No backticks in `-m`. Devnet only; never mainnet; never put secrets in argv/logs/commits; `.secrets/` never committed.

---

## 3 · WHERE THINGS STAND (2026-07-10 midday)

- **The premiere happened** (Jul 9, France 2–0 Morocco). Thesis proven; assembled product failed. See the post-mortem.
- **The proprietary data is captured + durable:** `services/stands/captures/premiere-fra-mar-18209181-919c9af.json` (1.9 MB, 1722 msgs — full reconstructed match + the locked consensus: n=5, France-end both 2–1, Morocco-end all Morocco mean 1–2.33, crowd 60% Morocco). *Codex was asked to `git add` it; verify it's committed.* The raw predictions live only in the Fly process memory — **a Fly restart loses them until durable persistence lands (Blocker #1)**.
- **Git state:** local `main` was **3 commits ahead of `origin/main`** (`919c9af`, `abaada6`, `a327b40` — Codex's game-time fixes; production has them). **Codex was asked to push these to `origin/main` (Blocker #7).** Verify `origin/main == main == production` before trusting a fresh checkout.
- **Production (rooot.club)** still shows the finished match as "LIVE NOW" — stale (Blocker #8 / Design+owner).

---

## 4 · THE GOAL (tonight, Jul 10)

Owner's words: **"something very solid including most functionalities at least at prototype level."** The concrete bar is the post-mortem's **Release Gate**:

> Two fresh mobile sessions can enter opposite ends, see the correct pre-match market, submit distinct predictions, observe each other's first cheer, switch every lens without losing presence, join after a goal without a false eruption, and receive the correct side-aware verdict at full time. Production identifies the same commit as `origin/main`.

Treat the next game as **one stateful product lifecycle**: one fixture identity, one session, one transport, durable aggregates, an explicit live acceptance test.

---

## 5 · YOUR SEAT — built, needs RECONCILIATION not merge (a whole workstream is already done)

The prior coordinator built the **entire identity/custody/retention layer** — self-custodial fan identity (passkey wallet, WebAuthn-PRF → ed25519, "your face is the key"), relics that **mint to the fan's own key while the service pays** (Metaplex Core, **proven on devnet**: asset `7gWZaRHGJTqhK17BhmqEvJMa1PRfoayCJipFfKc2mkjK`), a profile store, an album (DAS), claim-at-PRESSING, reload-persist. **18 commits on the `your-seat` worktree branch** (`/Users/ls/Documents/ROOOT-your-seat`, base `c9ffc84`), each spec+quality reviewed + a whole-branch review. Spec: `docs/superpowers/specs/2026-07-09-your-seat-identity-retention-design.md`. Plan: `docs/superpowers/plans/2026-07-09-your-seat-identity-retention.md`. Full task ledger + every open Minor: the worktree's `.superpowers/sdd/progress.md` (gitignored).

**CRITICAL — do NOT merge it as-is.** It was built assuming the coordinator would edit `cabinet.html` + `woven-loom.html` (its Task 8). But **Design owns those surfaces and already wired them to the `window.__seat`/`window.__album` interface** (commit `41bd5b2`). So per `design/HANDOFF-coordinator-data-wiring.md`, the reconciliation is:

- **DROP** the `your-seat` branch's `cabinet.html` + `woven-loom.html` edits (Design's win).
- **KEEP** all the data/server/mint/passkey work (the hard 90%, all valid).
- **DELIVER the interface Design specced** (this is the actual integration): (1) `window.__album` as a global the adapter owns (not a raw `fetch` in the cabinet — that broke the serverless `?demo=1` walkthrough); (2) `demo-seat.js` (the exact stub in their HANDOFF §"Demo stub") loaded under `?demo=1`; (3) richer mint attributes + `shapeAlbum`: carry `home/away/score/call/result/comp/date/serial` (not just `matchId/side/call`); (4) `profile.sides` as **team tricodes** (`['SUI','ARG']`), not `home/away`.
- Do this on a branch off **current `main`** (which has Design's surfaces + the game fixes), cherry-picking your engine, NOT by merging the stale `your-seat` branch onto it.

**YOUR SEAT go-live items** (also in the memory): add live fixtures to `services/stands/src/sentiment/teams.ts` FIXTURE_INFO (**this is the SAME fix as post-mortem Blocker #2's `18209181` gap** — do it once, both win); a DAS-capable RPC (Helius) for `/seat/album` (public devnet RPC lacks `getAssetsByOwner`); **pin `ROOOT_SCARF_COLLECTION` as a fly env** (the collection address caches to ephemeral FS → a redeploy silently empties every album); Privy fallback (Task 7) needs the owner's Privy appId + `@privy-io/react-auth` (deferred; passkey is primary); real-device Face-ID test (WebAuthn can't run headless — checklist in the worktree's `.superpowers/sdd/task-10-report.md`).

---

## 6 · TONIGHT'S ACTION PLAN (post-mortem blockers, prioritized + lane-split)

**Preserve first (may already be done by Codex — verify):** the capture is committed; `origin/main` reconciled.

**Your backend cluster, ranked to the Release Gate:**
1. **One fixture manifest** (Blocker #2) — a single active-fixture source of truth consumed by every surface + the service; make phase + final score dynamic. Kills the "Colombia in a France match" class. Add the fixture to `sentiment/teams.ts` (also fixes sentiment-skip + YOUR SEAT mint). *Touches surfaces → coordinate with Design on the consumption side; you own the manifest + adapters + service.*
2. **Presence** (Blocker #3) — presence is `Set<anonId>` in `services/stands/src/match-state.ts:116`; closing one ground iframe drops the fan even with another socket open, stopping broadcasts. Ref-count connections, or (better) give the whole ground ONE shared transport (today a ground visit opens 4 WebSockets). In the Release Gate ("switch every lens without losing presence").
3. **Durable persistence** (Blocker #1 second half, #6) — persist predictions/rooted/roar/moments/verdicts so a Fly restart doesn't lose them and verdicts replay after reload. Fly FS is ephemeral (`/tmp` dies on restart) → needs a Fly volume or external store (a volume needs an owner `fly` action — flag it). The sentiment accumulator also skipped the match (the `teams.ts` gap above) → no sentiment crystallized/anchored.
4. **Side-aware three-state verdict** (Blocker #6) — resolution must be side-aware and preserve exact/outcome/wrong (not exact/not-exact), sent to reconnecting clients, replayed after reload.
5. **DEMO↔live behavioral equivalence** (Blocker #5 root cause) — features that only fire under `DEMO` despite both modes exposing `window.__stands` (the architecture promised no surface change to swap sim→real crowd). Pulse is the worst case: the live terrace never subscribes to moments, the picker only sends under `DEMO`, its handler expects an obsolete `verdict` kind (`terrace.html:549`). **Either wire Pulse to the current moment schema or disable it honestly for tonight** — coordinate with Design (their moment-prompt UI).
6. **Two-browser canary** (Blocker #4) — an automated opposite-ends acceptance test (predict, cross-end cheer, lens switch, late join, goal replay, full time). This IS the gate; build it early and run it repeatedly.

**Design owns** (feed them data, don't touch their `.html`): one-tick visible cheer without implying a big crowd; possession labelled numerically vs territory shown spatially (stop one graphic impersonating two — you own the metric semantics: `possessionPct` vs territory); prediction sample-size shown wherever means/% appear (expose `n`); the live moment prompt + split reveal around the server's feeling tokens; a truthful FT verdict UI + honest local-client cabinet.

**Owner / Codex / shared:** the `origin/main` push (Codex's commits); the "LIVE NOW" stale banner; `fly secrets`/a Fly volume for durable storage; the product question the PM raised (allegiance-primed predictions — "choose end then predict" harvests passion but no contrarian belief); Blocker #8 honesty-copy sweep (remove unreachable claims — premium CALL, permanent keepsakes, live Pulse).

**Suggested first strikes (contained, no collision):** `teams.ts` fixture add → the fixture manifest → presence, in `services/stands`; then durable persistence + verdict. Run the backend items with sequenced subagents (they share `server.ts`/`match-state.ts` — don't parallel-edit). Confirm the lane split with the owner before starting so you don't re-run the coordination failure.

---

## 7 · METHOD + GUARDRAILS (how the prior coordinator worked — reuse it)

- **superpowers skills** are available and were used heavily: `brainstorming` (before creative work), `writing-plans`, `subagent-driven-development` (fresh implementer per task → spec+quality review → fixes → whole-branch review; the ledger lives at `.superpowers/sdd/progress.md`), `systematic-debugging`, `verification-before-completion`. For a big push, dispatch subagents with **file handoffs** (task briefs + report files, not pasted context) and pick the cheapest model that fits (haiku for transcription, sonnet for integration, opus for the final whole-branch review). Preserve YOUR context by delegating.
- **Verify before claiming done** — run it, don't assert. The preview MCP (`mcp__Claude_Preview__*`) serves *main* on port 5173 (another chat may hold it); to preview a worktree, serve it on a private port and navigate the preview browser there.
- **Security:** devnet only; `fly secrets set` is owner-only (give the command, never run it); `flyctl deploy --config services/stands/fly.toml` is allowed but **restarts Fly → capture volatile data first**; no secrets in argv/logs/commits.
- **Honesty is a merge gate** — the whole-branch review caught two fabrication leaks the per-task reviews missed (on-chain traits + an un-disclaimered cabinet). Cross-check the *assembled* thing, not just the parts. That is the entire post-mortem lesson.

---

## 8 · IMMEDIATE NEXT STEPS FOR YOU

1. Read the post-mortem + `design/HANDOFF-coordinator-data-wiring.md` + `project_rooot` memory.
2. Verify Codex did the two pre-handoff items: capture committed; `origin/main` == `main` == production.
3. Confirm the lane split with the owner (you = backend cluster §6; Design = surfaces; owner/Codex = deploy/shared) — this is the coordination the PM says was missing.
4. Start the backend cluster: `teams.ts` fixture add → fixture manifest → presence → durable persistence → verdict → the two-browser canary. Sequenced subagents on shared files.
5. Reconcile YOUR SEAT (§5) into the mix — its `teams.ts`/persistence/verdict/cabinet-honesty items overlap the post-mortem blockers, so fold them together rather than as a separate track.
6. Keep the owner steering with frames/verdicts, not walls of text. The bar tonight is the Release Gate.
