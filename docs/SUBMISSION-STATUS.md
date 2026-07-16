# ROOOT — Submission Status & TODOs

*Coordinator synthesis · as of **2026-07-16** · deadline **Jul 19, 23:59 UTC** (~3 days out)*

Companion to [PRODUCT.md](PRODUCT.md) (what we're building) and
[SUBMISSION-tech-doc.md](SUBMISSION-tech-doc.md) (the pitch + architecture). This
doc is the **where-are-we / what's-left** picture. Short conclusions, honest states.

---

## TL;DR

The product is **built and on `main`**. Tonight closed the last of the design
integration: the design pass is merged, the keepsake scarf now carries the fan's
own record (their side + their resolved calls), and the on-chain mint image is a
real woven scarf instead of a placeholder gradient. Everything is verified locally.

**The one thing standing between us and a live submission is a production deploy** —
`main` is ahead of what `rooot.club` currently serves, and prod deploys are a manual
`vercel --prod` (no git auto-deploy). That is an **owner action** (the deploy
classifier blocks it from an agent session). Run it and the whole night's work goes
live in one shot.

---

## Status at a glance

| Area | State | Note |
|---|---|---|
| The 7 surfaces (gate·ground·loom·terrace·stadium·cabinet·showcase) | ✅ built + verified | design pass merged; all render clean, console clean (local) |
| Honesty engine (market number · crowd roar, never blended) | ✅ shipped | laws 1–8 in [AGENTS.md](../AGENTS.md) |
| Live-feed correctness (confirm/retract, VAR, offside) | ✅ hardened | FRA-ESP post-mortem → regression checks; ENG-ARG live-proven |
| **P2 — fan's root + calls woven into the scarf** | ✅ **done + verified** | tonight; end-to-end runtime proof (see below) |
| **On-chain mint image = the real scarf** | ✅ **wired + verified** | tonight; image/typecheck/storage-mime proven — **devnet smoke-test pending** |
| Keepsake capture pipeline (loom → PNG) | ✅ proven | headless Playwright re-render, console clean |
| On-chain mint (devnet, Metaplex Core, fan-owned) | ✅ works | anchors + mints land; honesty-gated (post-FT only) |
| **Production deploy of the above** | ⛔ **pending — owner action** | `main` (7118bcd) is ahead of prod; one `vercel --prod` |
| Submission tech doc | 🟡 refresh needed | [SUBMISSION-tech-doc.md](SUBMISSION-tech-doc.md) is Jul 14 — predates tonight |

---

## What shipped tonight (on `main`, pushed, not yet on prod)

| Commit | What |
|---|---|
| `bf958a1` | **Design pass merged** — 52 commits: restyled surfaces, the terrace prediction-card on generated art, the stadium PROGRAM strip, the woven-cloth cabinet, the sealed keepsake loom |
| `9b24e3e` | **P2** — the fan's rooted side + resolved calls now weave into the scarf keepsake |
| `a455248` | **Law 8** — "generated art is the surface" (owner, hard) added to AGENTS.md |
| `7118bcd` | **Mint image** — the on-chain cover IS the scarf (scarf-svg), replacing the gradient placeholder |

### P2 — the keepsake is now personal (verified end-to-end)
The loom was 90% built for this; the gap was a producer and persistence.
- **terrace** stamps each *resolved* call (demo quiz + live NEXT GOAL) to
  `rooot.calls.<matchId>` — real marks only, `hit` null until the feed answers (an
  honest void, never a miss).
- **loom** pulls the gate pick (`rooot.pass.side` → the rooted-team **selvage**) and
  those calls (match-id guarded, idempotent) at boot / on storage / at seal;
  `writeCloth` persists `root`+`calls` into the sealed record; `loadRecord` re-weaves them.
- **Proof:** a driven ENG-ARG seal wrote `root:"away"` + 5 correctly-resolved calls;
  the keepsake re-renders the **ARG-blue selvage** + the **call knots** (filled = hit,
  open = miss, void = null). Screenshotted, console clean.
- *Caveat:* the terrace *producer* is code-verified + interop-proven (the loom consumes
  the exact key/shape at runtime), but a clean runtime catch of the demo quiz writing was
  blocked by a harness artifact (the demo's rAF clock jumps when the tab backgrounds). The
  live NEXT GOAL path and the whole loom side are runtime-proven.

### Mint image — the on-chain scarf (verified to image + typecheck + storage)
- Vendored the design lane's `scarf-svg` into the stands mint lane
  (`services/stands/src/mint/scarf-svg.ts` + `scarf-fonts.ts`) — the Docker image copies
  `services/stands` only, so it must ship in-lane.
- `mint-scarf.ts` renders it as the claim-mint cover: team fields, real final score, the
  fan's serial + date, goals as medallions (empty goals → plain cloth, honest). Uploaded
  as `image/svg+xml`; the branded gradient stays as the recipe's ordered fallback.
- **Proof:** stands typecheck green; `storage.ts` propagates the svg mime (Irys
  Content-Type tag + metadata `files[].type`); the vendored `.ts` renders the ENG-ARG claim
  scarf via `tsx` (the stands' own runtime), screenshotted.

---

## TODOs before submission (prioritized)

### P0 — blocks a live submission
1. **Deploy `main` to production** — `vercel --prod` from the repo root (owner action;
   the agent deploy-classifier blocks it). This aliases **rooot.club** to the new build →
   design + P2 + mint-image all go live at once. *Everything below assumes this is done.*
2. **Verify prod after deploy** — the 7 surfaces on `rooot.club` (not the `*.vercel.app`
   URLs, which are SSO-walled). Spot-check `/live`, `/demo`, `/terrace`, the gate.

### P1 — submission quality
3. **Devnet mint smoke-test** — claim a scarf on a post-FT match, confirm the new
   `image/svg+xml` cover mints and renders in a Solana explorer / wallet. The mint/upload
   logic is unchanged (only the cover bytes + mime differ), so risk is low — but it's the
   one unverified link in the mint-image chain.
4. **Refresh [SUBMISSION-tech-doc.md](SUBMISSION-tech-doc.md)** (Jul 14) — add the woven
   keepsake scarf, the P2 personalization, and the on-chain scarf image. It currently
   under-sells what now ships.

### P2 — enhancements (optional, only if time)
5. **Decision — which scarf is THE minted image?** (owner values call — see below).
6. **Weave goals into the minted scarf** — the claim relic has `goals: []`, so the on-chain
   scarf is currently plain cloth (real score, no goal medallions). Feeding the goal
   timeline (from the sentiment record / match state) would light up the medallions.
7. **Next live match**, if one falls before Jul 19 — cutover + record it (grows the
   [live-feed corpus](LIVE-FEED-CORPUS.md); every messy feed makes us more robust).

---

## Decisions for the owner

- **Which scarf design is the on-chain keepsake?** There are two honest renders:
  - **The loom keepsake** (vertical, the belief woven as colour bands, the rooted-team
    selvage, the call knots) — rich and *personal* (carries P2). It's the scarf the fan
    watches weave. Rendering it to an image needs a headless browser (proven:
    `loom-keepsake-capture.mjs`), which the Fly server doesn't have.
  - **scarf-svg** (horizontal, team fields + score cartouche + goal medallions) —
    server-renderable, zero-dep, now wired as the mint cover.
  - Right now the mint ships **scarf-svg** (the server-side path). If we want the on-chain
    image to *be the loom the fan watched* (with their marks), we'd run the Playwright
    capture in a mint pipeline that has a browser. **Ship scarf-svg as-is, or invest in the
    loom-capture path?**

---

## How to demo (once deployed)

- **`rooot.club/demo`** — the guided walkthrough (showcase).
- **`rooot.club/live`** — the hero: the loom weaving a match (currently ENG-ARG, sealed).
- **`rooot.club/gate` → pick a side + a scoreline → the surfaces** — the real flow; the door
  is opinionated (predictions are the data, no watch-only entrance).
- **On-chain proof** — the ENG-ARG night report + sealed sentiment record + devnet anchor:
  [docs/night-reports/18241006.md](night-reports/18241006.md).

---

## Where the truth lives
- **What we're building:** [PRODUCT.md](PRODUCT.md)
- **The pitch + architecture:** [SUBMISSION-tech-doc.md](SUBMISSION-tech-doc.md)
- **The rules:** [AGENTS.md](../AGENTS.md) (laws 1–8, the lane map)
- **Data truth:** [DATA.md](DATA.md) · **Live-feed discipline:** [LIVE-FEED-CORPUS.md](LIVE-FEED-CORPUS.md)
- **Deferred ideas (not shipped, don't claim):** [BACKLOG-full-version-and-deferred-ideas.md](BACKLOG-full-version-and-deferred-ideas.md)
