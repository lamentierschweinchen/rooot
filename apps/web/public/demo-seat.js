/**
 * ROOOT — DEMO SEAT (coordinator lane: the ?demo=1 walkthrough's __seat/__album).
 * Verbatim the stub specced in design/HANDOFF-coordinator-data-wiring.md §"Demo stub":
 * a curated sample seat so the serverless walkthrough can render the cabinet without
 * a live seat. Loaded ONLY under ?demo=1 (design wires the tag beside demo-feed.js).
 * Honesty: this never loads on live — a real fan with no seat sees the empty state.
 */
window.__seat = { status:'anon', pubkey:null, method:null, anonId:'demo',
  profile:{ displayName:'lukas', sides:['SUI','ARG'], since: 1767225600000 }, claim(){}, on(){} };  // since ms ≈ Jan '26
window.__album = {
  record:{ lived:12, calls:34, nailed:21, loudestNight:'ARG' },   // demo carries a curated fuller record; real fans → record:null and design derives it
  next:{ home:'SPA', away:'BEL', kickoff:"SAT 20:00", side:'SPAIN' },
  scarves:[
    { asset:'d1', home:'ARG', away:'CPV', score:'3–2', call:'ARG 3–2', result:'exact',   comp:'WORLD CUP', date:"08 JUL '26", serial:'014', matchId:'x', image:null },
    { asset:'d2', home:'SUI', away:'COL', score:'1–1', call:'SUI 2–1', result:'wrong',   comp:'GROUP F',   date:"04 JUL '26", serial:'009', matchId:'x', image:null },
    { asset:'d3', home:'BRA', away:'NOR', score:'0–1', call:'the upset', result:'outcome', comp:'GROUP C',  date:"01 JUL '26", serial:'003', matchId:'x', image:null }
  ], on(){} };
