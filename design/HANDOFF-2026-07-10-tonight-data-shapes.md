# Data shapes for tonight — coordinator → design (2026-07-10)

*Answering your `HANDOFF-coordinator-data-wiring.md` §post-mortem asks, plus tonight's fixture cutover.
Everything here is either already true on the wire (marked LIVE NOW) or landing today in the order
listed (marked TONIGHT, with rough order). All shapes below are verbatim from `contracts/crowd.ts` —
that file is the truth if we ever disagree.*

**Tonight's match: Spain v Belgium · fixture `18218149` · kickoff 21:00 CEST (19:00 UTC).**
ESP `#AA151B/#F1BF00` · BEL `#000000/#FDDA24`. The landing's "LIVE NOW · FRA v MAR" is now stale —
yours to reframe for tonight.

---

## 1 · The fixture manifest — kills your six hardcodes (TONIGHT, first thing)

New static file `apps/web/public/fixture.json` + tiny `fixture-adapter.js`. Surface-facing global:

```js
window.__fixture = {
  current: null | {
    matchId: '18218149',
    home: { code:'ESP', name:'Spain',   colors:['#AA151B','#F1BF00'] },
    away: { code:'BEL', name:'Belgium', colors:['#000000','#FDDA24'] },
    kickoffUtc: '2026-07-10T19:00:00Z',
    competition: 'World Cup',
    dateISO: '2026-07-10'
  },
  on(fn)   // fires with the manifest once loaded (immediately if already loaded)
}
```

Fetch failure → `current` stays `null` and `on` never fires: fall back to whatever you do today,
never invent a fixture. Script-order-independent: if you need the raw promise, `window.__fixtureReady`
resolves to the manifest (or null) and is safe to await anywhere.

**CORRECTION (15:45) — your six files are LIVE-TONIGHT, not at-your-pace. I had this wrong.** Your
surfaces compute `MATCH_ID = ?match || (LIVE ? '18209181' : demo)` and pass it into the adapters/hello —
so tonight's real fans would enter the **FRA–MAR room (dead feed, no market)** no matter what my
adapters default to. The `/live` rewrite only carries the bare loom. Recommendation (owner-aligned,
post-mortem-aligned): tonight do the **mechanical literal bump** below (~15 min, zero async risk);
migrate to `__fixture` properly tomorrow. Per file:

- `gate.html`: add to FIXTURES `'18218149':{home:{tri:'ESP',name:'SPAIN',color:'#AA151B',flag:'ESP'},away:{tri:'BEL',name:'BELGIUM',color:'#1A1A18',flag:'BEL'},kick:'TONIGHT 21:00'}`; line 177 LIVE default `'18209181'`→`'18218149'`; line 187 fallback likewise.
- `ground.html`: add `'18218149':{home:{tri:'ESP',name:'ESP',color:'#AA151B'},away:{tri:'BEL',name:'BEL',color:'#1A1A18'}}`; lines 117 + 122 likewise.
- `terrace.html`: add `'18218149':{home:{tri:'ESP',name:'SPAIN',color:'#AA151B'},away:{tri:'BEL',name:'BELGIUM',color:'#1A1A18'}}`; lines 301 + 306 likewise.
- `stadium.html`: add `'18218149':['ESP','SPAIN','#AA151B','BEL','BELGIUM','#1A1A18']`; line 329 both LIVE literals.
- `woven-loom.html`: add `'18218149':['ESP','SPAIN','#AA151B','BEL','BELGIUM','#1A1A18']` to FX; line 343 `/live` default → `'18218149'`.
- `apps/web/index.html`: line 84 CTA `match=18209181` → `match=18218149` (+ the LIVE NOW reframe you already have queued).

Colors are suggestions from the manifest (BEL flat black lightened a step for ink) — the pixel call is
yours; note the audit's contrast law if you reach for Belgian yellow as type. When you migrate to
`__fixture` tomorrow, all of these literals die and the next game needs zero surface edits.

## 2 · Sample size `n` — LIVE NOW, nothing to wait for

The consensus already carries n everywhere. `__stands.onConsensus(fn)` fires with (real premiere data
as the sample — this is the actual final consensus from FRA–MAR):

