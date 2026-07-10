# Data wiring — design → coordinator handoff  ·  *RECONCILED with your YOUR SEAT plan*

*From: **design lane** (owns `apps/web/public/*.html` + `design/`) · Updated: 2026-07-09 after reading
`docs/superpowers/plans/2026-07-09-your-seat-identity-retention.md`.*

> **Read this before you touch `cabinet.html`.** Your plan (Task ~8 / line 579) has the coordinator
> editing `cabinet.html` and references its old hardcoded `#who` + `SCARVES` (lines ~157-161). That file
> **moved** — I refactored it (commit `41bd5b2`): it already reads a `window.__seat` / `window.__album`
> interface with a sample fallback, and already has the empty first-run state (NEED pockets, all virtues
> still-to-earn). So **Task ~8 is done on the design side** — please **don't edit `cabinet.html`**; just
> feed it the interface below. This keeps us off the same file (AGENTS.md: two lanes never share one).

## Ownership (so we don't collide)

| Yours (data / chain / adapters) | Mine (surfaces) |
|---|---|
| `window.__seat`, `window.__album`, `/seat/*`, mint attributes, `seat-adapter.js`, `seat-privy.js`, `demo-seat.js` | `cabinet.html` render, `woven-loom.html` PRESSING CTA wiring |

You expose the interface; I wire the pixels. Same split as `__stands`/`__match`/`__loom` today.

---

## P0 — event player-names are `null` in the bake  *(unchanged; quick; unblocks THE BOOK + THE BENCH)*

`__stats.*.cards.list[].player`, `subs.moves[].inName/outName`, and `scorers[]` are all `null` (minute/
type present; the XI kept its names → re-bake regression). THE BOOK renders "– 50′", THE BENCH "– → –".
Re-bake `plate/demo-suicol.js` with event names + confirm the live adapter passes them. **Done when**
`stadium.html?demo=1&match=18202783` shows real names.

---

## P1 — reconciled to your model

### 1 · `window.__seat` — keep your shape, two asks

Your `{ status, pubkey, method, anonId, profile, claim(), on() }` is great and I already read it. Two things:

- **`profile.sides` must be team tricodes**, not `'home'/'away'`. The cabinet crest + "ROOTED FOR"
  render flag stickers (SUI, ARG …); `'home'`/`'away'` can't map to a flag. You have the match teams at
  bind time — resolve the picked side → its tricode before `saveProfile`. (`sides: ['SUI','ARG']`.)
- **`profile.since` is a number (ms)** in your store — fine, I format it to `'26` on my side. No change
  needed from you; just flagging so we agree it stays ms.

### 2 · `window.__album` — expose the album as a global (not a raw `fetch` in the surface)

Your plan has `cabinet.html` `fetch('/seat/album?pubkey=')` directly. Two problems: it **breaks the
serverless `?demo=1` walkthrough** (no server), and it's the one surface that reaches past its adapter.
Please wrap it the way `__stands`/`__match` already work — the `seat-adapter` owns a global the surface reads:

```js
window.__album = {
  scarves: [ /* AlbumScarf, shaped below */ ],
  record: null,        // optional — if null I DERIVE it from scarves (see §4); provide it only if cheap
  next:   null,        // optional — null is fine, I fall back to the "first gate" CTA (no fixtures source yet)
  on(fn)               // re-fire when assets-by-owner refreshes
}
```

- **Live:** `seat-adapter` fetches `/seat/album` on claim + publishes to `__album`, fires `on`.
- **Demo:** `demo-seat.js` (loaded under `?demo=1` beside `demo-feed.js`) sets `__seat` + `__album` from
  the sample at the bottom of this doc. This is what unblocks me building/verifying on the replay.

### 3 · The mint attribute schema — carry the record, so the rack can render it

Your `shapeAlbum` currently reads only `matchId / side / call`, and the mint writes only those three. The
cabinet's scarf-rack shows **teams · score · your call · result · comp · date · Nº** and tapping unrolls the
cloth. The asset is the honest permanent record, so write these attributes at mint (you have them all at
full time). `AlbumScarf` then becomes:

```js
AlbumScarf = {
  asset,                 // on-chain id (you have it)
  home, away,            // tricodes — 'SUI','COL'
  score,                 // final, e.g. '1–1'   (NOT the prediction)
  call,                  // the fan's locked call, e.g. 'SUI 2–1'  (string is fine)
  result,                // 3-STATE (post-mortem): 'exact' (scoreline) | 'outcome' (right winner/draw, wrong score) | 'wrong'
  comp,                  // 'GROUP F'
  date,                  // "04 JUL '26"
  serial,                // edition Nº, '009'
  matchId,               // keep — the tap target unrolls its cloth
  image                  // keep — the woven-cloth relic, for the unrolled keepsake view
}
```

