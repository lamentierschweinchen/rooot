# Archive manifest — TRACKED files (2026-07-13, `archive-sweep` branch)

Reversible sweep of stale **tracked** files, executed with `git mv` only — nothing
deleted. Source of the vetted list: `scratchpad/project-diagnosis.md` §4 (owner-approved
pruning). This manifest covers tracked files only; there is a separate manifest for
untracked design assets (`archive/ARCHIVED-2026-07-13.md`) in the main tree, not
touched here.

**To restore anything:** `git mv <To> <From>` (reverse the row), then re-add the
matching build-input/tsconfig lines removed in "Config edits" below.

---

## 1. The dead src SPA → `archive/src-spa-frozen/`

The entire `apps/web/src/` tree (59 files: `app/`, `data/`, `ledger/`, `lib/`, `loom/`,
`relics/`, `stage/`, `texture/`, `main.ts`) plus the 4 dev-harness HTML entries that
built it, moved as one unit preserving their original relative paths.

| From | To |
|---|---|
| `apps/web/src/**` (59 files) | `archive/src-spa-frozen/apps/web/src/**` |
| `apps/web/stage-dev.html` | `archive/src-spa-frozen/apps/web/stage-dev.html` |
| `apps/web/loom-dev.html` | `archive/src-spa-frozen/apps/web/loom-dev.html` |
| `apps/web/relic-dev.html` | `archive/src-spa-frozen/apps/web/relic-dev.html` |
| `apps/web/app-dev.html` | `archive/src-spa-frozen/apps/web/app-dev.html` |

**Reason:** dead as product — `apps/web/index.html` no longer imports `main.ts`
(grep=0), `src/crowd/` + `src/mint/` were already empty, and nothing a user reaches
runs `src/`. Verified before moving: no `public/*.html`, no `public/*.js` adapter, and
no `vercel.json` rewrite references `/src/`, `main.ts`, or any of the 4 dev-harness
filenames — all hits were comments/lineage notes or unrelated substring matches
(`hello` matched the WS `{type:'hello'}` handshake message, not `hello.html`).

**Note on `apps/web/src/main.ts`:** CLAUDE.md's law #2 marks this file
coordinator-only. It moved as part of "the ENTIRE apps/web/src/ tree" per this task's
explicit instruction, via `git mv` (content byte-identical, not rewritten). Flagging
this explicitly since it's a judgment call worth a second look.

**Config edits made to keep the build graph honest:**
- `apps/web/vite.config.ts` — `build.rollupOptions.input` trimmed from 5 entries
  (`main`, `stagedev`, `relicdev`, `appdev`, `loomdev`) down to just `main` (index.html).
  No `src/`-pointing alias existed (`@contracts` alias points at root `contracts/`,
  untouched, left in place).
- `apps/web/tsconfig.json` — `include` changed from `["src", "../../contracts"]` to
  `["../../contracts"]`.
- Root `tsconfig.json` and `services/stands/tsconfig.json` needed **no** change —
  neither globs broadly enough to catch `archive/` (both use explicit named-directory
  `include` arrays: `["scripts","contracts"]` and `["src","../../contracts"]`
  respectively), confirmed by a clean `npm run typecheck` after the move.

---

## 2. Consumed one-shot docs → `archive/docs-consumed/`

| From | To |
|---|---|
| `docs/PROMPT-codex-match-captain-2026-07-11.md` | `archive/docs-consumed/docs/PROMPT-codex-match-captain-2026-07-11.md` |
| `docs/PROMPT-design-executor-2026-07-10.md` | `archive/docs-consumed/docs/PROMPT-design-executor-2026-07-10.md` |
| `docs/PROMPT-live-ops-instance-2026-07-10.md` | `archive/docs-consumed/docs/PROMPT-live-ops-instance-2026-07-10.md` |
| `docs/PROMPT-live-ops-instance-2026-07-11.md` | `archive/docs-consumed/docs/PROMPT-live-ops-instance-2026-07-11.md` |
| `docs/RUNBOOK-double-header-2026-07-11.md` | `archive/docs-consumed/docs/RUNBOOK-double-header-2026-07-11.md` |
| `docs/RUNBOOK-esp-bel-live-2026-07-10.md` | `archive/docs-consumed/docs/RUNBOOK-esp-bel-live-2026-07-10.md` |
| `docs/HANDOFF-2026-07-10-coordinator-session.md` | `archive/docs-consumed/docs/HANDOFF-2026-07-10-coordinator-session.md` |
| `docs/NEW-INSTANCE-PROMPT.md` | `archive/docs-consumed/docs/NEW-INSTANCE-PROMPT.md` |
| `COORDINATOR-TODO.md` (repo root) | `archive/docs-consumed/COORDINATOR-TODO.md` |

