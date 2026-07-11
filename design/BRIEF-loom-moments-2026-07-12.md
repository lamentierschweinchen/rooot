# BRIEF — the loom learns to hold its breath (moments on the cloth) · for the loom instance

*Coordinator, 2026-07-11 evening. Not for tonight — tomorrow's work. Owner routes.*

## The gap, plainly

Two audits and one live night agree: the loom — the flagship, the surface most fans actually watch —
has **no moment UI at all**. When the stands hold a drama window (goal confirmed, VAR, penalty, the
market lurching), the terrace now pops its picker (T6, live since tonight's deploy) — and the loom
says nothing. A fan on `/live` never learns a window opened, never sees the two ends' split. The ops
notes named it: "the loom needs an actual notice mechanism built — this isn't a rendering bug."

## The data (real, live now)

`{type:'moment', momentId, kind, side, minute, opensAtMs, closesAtMs, palette[6 tokens]}` on open;
`{type:'momentResult', kind, minute, home:{top,pct,hist,n}, away:{top,pct,hist,n}}` on close — an end
that stayed silent reveals honestly empty. Kinds: goal · possible · var · red · penalty · near-miss ·
swing (now windowed — it genuinely fires on sustained market drift). Full shapes:
`design/HANDOFF-2026-07-10-tonight-data-shapes.md` §4.

## The plumbing seam (one line from me, on your word)

`woven-loom.html` loads only `loom-adapter.js` — moment messages currently reach `__stands`
subscribers only. Two options; pick and I ship the same day:
1. **`__loom.moment(...)` / `__loom.momentResult(...)`** — I pass moments through the loom adapter
   (additive; your file consumes them like any event).
2. The loom page also loads `stands-adapter.js` — zero adapter work, but a second socket and a
   surface consuming a global it historically hasn't; your call whether that fits the loom's frame.

## The design question (yours entirely)

What does a held breath look like ON CLOTH? The moment is the loom's own vocabulary waiting to
happen — the audit's exceptional-list sketch (§6.6): the weave itself reacting, the two ends' feelings
facing each other when the window closes. Constraints from canon: nothing renders that didn't happen;
an unanswered window expires visibly but quietly; the reveal shows real tokens with real n or honest
silence; no correctness scoring, ever — feeling is expression. The reacting itself can stay the
terrace's job (the loom may only NOTICE and REVEAL) — or you argue otherwise with a sketch.

## Not in scope

Tonight (both matches run with the loom as-is) · the terrace's picker (T6, live) · emblem art (the
owner's gen loop, tokens → glyphs when it lands).
