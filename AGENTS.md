# ROOOT — Agent Operating Rules

You are working on ROOOT: the world's most beautiful and fun fan experience for the
World Cup — on your phone, and on-chain forever. Live market belief as a golden tide
on a night pitch; root once, cheer constantly, call rarely; keep what you lived
(scarf, pin, trophy case). Built for the TxODDS hackathon on Solana (deadline
Jul 19, 23:59 UTC). Read `docs/PRODUCT.md` for what we're building, `docs/DATA.md`
for the data truth, `docs/ARCHITECTURE.md` for what runs where.

## The laws (violations don't ship)

1. **Honesty.** Every pixel/sound maps to the feed, the taps, or the chain. The market
   has the *number* (gold tide, de-vigged probability). The crowd has the *roar*
   (real counts — NEVER dressed as a percentage, never blended with market data).
   No fake players, no fake ball, no synthetic events in honest layers.
2. **The game is the game.** ROOOT rides alongside the match, never competes for
   attention. Lurking must stay a complete experience.
3. **No token, no wager.** The chain is for provenance, commitment, settlement — the
   fan's record is theirs, forever, worthless to flip on purpose.
4. **No FIFA marks.** Team names + unicode flags fine; "the tournament" otherwise;
   no FIFA wordmarks/logos/trophy imagery anywhere.
5. **Secrets.** Keys/tokens live in `.secrets/` (gitignored) or env. Never in code,
   argv, logs, or commits. Devnet only unless the coordinator says otherwise.
6. **Reference-driven design.** Visual work is judged against `design/references/`
   (+ `design/REFERENCES.md` once distilled) — never against generic taste. If your
   render drifts toward betting-app/dashboard/AI-gradient looks, it dies in review.
7. **Build-green ≠ done.** Gate at runtime, the way a user does it. Visual work =
   screenshot it yourself (the owner can't see your screen). Console must be clean.

## The map (lane = directory = one writer)

| Directory | Lane | Who writes |
|---|---|---|
| `contracts/` | the frozen seams (match, crowd, relic) | **coordinator only** — need a field? ask |
| `apps/web/src/main.ts` | composition root | **coordinator only** (integration) |
| `apps/web/src/stage/` | L3 · tide-on-pitch renderer | stage lane |
| `apps/web/src/crowd/` | L5 · ends, cheer, pulse, rows UI | crowd lane |
| `apps/web/src/relics/` | L4 · scarf, pin, trophy case | relic lane |
| `apps/web/src/mint/` | L4b · Metaplex Core mint (port of STRATA's) | mint lane |
| `apps/web/src/data/` | L1 · TxLineDataSource, ReplaySource, MockSource | data lane |
| `apps/web/src/lib/` | shared utils + theme tokens | additive only; don't edit others' exports |
| `services/stands/` | L2 · aggregation, fanout, relayer | stands lane |
| `scripts/` | ops (auth, record, inspect) | data lane / coordinator |
| `docs/`, `design/` | ground truth | coordinator + design lane |

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