**Reason:** consumed one-shot ops/handoff/prompt docs — historical record of a
specific past session or runbook, not current instruction. `docs/PRODUCT.md` and
`docs/ARCHITECTURE.md` were left untouched (another lane is rewriting them in place).

---

## 3. Consumed design process docs → `archive/design-docs-consumed/`

| From | To |
|---|---|
| `design/HANDOFF-2026-07-10-fan-serial.md` | `archive/design-docs-consumed/design/HANDOFF-2026-07-10-fan-serial.md` |
| `design/HANDOFF-2026-07-10-tonight-data-shapes.md` | `archive/design-docs-consumed/design/HANDOFF-2026-07-10-tonight-data-shapes.md` |
| `design/HANDOFF-STADIUM.md` | `archive/design-docs-consumed/design/HANDOFF-STADIUM.md` |
| `design/HANDOFF-coordinator-data-wiring.md` | `archive/design-docs-consumed/design/HANDOFF-coordinator-data-wiring.md` |
| `design/HANDOFF-fresh-eyes-design-audit.md` | `archive/design-docs-consumed/design/HANDOFF-fresh-eyes-design-audit.md` |
| `design/HANDOFF-loom-object.md` | `archive/design-docs-consumed/design/HANDOFF-loom-object.md` |
| `design/HANDOFF-loom-to-coordinator.md` | `archive/design-docs-consumed/design/HANDOFF-loom-to-coordinator.md` |
| `design/BRIEF-EXPERIENCE-DIRECTOR.md` | `archive/design-docs-consumed/design/BRIEF-EXPERIENCE-DIRECTOR.md` |
| `design/BRIEF-FANSECTION.md` | `archive/design-docs-consumed/design/BRIEF-FANSECTION.md` |
| `design/BRIEF-PRINT-SOUL.md` | `archive/design-docs-consumed/design/BRIEF-PRINT-SOUL.md` |
| `design/BRIEF-REACT.md` | `archive/design-docs-consumed/design/BRIEF-REACT.md` |
| `design/BRIEF-STANDS.md` | `archive/design-docs-consumed/design/BRIEF-STANDS.md` |
| `design/BRIEF-STATS.md` | `archive/design-docs-consumed/design/BRIEF-STATS.md` |
| `design/BRIEF-WATCHING.md` | `archive/design-docs-consumed/design/BRIEF-WATCHING.md` |
| `design/COLD-EYES-PASS2.md` | `archive/design-docs-consumed/design/COLD-EYES-PASS2.md` |
| `design/COORDINATION-PASS1.md` | `archive/design-docs-consumed/design/COORDINATION-PASS1.md` |
| `design/COPY-MAP-PASS1.md` | `archive/design-docs-consumed/design/COPY-MAP-PASS1.md` |
| `design/GEN-PROMPTS-EMBLEMS.md` | `archive/design-docs-consumed/design/GEN-PROMPTS-EMBLEMS.md` |
| `design/GEN-PROMPTS-FLAGS-TROPHY.md` | `archive/design-docs-consumed/design/GEN-PROMPTS-FLAGS-TROPHY.md` |
| `design/GEN-PROMPTS-NEW-CATEGORIES.md` | `archive/design-docs-consumed/design/GEN-PROMPTS-NEW-CATEGORIES.md` |
| `design/NIGHT-SESSION-STANDS.md` | `archive/design-docs-consumed/design/NIGHT-SESSION-STANDS.md` |
| `design/STADIUM-GAPS.md` | `archive/design-docs-consumed/design/STADIUM-GAPS.md` |
| `design/QUEUE-jul7.md` | `archive/design-docs-consumed/design/QUEUE-jul7.md` |
| `design/COORD-BRIEF-jul9.md` | `archive/design-docs-consumed/design/COORD-BRIEF-jul9.md` |
| `design/GAP-ANALYSIS.md` | `archive/design-docs-consumed/design/GAP-ANALYSIS.md` |
| `design/STATUS-DESIGN.md` | `archive/design-docs-consumed/design/STATUS-DESIGN.md` |
| `design/AUDIT-TRIAGE-2026-07-10.md` | `archive/design-docs-consumed/design/AUDIT-TRIAGE-2026-07-10.md` |
| `design/FEEDBACK-jul7-stadium.md` | `archive/design-docs-consumed/design/FEEDBACK-jul7-stadium.md` |
| `design/LOOM-RUNNING-LIST.md` | `archive/design-docs-consumed/design/LOOM-RUNNING-LIST.md` |

