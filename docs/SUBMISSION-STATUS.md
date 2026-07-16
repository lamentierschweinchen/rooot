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

### Mint image — the on-chain scarf IS the fan's woven loom (Fly + Playwright)
- The mint captures the fan's **real sealed loom keepsake** headless — chromium on the Fly
  stands (`mint/scarf-capture.ts`) renders the deployed `rooot.club` loom against a
  server-assembled cloth record (belief + events + score + rooted selvage + resolved calls),
  and that PNG is the on-chain image: the pure-odds cloth the fan watched, with their own marks.
- **Ordered fallback** (never the wrong match, never blank): capture → `scarf-svg`
  (server-side reconstruction) → branded gradient. Pure-odds means the cloth has **no goal
  medallions by design** — a plain belief weave is correct, not a gap.
- **Proof:** the capture runs against `rooot.club` → a 788×1868 personal keepsake PNG
  (screenshotted); the server-side record assembler is unit-verified; stands typecheck green;
  chromium ships in the Fly image (deployed). *One thing left:* a live devnet Collect to confirm
  the Fly capture end-to-end (P1 below).

---

## TODOs before submission (prioritized)

### ✅ Done — deployed
1. ~~Deploy `main` to production~~ — **done.** Both deploys shipped: Vercel (`rooot.club` →
   the pure-odds loom + design + P2 + gate/keepsake fixes) and the Fly stands (mint code +
   chromium). Spot-checked live: `/live` weaves, gate 0–0 submits, cabinet reads "you".

### P1 — the one thing left to prove
2. **Devnet mint smoke-test** — the mint captures the loom off `rooot.club` (deploy-first
   ordering is satisfied), but no live Collect has confirmed the **Fly** capture end-to-end.
   It fails *soft* — a browser-launch / URL / timing failure falls back to `scarf-svg` (no
   root, no calls) and logs a warning, so it wouldn't crash but the keepsake would quietly be
   the fallback, not the loom. **Do one Collect on `rooot.club` (ENG-ARG is sealed), then
   check the Fly logs** for `captured the fan's loom keepsake (…b)` vs `falling back to
   scarf-svg`, and eyeball the minted image in a wallet.
3. **Refresh [SUBMISSION-tech-doc.md](SUBMISSION-tech-doc.md)** (Jul 14) — add the woven
   keepsake scarf, the P2 personalization, and the on-chain scarf image. Under-sells what ships.

### P2 — optional
4. **Next live match**, if one falls before Jul 19 — cutover + record it (grows the
   [live-feed corpus](LIVE-FEED-CORPUS.md); every messy feed makes us more robust).

---

## Decisions — resolved (Jul 16)

- **Which scarf is the on-chain keepsake?** → **the loom keepsake.** The mint runs the
  Playwright capture on the Fly stands (chromium added) and mints the fan's woven **pure-odds**
  loom — the belief cloth, rooted selvage, and call knots. `scarf-svg` is the fallback only.
- **The 0–0 gate** → side-picked submits (0–0 included); no forced score tap.
- **The keepsake collect surface** → the loom got a **Collect** button (the scarf is the
  collectible); the terrace card stays as a lighter local memento.
- **Market vs crowd bar** → keep the percentage (already labelled `ODDS` vs `FAN PREDICTIONS`).

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
