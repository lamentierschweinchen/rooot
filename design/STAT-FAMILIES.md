# ROOOT — the stat families

The organising concept for every stat plate and every place in the stadium.
Owner-agreed 2026-07-07.

## The principle
**Families, not one-card-per-stat.** One beautiful graphic per family; the
sub-stats are *positions / marks on it*, never separate cards. (The breakthrough:
all shot outcomes live in ONE goal-mouth, distinguished by where they land and
which mark — goal/save/block/miss/woodwork — not eight little charts.)

Corollary: **the families ARE the stadium's places.** The taxonomy and the
stat-center are the same map. Tap a place → open its family.

## The families

| Family | Stadium place · symbol | The one graphic | Holds (counts) | Reads as % |
|---|---|---|---|---|
| **THE RESULT** | scoreboard | the ticket front | score · scorers (name·min·boot/head/OG) | — |
| **SHOOTING** | the two goals · ball | the goal-mouth | goal·saved·off·blocked·woodwork | accuracy · conversion · save% |
| **THE DEAD BALL** *(set pieces)* | corner arcs + FK spots · flag | the restart spots | corners·free-kicks·throw-ins | set-piece share |
| **CONTROL** | the pitch body · (heat) | territory heat | possession·territory·danger·attacks | possession% · danger% |
| **THE BOOK** *(referee decisions)* | centre circle · **whistle** | the ref's ledger | yellow·red·**offsides**·fouls·VAR(+outcome)·pens-awarded | cards/foul |
| **THE BENCH** | dugouts / touchline · arrows | the bench | subs·injuries·warming-up | — |
| **PENALTIES** *(if it goes there)* | the spot · dot | the shootout grid | scored·missed·stands | conversion |
| **THE STUB** | the ticket stub | provenance | fixture·venue·weather·kickoff·edition·on-chain | — |

Eight families ≈ eight generations. Offsides lives in THE BOOK (a referee call),
not with the dead ball.

## The data surface (what we can compute)
Everything below is on the TxLINE wire per `docs/DATA.md`. Only **passes /
pass-accuracy** is unavailable.

- **Live now** (`window.__stats`): shots by outcome, goals, corners, free-kicks,
  cards, VAR count, possession%, territory/danger, offsides.
- **On the wire, needs aggregating**: subs, injuries, warming-up, VAR *outcomes*,
  penalty outcomes, scorer name+type.
- **One email to decode** (opaque `Stats` block): fouls, offsides confirm.
- **Derived free from counts**: accuracy, conversion, save%, possession%,
  danger-share%, set-piece share.

**CONFIRMED (coordinator, Jul 7)** — `archive/design-docs-consumed/design/BRIEF-STATS.md` is the canonical
`window.__stats` contract; ALL families now computable & wired (subs w/ in-out names,
injuries w/ name+outcome, penalties, scorer+type, MATCH-LEVEL `var` block). Names via
the wire roster. Possession % gated → territory fallback. VAR/warming-up not per-side.

## The mark rule (print AND woven)
Every event = **one stark mark that reads instantly at a glance AND survives
~13 stitches on the loom.** Detail dies woven; boldness carries. A goal is not a
detailed ball — it's an unmistakable GOAL stamp. See `design/experiments/loom-strip.html`
for the stark set woven at true size. Same alphabet, two materials — see
[[project_stat_graphics_direction]].