```js
{ type:'consensus', matchId:'18209181', ts:…, locked:true,
  all:    { n:5, mean:{home:1.4,away:1.8}, outcome:{homeWin:0.4,draw:0,awayWin:0.6}, modal:{home:2,away:1,pct:0.4} },
  byRoot: {
    home:    { n:2, mean:{home:2,away:1},  outcome:{homeWin:1,draw:0,awayWin:0},   modal:{home:2,away:1,pct:1} },
    away:    { n:3, mean:{home:1,away:2.33}, outcome:{homeWin:0,draw:0,awayWin:1}, modal:{home:1,away:2,pct:0.667} },
    neutral: { n:0, … }
  } }
```

Label every mean/% with its cohort's `n` (`n=5`, not an authoritative percentage — the post-mortem
blocker). The doubters you asked about once: `byRoot.home.outcome.draw + byRoot.home.outcome.awayWin`
= the share of home-rooted fans predicting their own side won't win. `n:0` cohorts are honestly empty —
render silence, not zeros-as-data.

## 3 · One-cheer-visible — TONIGHT (second thing): `__stands.onCheer(fn)`

New discrete server message, 1:1 with accepted cheers (capped at 15/s per match; the smoothed
`roar` rate stays the volume signal — the echo is the "someone, right now" signal):

```js
__stands.onCheer(function (e) { /* e = { side:'home'|'away', atMs } */ })
```

One echo = one real accepted cheer. It carries no count, so a single fan pops visibly without
implying a crowd. Beyond the cap, echoes drop silently (roar carries the rest) — so never derive
volume from echo frequency; that's what `roar` is for.

## 4 · Pulse / moments — the CURRENT schema (LIVE NOW server-side; your terrace is on an old one)

What the server actually emits (your terrace's `verdict` kind is obsolete — that word now belongs to
predictions, §5):

```js
// window opens (drama moment): __stands callback bucket 'moment'
{ type:'moment', matchId, momentId, kind, side, minute, opensAtMs, closesAtMs, palette }
// kind: 'goal'|'possible'|'var'|'red'|'penalty'|'near-miss'|'swing'|'full-time'
// side: the end the moment favours, or null (red/VAR/full-time)
// palette: the six feeling TOKENS for this kind, e.g. goal →
//   ['euphoria','relief','disbelief','anguish','tension','pride']  (you map token → glyph)

// a fan reacts (send this; one per fan per moment, last-write-wins until close):
{ type:'momentReact', matchId, momentId, anonId, side, token, atMs }

// window closes → the split reveal ("their dread vs your hope"):
{ type:'momentResult', matchId, momentId, kind, minute,
  home:{ top, pct, hist, n }, away:{ top, pct, hist, n } }   // an end that was silent: ''/0/{}/0 — honestly empty
```

Your fixes on the terrace side, from the post-mortem: subscribe to `moment`/`momentResult` on LIVE
(today it never subscribes outside DEMO), send `momentReact` always (today the picker only sends under
DEMO), drop the obsolete kind. Feelings are never scored for correctness — expression, not a guess.
Six real windows opened during the premiere with zero reactions; the server side works.

## 5 · Full-time prediction verdict — 3-state, per fan (LIVE at FT; replay-on-reload lands TONIGHT)

```js
{ type:'predictVerdict', matchId, anonId,
  predicted:{home,away}, final:{home,away},
  verdict: 'exact' | 'outcome' | 'wrong' }   // exact scoreline · right result wrong score · wrong
```

Already computed side-aware at full time. What lands tonight: it replays to a fan who reloads or
joins after FT (and survives a service restart), so your full-time surfaces can rely on it arriving.
Your cabinet is already 3-state (`a327b40`).

## 6 · `demo-seat.js` — SHIPPED, verbatim your spec

`apps/web/public/demo-seat.js` now exists, exactly the stub from your handoff §"Demo stub"
(`__seat` + `__album` with the 3-scarf sample, record, next). You wire the `<script>` tag beside
`demo-feed.js` under `?demo=1`. The live `__album`/`seat-adapter` comes with the YOUR SEAT
reconciliation — after tonight's gate, per the owner's call.

## What I'd take from you tonight (no blockers on my side)

1. Landing reframe: stale "LIVE NOW · FRA v MAR" → tonight ESP–BEL (manifest or hardcode, your call).
2. Terrace: the three Pulse fixes in §4, or hide the picker honestly — never demo-only.
3. A visible one-tick cheer treatment on `onCheer` (§3).
4. `n` labels wherever means/% render (§2).
5. Your six fixture hardcodes → `__fixture` when convenient (§1).

Order of my drops today: manifest (§1) → cheer echo (§3) → verdict replay (§5). I'll update this file
if any shape shifts; anything unclear, leave me a note in this file's margin or flag the owner.
