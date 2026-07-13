# ROOOT

All operating rules live in **AGENTS.md** — read it before any work, then
`docs/PRODUCT.md` (what we're building), `docs/DATA.md` (data truth),
`docs/ARCHITECTURE.md` (what runs where).

@AGENTS.md

Three rules that override everything: (1) `.secrets/` never enters git, logs, or
argv; (2) `contracts/` and the fixture-manifest cutover (`apps/web/public/fixture.json`
via `scripts/cutover-fixture.mjs`) are coordinator-only; (3) verify at runtime with
the real thing — build-green is not done.