**Reason:** consumed design process record (handoffs, briefs, review passes, gen-prompt
batches, status/gap/queue trackers) — superseded by shipped surfaces or by the
canonical docs kept in place. `design/BRIEF-loom-moments-2026-07-12.md` and
`design/DESIGN-INSTANCE-BRIEF-2026-07-13.md` were kept per explicit instruction (today's
live briefs). `design/references/`, `design/REFERENCES.md`, `design/REFERENCES-BRIEF.md`,
`design/PAPER-AND-CLOTH.md`, `design/COPY-BRIEF.md`, `design/PLAN-AUDIT-EXECUTION.md`,
`design/STAT-FAMILIES.md`, `design/BRAND-NOTES.md`, `design/checkins/2026-07-13-mint/`
were left untouched — all explicit keeps.

**Left in place, flagged for owner:** `design/HANDOFF.md` ("from the retired design
coordinator," Jul 7) reads as the same consumed-handoff category as the 7 files above,
but its filename does not literally match the `design/HANDOFF-*.md` glob (no hyphen +
suffix) and it wasn't separately named, so per the "when unsure, leave it and note it"
rule it was left in place. Also left in place (not in the explicit move list, not
individually named, not in the KEEP list either — same caution): `design/NOTE-LOOM-MOTION.md`,
`design/NOTE-STOPPAGE.md`, `design/POP-LANGUAGE.md`, `design/ROADMAP.md`,
`design/SYSTEM.md`. A skim of each suggests they're live/current design notes
(POP-LANGUAGE calls itself "the visual north star," SYSTEM calls itself "the law"),
not one-shot process docs, so leaving them looks correct — but that's a skim, not a
verdict; flagging for the owner rather than asserting it.

---

## 4. Unrouted public prototypes → `archive/web-prototypes/`

| From | To |
|---|---|
| `apps/web/public/loom-proto.html` | `archive/web-prototypes/apps/web/public/loom-proto.html` |
| `apps/web/public/hello.html` | `archive/web-prototypes/apps/web/public/hello.html` |
| `apps/web/public/loom-motion.html` | `archive/web-prototypes/apps/web/public/loom-motion.html` |
| `apps/web/public/back-sheet.html` | `archive/web-prototypes/apps/web/public/back-sheet.html` |
| `apps/web/public/lexicon-sheet.html` | `archive/web-prototypes/apps/web/public/lexicon-sheet.html` |
| `apps/web/public/lexicon2-sheet.html` | `archive/web-prototypes/apps/web/public/lexicon2-sheet.html` |
| `apps/web/public/pulse-sheet.html` | `archive/web-prototypes/apps/web/public/pulse-sheet.html` |
| `apps/web/public/stands-sheet.html` | `archive/web-prototypes/apps/web/public/stands-sheet.html` |
| `apps/web/public/brand-lab.html` | `archive/web-prototypes/apps/web/public/brand-lab.html` |
| `apps/web/public/type-lab.html` | `archive/web-prototypes/apps/web/public/type-lab.html` |
| `apps/web/public/system.html` | `archive/web-prototypes/apps/web/public/system.html` |

**Reason:** unrouted design-spec sheets, labs, and superseded prototypes
(loom-proto → superseded by woven-loom.html; hello → superseded by index.html).
`lexicon`/`lexicon2` in the task brief resolved to the on-disk `lexicon-sheet.html` /
`lexicon2-sheet.html` (confirmed by `ls`, matches the diagnosis doc's own
`{back,lexicon,lexicon2,pulse,stands}-sheet.html` grouping).

**Verified unreferenced before moving:** grepped `vercel.json` + every remaining
`apps/web/public/*.html` + every `apps/web/public/*.js` adapter + `apps/web/index.html`
for each filename. All 11 came back clean — no `href=`, `src=`, `fetch()`, rewrite, or
route pointed at any of them. The only hits were coincidental substring matches
(`hello` inside the WebSocket `{type:'hello'}` handshake, `system` inside
`-apple-system`/`system-ui` font stacks) or comments describing shared naming
conventions between the prototype and its shipped successor, not functional links.
**None held back** — all 11 confirmed safe, all 11 moved.

Note: `vercel.json` has `cleanUrls: true` with no catch-all SPA rewrite, so these were
already only reachable by typing their exact URL (e.g. `/loom-proto`), never linked
from the product. After this move they 404 in production (confirmed absent from
`apps/web/dist/` post-build). Vite's own dev/preview servers still return 200 for these
paths — that's Vite's default SPA-fallback (`appType: 'spa'`, serves `index.html` for
any unmatched request) doing its own thing in local tooling; verified byte-identical to
the real `index.html` response, unrelated to this move and pre-existing behavior.
