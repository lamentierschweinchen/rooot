# ROOOT — Full Project Diagnosis (read-only archaeology, 2026-07-13)

*For the coordinator. Demo tomorrow Jul 14 19:00 UTC (France–Spain, TxLINE 18237038); deadline Jul 19 23:59 UTC. This is a grounded picture of where everything actually is, the vision-vs-built delta, and a vetted archive list. Nothing was edited/moved/deleted. Integrates the four prior maps by reference; the two that never got written (design-state.md, onchain-state.md) are covered here first-hand.*

Working tree is on branch **`mint-claim-ui`** (HEAD `9fccca4`, moved from `33a518b` mid-session — the coordinator is actively committing the Collect UI). `origin/main == main == 47e3bad`.

---

## 0. The honest one-paragraph state

The **live product is real, honest, and deployed**, but it is a *different product* from the one the four orientation docs still describe. The shipped thing ships **entirely from `apps/web/public/*.html` + vanilla-JS adapters** over one Fly service that ingests TxLINE live (or replays real captures through the identical parser), with **three real devnet writes** — CALL memo receipts, a full-time sentiment-record hash-anchor, and Metaplex Core scarf mints. The original **"golden tide on a night pitch / fog-of-war" thesis is retired** (owner-confirmed; the product is now cream-paper + woven-cloth + printed crowd blocks), yet `AGENTS.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, and the `design/REFERENCES*.md` pair — the exact orientation path a new reader/judge is told to follow — still sell the tide and still route writers into the **dead `apps/web/src/{stage,crowd,relics,mint}` tree** (frozen Jul 4–7, `crowd/`+`mint/` literally empty, nothing a user reaches runs it). The drift is real but it is *documentation/vision drift, not build rot*: the build is more coherent than the docs. The single biggest operational risk for tomorrow is that **tomorrow's fixture `18237038` is registered in no repo file** (`fixture.json`/`vercel.json`/`teams.ts`/cutover all still point at the finished ARG-SUI `18222446`), and the two most demo-critical features — the walletless **Collect/mint** and the **anchor-durability** fix — are committed on unpushed, undeployed branches.

---

## 1. State-by-area

| Area | State | Detail (file:line) |
|---|---|---|
| **Data — live ingest** | REAL | TxLINE odds+scores SSE, reconnect/watchdogs, roster+side-truth latches — `services/stands/src/ingest/txline.ts:315-438`; fixture routing `index.ts:52-94`. Live spine. |
| **Data — replay** | REAL (bundles stale) | Same `contracts/normalize.ts` parser as live — `ingest/replay.ts:17-25`; env `REPLAY_FILE/FIXTURE/SPEED` `index.ts:148-164`. Only 4 bundles on disk (Jul 3–4 matches) — `apps/web/public/replay/*.jsonl`. **No France-Spain fallback.** |
| **Data — bake/extract** | REAL, idle | `scripts/extract-fixture.ts` (Jul 4) trims captures → replay bundles; `scripts/bake-demo.ts` (Jul 9) → `public/plate/demo-suicol.js` (SUI-COL scripted `?demo=1` walkthrough). Not on the live path. |
| **Data — fixture manifest** | **STALE** | `apps/web/public/fixture.json:2` = `18222446` (ARG-SUI, Jul 12); `vercel.json:9` `/live → /woven-loom?match=18222446`. `?match=` overrides at runtime, but defaults are wrong. Written only by `scripts/cutover-fixture.mjs:56`. |
| **Data — tomorrow's fixture** | **MISSING** | `18237038` appears only in `scratchpad/starting-xi-diagnosis.md` — absent from `sentiment/teams.ts:8-22`, `cutover-fixture.mjs:26-30` KICKOFFS, `fixture.json`, `vercel.json`, `main.ts`, `woven-loom.html:668-672`. Team names/colors will mis-resolve until added. |
| **Data — crowd-sim** | STUB (quarantined) | `apps/web/public/crowd-sim.js` fabricated sizes, self-labeled "simulated", gated behind `?demo=1`/`?crowdsim=1` only. Never in live path. Worth an honesty-law glance but honestly labeled. |
| **Data — API-Football** | DEAD | No source references it (grep empty). Only `docs/DATA.md:75-78` calls it "parked/NOT NEEDED". Key file present, unread. |
| **On-chain — CALL receipts** | REAL (devnet) | `services/stands/src/relay.ts` — real memo tx, service-fee-paid (walletless), payload=claim+minute+market triple, fan=sha256(anonId). One bounded attempt; failure → `PENDING-RELAYER` (no retry queue, TODO). |
| **On-chain — FT sentiment anchor** | REAL (devnet) | At FULL_TIME `crystallizeSentiment` writes the record to the durable volume + `anchorRecordHash` memo-anchors its sha256 — `server.ts:24,271,530+`; hash `contracts/…builder.ts:159-214`. This is README's "hash-anchored at the final whistle." |
| **On-chain — scarf mint** | REAL (devnet), proven | Metaplex Core via Umi+Irys — `services/stands/src/mint/*` + `seat/mint-scarf.ts`; honesty gate = only mints if match truly hit FULL_TIME. Idempotent per (pubkey,matchId). On-chain image = generic gradient placeholder (`mint/cover.ts`); the beautiful scarf is CSS-woven. (Full flow: `scratchpad/mint-claim-plan.md`.) |
| **On-chain — durability** | STAGED | `anchor-durability` branch (1 commit, unpushed): durable anchor sig + null-`anchorTxSig` backfill (`server.ts`+215, new `dev/anchor-durability-check.ts`). The async anchor fill could be lost on restart/eviction; this fixes it. Not deployed. |
| **Services — Fly** | LIVE | `rooot-stands` iad, `shared-cpu-1x` **512mb + swap 256mb** (post-OOM hardening — `fly.toml:31,66-76`), volume `stands_data`→`/data` persists the restart snapshot (`snapshot.ts:41-58`). Token materialized from Fly secrets in `entrypoint.sh:8-11`. OOM fix (finished-match eviction) landed + deployed this week; `origin/main==main`. |
| **Services — automation** | NONE | No `.github/`, no cron/launchd/Procfile. Canary (`scripts/canary/run.mjs`) and cutover are **hand-run per runbook**. Last canary result Jul 11 22:41. |
| **Frontend — live surfaces** | SHIPPED | `public/*.html`: gate·ground·woven-loom·terrace·cabinet·stadium·showcase — all live & routed (`vercel.json` cleanUrls + rewrites `/live`,`/loom`,`/demo`). Adapters (stands/stats/loom/seat/seat-passkey/match-read) are the real data layer. |
| **Frontend — src/ SPA** | **DEAD** | `apps/web/index.html` no longer imports `main.ts` (grep=0). `src/{stage,app,loom,relics,ledger,data,lib,texture}` frozen Jul 4–7, compiled only into 4 `*-dev.html` harnesses; `src/crowd`+`src/mint` empty. Nothing a user reaches runs `src/`. |
| **Docs — orientation** | **DRIFTED** | The 4 auto-followed docs (AGENTS/PRODUCT/ARCHITECTURE + REFERENCES pair) still present the retired tide + dead src lanes as current. README + SUBMISSION-tech-doc are correct. See §3. |
| **Design — assets** | Bloated w/ stale | Large drawer of dated screenshots (checkins, audit-2026-07-10, loom-object), old experiments/protos, and retired tide-era gens. `design/references/` is canonical (law #6). See §4. |

---

## 2. Vision-vs-built pillars (from docs/PRODUCT.md)

| Pillar (PRODUCT.md) | Verdict | Note |
|---|---|---|
| The stage — fog-of-war night pitch / **golden tide** render | **SHED** | Thesis retired; product is print/cloth. `src/stage` canvas dead. (`design/PAPER-AND-CLOTH.md:70`, `design/COPY-BRIEF.md:29`) |
| Honest **market number** (de-vigged prob) | SHIPPED | Woven into the loom's market thread — not as a tide. Real odds SSE. |
| **Two ends / crowd counts** (real cheer counts) | SHIPPED (as counts) | Real aggregation in stands service; the "bengalo-smoke + phone-light starfield" *visual* is shed. |
| **ROOT** — pick an end (once) | SHIPPED | `gate.html` turnstile: pick end + stamp score call. |
| **CHEER** — decayed taps (constantly) | SHIPPED | `terrace.html` + stands-service decay. |
| **CALL / PREDICT** + on-chain receipt | SHIPPED | "NEXT GOAL?" card + gate score-call; **real devnet memo receipts** (`relay.ts`). The press-and-hold "R-O-O-O-O" O-stretch UI is shed. |
| **Pulse Moments** — 6 ambiguous emojis, split-screen reveal | PARTIAL | React mechanism exists on terrace; the curated 6-emoji *split-screen % reveal* is unverified in the shipped surface. |
| **Stands score** + verdict card ("won the stands") | SHIPPED | FT arithmetic + verdict + hash-anchored sentiment record; season-long stands *table* = backlog. |
| **Rows** — share-link = starting XI, 11 seats, free talk | **SHED** | Top of the pre-agreed fallback ladder; owner shed it. |
| **Relic: woven scarf** (render + mint) | PARTIAL | Renders live (CSS-woven); Metaplex mint proven on devnet; **Collect UI staged-not-deployed** (`mint-claim-ui`); on-chain image is a placeholder gradient. |
| **Relic: rosette/pin** (personal, 70s club rosette) | STUB | Design gens only (`generations/Embroidered award ribbon rosette.png`); not built. |
| **Trophy case / cabinet** | PARTIAL | `cabinet.html` built + reads DAS album; lights up only with real mints + `HELIUS_RPC_URL`; adapters just wired (staged). Falls back to local kept-records. |
| **Attendance Merkle root** ("I'm in the crowd photo") | STUB / aspirational | In ARCHITECTURE on-chain table; no shipped evidence. |
| **Market provenance** (TxLINE Merkle in relic metadata) | PARTIAL | Proof path exercised + specimen captured (`fixtures/provenance/messi-goal-tick-proof.json`, `DATA.md:31-35`); wiring into mint metadata is staged/aspirational. |
| **Replay mode** (first-class, v1) | SHIPPED | Real, same parser, 4 bundles. |

**The delta in one line:** the *systems* (market number, real crowd, receipts, verdict, mint, replay) shipped honestly; the *original aesthetic* (tide/fog/night-pitch) and the *social layer* (rows, pulse split-reveal, rosette, attendance root) were shed or stubbed. The pitch doc oversells the retired aesthetic and the unshipped social layer.

---

## 3. Docs currency (full inventory: subagent A produced 83-file table; the load-bearing findings)

**GROUND-TRUTH / trust today:** `README.md` (Jul 11), `docs/SUBMISSION-tech-doc.md` (Jul 11), `design/PAPER-AND-CLOTH.md` (the Jul 5 ruling that retired the stage — `:70`), `design/COPY-BRIEF.md` (Jul 13, *maps the tide→print drift itself* — `:29`), `docs/DATA.md`, `docs/SENTIMENT.md`, `docs/MECHANISMS.md`, `docs/ENGAGEMENT.md`, `design/STAT-FAMILIES.md`, `design/PLAN-AUDIT-EXECUTION.md`, `design/FRESH-EYES-AUDIT.md`.

**STALE / SUPERSEDED but auto-followed (the drift a new reader hits):**
- `docs/PRODUCT.md:13-15` — titled "Product Ground Truth" (orientation #2); entire "The stage" section is the dead thesis: *"vertical floodlit night pitch"*, *"The market's belief = light vs fog … floodlight bank presses illuminated territory across the grass."* Nothing renders this.
- `AGENTS.md:4` — auto-loaded via CLAUDE.md (#1 doc): *"Live market belief as a golden tide on a night pitch"*; lane map `:36-41` routes writers to `src/stage | tide-on-pitch renderer`, `src/crowd`, `src/mint` — **empty/dead dirs**.
- `docs/ARCHITECTURE.md:17` — (#4 doc): *"stage/ L3 the tide-on-pitch renderer (2D canvas, 60fps phones)"* + the whole dead `src/{stage,crowd,relics,mint}` tree + `:60` "2D canvas stage" stack decision. The correct architecture already exists one file over in SUBMISSION-tech-doc.
- `design/REFERENCES.md:14-16` + `design/REFERENCES-BRIEF.md:11` — *binding under law #6* yet still headline *"atmosphere/ → the stage … floodlight and fog ⭐ THE LIGHTING MODEL"* and *"night-pitch/ … the market's belief is a luminous tide."* A designer curating to these builds the wrong world.
- `COORDINATOR-TODO.md` (Jul 8) — its P0 (XI broadcast, GATE-lock, PRESSING mint) has largely shipped; stale as a backlog.

**Consumed one-shots (ops/handoff docs, safe to archive):** the `docs/PROMPT-*`, `docs/RUNBOOK-*`, `docs/HANDOFF-*`, `docs/NEW-INSTANCE-PROMPT.md`, and ~30 `design/HANDOFF-*/BRIEF-*/PASS*/GEN-PROMPTS-*` process docs (Jul 3–10) — historical record, not current instruction.

**Fastest drift fix:** reconcile the 4 orientation docs to the paper-and-cloth reality they *already* describe elsewhere. Cheapest high-value edit before judges read the repo.

---

## 4. Archive list (vetted — reversible move to `archive/`, NOT delete)

### SAFE-TO-ARCHIVE (evidence/process/superseded; low risk)
| Path | ~Files/size | Reason |
|---|---|---|
| `design/checkins/2026-07-10/` | 147 png (untracked) | Dated one-day check-in screenshots |
| `design/checkins/2026-07-11/` + `2026-07-11-prod/` | ~50 png | Dated feature check-in shots (next-goal, t16, loom) |
| `design/audit-2026-07-10/` | 55 png (untracked) | Superseded design-audit screenshots |
| `design/loom-object/` | 68 files (untracked) | Loom verification-harness evidence; its point served |
| `design/experiments/` | ~61 files (versions/, thesis-jul6, atom/instrument/woven, loom-proto v13–20) | Old direction protos, superseded by shipped `public/` surfaces |
| `design/GPT Experiments/` | 21 imgs + 27MB Brand Book PDF | Earliest Jul-3 exploration; superseded |
| `design/generations/` — **retired-thesis + rejected one-offs only**: `goal no golden ball.png`, `freekick -- too much of a hero.png`, `ChatGPT Image Jul 5 …(1-6).png`, `stadium1/2.png`, `pressure and control.png`, `Minimalist *.png`, `Stadium, full bg.png` | ~20 imgs | Retired tide-era + rejected/dup raw gens (chosen ones already exported to `public/plate/gens`) |
| `docs/PROMPT-*.md`, `docs/RUNBOOK-*.md`, `docs/HANDOFF-*.md`, `docs/NEW-INSTANCE-PROMPT.md` | ~9 md | Consumed one-shot ops/handoff docs |
| `design/HANDOFF-*.md`, `design/BRIEF-*.md`, `design/*PASS*.md`, `design/GEN-PROMPTS-*.md`, `design/NIGHT-SESSION-STANDS.md`, `design/STADIUM-GAPS.md`, `design/QUEUE-jul7.md`, `design/COORD-BRIEF-jul9.md`, `design/GAP-ANALYSIS.md`, `design/STATUS-DESIGN.md` | ~30 md | Consumed design process record (owner may prefer keeping some as history — see note) |
| `COORDINATOR-TODO.md` | 1 | Jul-8 backlog, mostly shipped/superseded |
| `apps/web/public/{loom-proto.html, hello.html, loom-motion.html}` | 3 (loom-proto=2MB) | Unrouted superseded prototypes (loom-proto→woven-loom, hello→index) |
| `apps/web/public/{back,lexicon,lexicon2,pulse,stands}-sheet.html` | 5 | Unrouted design-spec sheets (Nº010-014) |
| `apps/web/public/{brand-lab,type-lab,system}.html` | 3 | Unrouted design/brand labs |

### CONFIRM-WITH-OWNER (code / contracts / source masters / git worktrees — do NOT assert)
| Path | Why ask |
|---|---|
| `apps/web/src/` entire tree + 4 `*-dev.html` + the dev Vite inputs | DEAD as product but it is CODE; dev harnesses still typecheck/build. Archiving trims the build graph. Owner should confirm the src SPA is truly abandoned. |
| `apps/web/src/crowd/`, `apps/web/src/mint/` (empty dirs) | Safe to drop, but they're named in the AGENTS.md lane map — remove only alongside fixing that doc. |
| `contracts/{match.ts, relic.ts, texture.ts, ledger.ts}` | **DO NOT archive without owner.** Frozen coordinator-only seams (law). Some are consumed only by the dead `src/`, but `sentiment.ts`/`crowd.ts`/`normalize.ts`/`stats.ts`/`feed.ts` are LIVE in services/stands. Treat contracts/ as keep-by-default. |
| `design/generations/{balls, flags, trophies, reactions, cloth samples}/`, `GOOOL.png` | Source masters for shipped art in `public/plate/gens` + `public/assets`. Look archivable but they're the editable originals — keep-as-source vs archive is the owner's call. |
| `design/generations/{free kick, glove, sub, stretcher, throw in}.png`, `Embroidered *`, `Heraldic *` | Stat-family/relic source gens — possibly still the master for shipped/print art. Ask. |
| stale git worktrees: `/private/tmp/rooot-deploy` (detached, prunable), `~/Documents/ROOOT-{seat,t16,tonight}` (merged branches), `~/Documents/ROOOT-your-seat` (branch 152 behind, diverged), `.claude/worktrees/intelligent-shamir-1071ab` | Git worktrees, not file moves — use `git worktree prune`/`remove`, not `mv`. Their branches are merged/abandoned. |

### KEEP-CANONICAL (do not touch)
`design/references/` (174 files, law #6 binding corpus) · `design/REFERENCES.md`+`REFERENCES-BRIEF.md` (fix the tide lines in-place, don't archive) · `design/PAPER-AND-CLOTH.md` · `design/COPY-BRIEF.md` · `design/PLAN-AUDIT-EXECUTION.md` · `design/STAT-FAMILIES.md` · `design/BRIEF-loom-moments-2026-07-12.md` · `design/checkins/2026-07-13-mint/` (today's evidence) · everything under `apps/web/public/{assets,plate}` · `apps/web/public/replay/*.jsonl` · `docs/night-reports/`, `docs/POSTMORTEM-*`, `docs/NOTES-*` (evidence the README cites).

### Proposed `archive/` layout
```
archive/
├── design/
│   ├── checkins/            (2026-07-10, 2026-07-11, 2026-07-11-prod)
│   ├── audit-2026-07-10/
│   ├── loom-object/
│   ├── experiments/
│   ├── gpt-experiments/
│   └── generations-retired/ (tide-era + rejected one-off gens only)
├── docs-consumed/           (PROMPT-*/RUNBOOK-*/HANDOFF-*/NEW-INSTANCE-PROMPT)
├── design-docs-consumed/    (HANDOFF-*/BRIEF-*/PASS*/GEN-PROMPTS-*/QUEUE/GAP/STATUS)
├── web-prototypes/          (loom-proto, hello, loom-motion, *-sheet, *-lab, system)
└── src-spa-frozen/          (apps/web/src + *-dev.html)   ← CONFIRM before moving
```
Git-hygiene (separate from file archiving): `git worktree prune` + remove the merged/diverged worktrees.

---

## 5. Top gaps — tomorrow (Jul 14) vs Jul 19

### For a strong demo TOMORROW (in priority order)
1. **Register fixture `18237038` everywhere, then cut over.** Add it to `services/stands/src/sentiment/teams.ts:8-22` (FIXTURE_INFO) + `scripts/cutover-fixture.mjs:26-30` (KICKOFFS), then run `node scripts/cutover-fixture.mjs 18237038` to repoint `fixture.json` + `vercel.json` off the finished ARG-SUI. Without this, `/live` serves the wrong game and team names/colors mis-resolve even with `?match=`.
2. **Bring stands up for live ingest ≥60 min pre-KO and do NOT restart through kickoff.** Deploy with `TXLINE_ENABLE=1 TXLINE_FIXTURES=18237038` + Fly secrets `TXLINE_JWT`/`TXLINE_APITOKEN`. Lineups are a one-shot pre-KO wire event the snapshot seed does not recover (`starting-xi-diagnosis.md`); an OOM/restart in the window empties the TEAM SHEET and nulls scorer/card names. **There is no France-Spain replay fallback** — if live fails, `?demo=1` plays SUI-COL, not France-Spain.
3. **Decide + stage the money-shot (walletless Collect/scarf mint).** It's committed on `mint-claim-ui` (HEAD) **only — unpushed, not on main, not deployed.** To show it: deploy that branch to Vercel + ensure Fly has `HELIUS_RPC_URL` (cabinet album) + `ROOOT_SCARF_COLLECTION` + `MINT_DEVNET_KEYPAIR`, and **rehearse the passkey PRF path on the exact demo device** — it's the only working browser mechanism, no fallback (`mint-claim-plan.md §6`).
4. **Reconcile the 4 orientation docs (or brief judges off README/SUBMISSION).** Anyone who reads AGENTS/PRODUCT/ARCHITECTURE/REFERENCES sees a retired tide product + dead src lanes and concludes the demo is off-thesis. Cheapest credibility fix (§3).
5. **(Optional for on-camera) anchor-durability.** If the demo leans on the FT sentiment anchor / receipts surviving a restart, `anchor-durability` (unpushed, 1 commit) fixes the null `anchorTxSig`. Not needed for the inline mint money-shot.

### By Jul 19 (submission)
- Submission tech doc + demo video (the loop: GATE → MATCH → KEEP → CABINET) — README references `docs/SUBMISSION-tech-doc.md`, in place.
- Free TxLINE tier ends Jul 19 23:59 — relics must carry their own provenance (Merkle refs + captured windows); the proof path is exercised but wiring provenance into mint metadata is still staged.
- The archive pass itself (this doc) + the doc reconciliation, so the repo a judge browses matches the demo.
- Merge/deploy decisions: `mint-claim-ui` + `anchor-durability` are both staged-not-merged and unpushed — neither is on `origin/main`.

---

## Appendix — coverage & caveats
- Integrated by reference (not re-investigated): `scratchpad/mint-claim-plan.md` (walletless Collect flow), `scratchpad/starting-xi-diagnosis.md` (lineups one-shot loss).
- **The other two named maps do not exist** — `scratchpad/design-state.md` and `scratchpad/onchain-state.md` were never written. Frontend/design-surface state (§1 Frontend, §4) and on-chain state (§1 On-chain) are covered first-hand here instead.
- The working tree moved during this investigation (`33a518b`→`9fccca4` on `mint-claim-ui`) — the coordinator is live-editing the Collect UI; treat mint-claim-ui specifics as in-flight.
- Not verifiable read-only from the repo: what image/env is *actually* live on the Fly machine right now (no flyctl/network); whether the pulse 6-emoji split-reveal shipped in `terrace.html` (marked PARTIAL).