**Team colours stay mine** — I map `home`/`away` tricode → `{hc,ac,hi,ai}` in the cabinet, so you don't
write colours. You only write the factual record fields above. Malformed asset → drop it (never fake), as
you already do.

### 4 · record & next — I derive / de-scope, no endpoint needed

- **record** (MATCHES LIVED · CALLS MADE · NAILED · LOUDEST NIGHT): I derive `lived`/`calls` = scarf count,
  `nailed` = scarves with `result:'exact'`, from `__album.scarves` — honest, straight off the real relics. So
  **no `/seat/me` record fields needed.** `LOUDEST NIGHT` has no on-chain source yet → I show `—` until a
  per-match cheer-peak attribute exists (a nice *later* mint field; not MVP).
- **next**: no fixtures source exists, so `__album.next = null` and I render the generic "TAKE YOUR PLACE ·
  YOUR FIRST GATE" CTA. Wire a real fixture later and I'll light it up.

### 5 · The claim hook

`woven-loom.html`'s full-time PRESSING is mine; when `__seat.claim()` exists I wire "take your seat to keep
it" to it (your Task 7). Just the method — no UI from you.

---

## Demo stub — `demo-seat.js` (copy verbatim; it's what `cabinet.html` currently samples)

```js
window.__seat = { status:'anon', pubkey:null, method:null, anonId:'demo',
  profile:{ displayName:'lukas', sides:['SUI','ARG'], since: 1767225600000 }, claim(){}, on(){} };  // since ms ≈ Jan '26
window.__album = {
  record:{ lived:12, calls:34, nailed:21, loudestNight:'ARG' },   // demo carries a curated fuller record; real fans → record:null and I derive it
  next:{ home:'SPA', away:'BEL', kickoff:"SAT 20:00", side:'SPAIN' },
  scarves:[
    { asset:'d1', home:'ARG', away:'CPV', score:'3–2', call:'ARG 3–2', result:'exact',   comp:'WORLD CUP', date:"08 JUL '26", serial:'014', matchId:'x', image:null },
    { asset:'d2', home:'SUI', away:'COL', score:'1–1', call:'SUI 2–1', result:'wrong',   comp:'GROUP F',   date:"04 JUL '26", serial:'009', matchId:'x', image:null },
    { asset:'d3', home:'BRA', away:'NOR', score:'0–1', call:'the upset', result:'outcome', comp:'GROUP C',  date:"01 JUL '26", serial:'003', matchId:'x', image:null }
  ], on(){} };
```

**Done when:** `cabinet.html?demo=1` renders from `__album`/`__seat` (I'll re-map my resolver to the fields
above), and a genuinely empty `__album` shows my first-run state. I verify at runtime + screenshot the
same day the stub lands.

## Post-mortem (9 Jul) — data shapes the OTHER design blockers need

The design blockers are mine to render, but three need data from you — flagging while you ingest so we
build to one shape. Propose your real shapes back; these are just what the surfaces consume:

1. **Sample size (n).** Every crowd mean/% must show its n (post-mortem: five predictions must read
   `n=5`, not an authoritative %). Expose the prediction count with the means, e.g.
   `__stands.calls = { home:{n,mean}, away:{n,mean}, all:{n,mean} }` — the STANDS crowd-call panel will label it.
2. **Feeling-token moments (Pulse).** The terrace picker still expects the obsolete `verdict` kind and
   only fires under `DEMO`. Give me the **current moment schema** the server emits so I can build the honest
   live moment prompt + split reveal around it: `__loom.moment = { id, at, tokens:[{key,label}] }` + `react(id,key)`,
   or tell me the real shape. (Wire it for live, not just `DEMO`.)
3. **One-cheer-visible roar.** A single remote cheer must pop within one tick without implying a crowd —
   I need a **discrete** signal, not just a smoothed rate: `__stands.onCheer(fn)` per received cheer (or a
   `roar.delta`). The terrace scaled low volumes into invisible changes; a per-cheer event fixes that on my side.

And a heads-up, not an ask: the **cabinet is now honest on live** — the lukas sample renders ONLY under
`?demo=1`; a live seat with no `__seat`/`__album` shows the empty state, never fake data (`a327b40`). So the
cabinet won't mis-render during a live match regardless of when your interface lands.

## Not blocking
- Seven virtue pins → real counters: post-MVP in your spec §9. Pins stay sample; empty seat shows all locked.
- Flags done; SPA carries the modern constitutional arms (owner confirmed keep).
