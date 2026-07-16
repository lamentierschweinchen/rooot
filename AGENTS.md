# ROOOT — Agent Operating Rules

You are working on ROOOT: a free, live fan experience for the World Cup — a match
programme that comes alive on your phone, and on-chain forever. Root once, cheer
constantly, call rarely. The market's read prints plainly beside the crowd's roar
— real people, really counted, never faked — in a printed world of paper and cloth.
At the whistle you keep what you lived: a woven scarf, a struck pin, a sealed poster
of the match. The tide-on-a-night-pitch look is retired; the loom stays
(`design/PAPER-AND-CLOTH.md`). Built for the TxODDS hackathon on Solana devnet
(deadline Jul 19, 23:59 UTC). Read `docs/PRODUCT.md` for what we're building,
`docs/DATA.md` for the data truth, `docs/ARCHITECTURE.md` for what runs where.

## The laws (violations don't ship)

1. **Honesty.** Every mark maps to the feed, the taps, or the chain. The market has
   the *number* (a de-vigged probability, shown plainly — a percent or "favoured",
   never the plumbing). The crowd has the *roar* (real counts — NEVER dressed as a
   percentage, never a mean, never blended with market data). Nothing renders that
   didn't happen: no synthetic events, no fabricated counts, no fake aging.
2. **The game is the game.** ROOOT rides alongside the match, never competes for
   attention. Lurking must stay a complete experience.
3. **No token, no wager.** The chain is for provenance, commitment, settlement — the
   fan's record is theirs, forever, worthless to flip on purpose.
4. **No FIFA marks.** Team names + unicode flags fine; "the tournament" otherwise;
   no FIFA wordmarks/logos/trophy imagery anywhere.
5. **Secrets.** Keys/tokens live in `.secrets/` (gitignored) or env. Never in code,
   argv, logs, or commits. Devnet only unless the coordinator says otherwise.
6. **Reference-driven design.** Visual work is judged against `design/references/`
   and the paper-and-cloth site language (`design/PAPER-AND-CLOTH.md`,
   `design/REFERENCES.md`) — never against generic taste. If your render drifts
   toward betting-app/dashboard/AI-gradient looks, it dies in review.
7. **Build-green ≠ done.** Gate at runtime, the way a user does it. Visual work =
   screenshot it yourself (the owner can't see your screen). Console must be clean.
8. **Generated art is the surface.** The owner's generated assets — the plates, the
   prediction card, the scarves, the woven cloth — ARE the design, the finished
   surface, not a mockup to reinterpret. Overlay the live data onto the actual asset
   (`background`, absolutely-positioned fields); never rebuild the frame in code, and
   never substitute a code-drawn approximation for a generated one. If real data
   won't fit the asset, **request a regen** — don't redraw it. (Owner law, hard.)

## The map (lane = directory = one writer)

The shipping product is the static surfaces in `apps/web/public/` plus their vanilla
adapters, served by one stands service. That is what a fan reaches. Everything else
is the seams it rides on.

| Directory | Lane | Who writes |
|---|---|---|
| `apps/web/public/*.html` + `*-adapter.js` | **THE shipping product** — the seven surfaces (gate · ground · woven-loom · terrace · stadium · cabinet · showcase) and the adapters that feed them | frontend/design lane |
| `services/stands/` | L2 · the one server — TxLINE ingest, crowd aggregation, verdicts, durable persistence, devnet relayer + scarf mint | stands lane |
| `contracts/` | the frozen seams (feed · crowd · relic · sentiment · normalize) | **coordinator only** — need a field? ask |
| `scripts/` | ops — TxLINE auth, stream recording, the release canary, night-report, fixture cutover | ops / coordinator |
| `docs/`, `design/` | ground truth + owner-curated references | coordinator + design lane |
| `archive/` | retired material — the tide-era `src/` SPA, old prototypes | **nobody builds here** |

The one fixture manifest (`apps/web/public/fixture.json`) and the deploy/routing
config (`vercel.json`, `services/stands/fly.toml`) are integration seams — the
coordinator repoints them at cutover.

The old `apps/web/src/` SPA (`main.ts` + `stage/`, `crowd/`, `relics/`, `mint/`,
`data/`, `lib/`) is frozen and unused — nothing a fan reaches runs it. It is being
retired to `archive/src-spa-frozen/`; don't build there.

Stay in your lane's directories + your own new files. If two lanes must touch the
same file, stop and tell the coordinator.

## How to work

- **Orient:** `docs/PRODUCT.md` → your lane's section in `docs/ARCHITECTURE.md` →
  the contract you consume in `contracts/`.
- **Data to build against:** recorded matches in `fixtures/*.jsonl` (see
  `docs/DATA.md` for shapes) — build on replay, verify on live.
- **Verify:** `npm run typecheck` at root must pass; run the real thing
  (`npm run dev` in `apps/web`, `npm run dev` in `services/stands`); screenshot
  visual states; paste evidence in your report.
- **Report:** short conclusions, file paths, evidence. Don't dump file contents.
- **Commits:** the coordinator integrates and commits. Leave the tree clean and
  described. Never commit `.secrets/`, `fixtures/*.jsonl`, or `node_modules`.

## Quick commands

```
npm install                 # root (ops scripts)  — also: apps/web, services/stands
npm run typecheck           # whole repo
npm run dev                 # web app (proxies to apps/web)
npm run subscribe           # TxLINE auth walk (fast-path if token exists)
npm run record -- --url <sse> --token-file .secrets/txline-token.json --out fixtures/x.jsonl
```
