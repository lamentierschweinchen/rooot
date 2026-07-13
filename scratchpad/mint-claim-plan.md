# ROOOT — Claim-the-scarf: end-to-end map + build plan (READ-ONLY investigation)

Money-shot: fan presses "keep it forever" at full time → REAL owned-by-fan Metaplex Core
scarf on devnet → show scarf + devnet explorer link. Server does the hard part already.
**Frontend is wired to none of it. Fix is script tags + one button handler.**

---

## 1. The working claim sequence (from the proof + the live routes)

Proof: `services/stands/src/dev/prove-claim-mint.ts` (drives the REAL routes, real devnet mint).
Server routes: `services/stands/src/server.ts`. Client already implements this: `apps/web/public/seat-adapter.js`.

Exact sequence (what the browser does — `seat-adapter.js:176-205` `claim()`):
1. **Get a pubkey (walletless — see §2).** `resolveMechanism(window.seatPasskey, …)` → `{pubkey, method}`.
   Face-ID/Touch-ID passkey PRF derives an ed25519 keypair in-browser (`seat-passkey.js:152-167`).
2. **Request a session-bound claim token over a WebSocket** (`seat-adapter.js:139-167`):
   open `wss://rooot-stands.fly.dev/`, send `{type:'hello',matchId,anonId}` then
   `{type:'seatToken',matchId,anonId}`; server replies `{type:'seatTokenGrant',token,…}`
   ONLY to that socket (`server.ts:1520-1533` handleSeatToken). Token single-use, ~2min TTL.
   Why WS: the server derives the fan's identity (side/call/serial) from the token, never the POST body
   (`server.ts:1487-1499`, review fix risk-2). anonId is shared with stands-adapter via `localStorage['rooot.anonId']`.
3. **`POST /seat/claim {token, pubkey, method}`** (`server.ts:1557-1618` handleSeatClaim):
   - redeems token → bound `{matchId, anonId}`; `bindClaim` folds the fan's REAL rooted side + locked call (`seat/claim.ts`).
   - saves profile (tricode sides), THEN mints IF the match genuinely reached FULL_TIME
     (`resolvedMatches` gate — `mint-scarf.ts:104-122`, honesty gate; mid-match claim binds but `mint:null`).
   - idempotent per (pubkey,matchId): a durable on-disk marker returns the SAME asset, no double-mint.
   - **Returns `{ profile, mint: { asset, txUrl } | null, mintNote? }`.** `txUrl` = devnet tx explorer link
     (`mint.ts:67-72` `txExplorerUrl(sig,'devnet')`). Asset explorer link buildable client-side from `asset`.
4. (Album, secondary) **`GET /seat/album?pubkey=` → `{scarves:[AlbumScarf]}`** — DAS `getAssetsByOwner`,
   filtered to the ROOOT scarf collection (`seat/album.ts`). Fields: home/away/score/call/result/comp/date/serial/asset/image/matchId.

Return shape the money-shot needs comes back INLINE from step 3 — no album/DAS round-trip required on camera.

---

## 2. THE WALLETLESS MODEL (the crux) — as-built

**Where the owning pubkey comes from: WebAuthn PRF passkey → deterministic ed25519 keypair, in-browser.**
`apps/web/public/seat-passkey.js` (fully built, dual-mode Node/browser):
- `passkeyClaim(anonId)`: creates/uses a platform passkey, evaluates the PRF extension with a fixed
  app-scoped salt (`rooot.seat.prf.v1`), takes the 32-byte PRF output as an ed25519 seed
  (`keyFromPrf`, tweetnacl `sign.keyPair.fromSeed`), returns `{ pubkey, method:'passkey' }`.
- **The secret is NEVER stored, sent, or logged** (`seat-passkey.js:164`; only pubkey + WebAuthn credId in localStorage).
  It is RE-DERIVED on demand from the fan's biometric.

**Why "owned by the fan" is truthful:** only the fan's passkey (Face/Touch ID) + the app salt can
re-derive the private key. The service mints TO that pubkey and PAYS (`mint-scarf.ts:170` `mintRelic(..., record.pubkey, ...)`),
but never holds the key — true self-custody, walletless, no seed phrase, no wallet extension, zero @solana deps in the browser.
The mint payer is a SEPARATE throwaway devnet key (`mint/keypair.ts`), never the fan's.

The proof script passes `method:'privy'` with a Node `Keypair.generate()` ONLY because Node has no WebAuthn —
it is a stand-in to exercise the route. The real browser path is passkey. **`window.__seatPrivyClaim`
(the Privy embedded-wallet fallback) is a declared seam but is NEVER defined** (`seat-adapter.js:7,181`) — so
on a device WITHOUT PRF, `claim()` rejects `claim-unavailable` and the fan honestly stays anonymous (no fake ownership).

**Recommended fan UX for tomorrow = passkey (already built).** Most honest + most feasible: one Face-ID
tap, fan cryptographically owns the scarf, nothing faked. Tradeoff: requires a PRF-capable
browser+authenticator (recent Safari 18 / Chrome on macOS with Touch ID; iOS Face ID). Mitigation:
demo on a known-good device and rehearse on it. Do NOT ship the Privy fallback tomorrow (adds a dep + backend);
do NOT fake a key server-side (would violate "owned by the fan").

---

## 3. Where it lives + what to render

**Host surface = `apps/web/public/terrace.html`** — it already has the full-time "keepsake" card with a
**KEEP IT** button (`#skKeep`, terrace.html:280, handler `:524-536`). Today that handler ONLY writes a
localStorage `rooot.kept.<matchId>` record and walks to the cabinet — it does NOT mint. This is the natural
claim home ("the stand settles into the keepsake" at FULL_TIME, shown by `showKeepsake()` off the real
verdict/clock, `:490,661,856`). `MATCH_ID` is in scope (`terrace.html:334`).

**Render the result on the terrace (inline, from the claim response):** on KEEP IT →
`window.__seat.claim({matchId: MATCH_ID})`; show a "minting on devnet…" state (mint takes ~5-20s — the POST
awaits Irys upload + on-chain create, so the button MUST NOT look frozen); on resolve show
`{ pubkey, mint:{asset,txUrl} }` → keep the woven scarf already on screen, add "on devnet · yours forever"
+ a link to `mint.txUrl` (tx) and/or `https://explorer.solana.com/address/<asset>?cluster=devnet`.
Note: the on-chain IMAGE is a generic branded gradient placeholder (`mint/cover.ts`, honestly labeled) — the
beautiful scarf is the CSS-woven one the terrace/cabinet already draw from facts. Lean on that, not the DAS image.

**Secondary surface = `apps/web/public/cabinet.html`** (the trophy case / album). It ALREADY reads
`window.__seat`/`window.__album` and renders real DAS `album.scarves` via `scarfHTML` (`cabinet.html:262-297,340-344,365-366`),
but loads NONE of the adapter scripts, so those globals never exist and it falls back to local kept records.
Load the 3 scripts here and the album grid lights up for a returning fan; optionally add an explorer link per scarf in `scarfHTML`.

---

## 4. Server gaps / reachability (verified against prod today, 2026-07-13)

- `GET https://rooot-stands.fly.dev/health` → 200 `{uptime:17083,...}` — **up**.
- `GET /seat/album?pubkey=notreal` → 400 `{"error":"invalid pubkey"}` — **route deployed**.
- `OPTIONS /seat/claim` → **204 with `Access-Control-Allow-Origin: *`**, methods GET/POST/OPTIONS, allow-headers content-type
  (`server.ts:1457-1461`) — **browser cross-origin POST will work** (rooot.club / localhost preview → fly.dev).
- `GET /seat/album?pubkey=<valid-format>` → 200 `{"scarves":[]}` — **DAS lookup path live** (empty for a random owner).
- WS `wss://rooot-stands.fly.dev/` is the same httpServer the routes sit on → token ceremony reachable.

**No server change needed for the on-camera money-shot.** Two server-side items to confirm on the runthrough:
1. **`HELIUS_RPC_URL` Fly secret** — needed for the *cabinet album* only (`server.ts:1626-1638`; public devnet RPC
   has no DAS `getAssetsByOwner`). If unset, `/seat/album` returns `{scarves:[]}` even after a real mint (the terrace
   money-shot is unaffected — it uses the inline claim response). fly.toml `[env]` doesn't list it → verify it's set as a secret.
2. ROOOT_SCARF_COLLECTION set + mint payer funded — stated done by owner; album returned clean (no RPC error surfaced).

---

## 5. Build plan (exact files + edits) — coordinator integrates

All client code already exists and is unit-tested. This is script-tag + button wiring.

A. **`apps/web/public/terrace.html`** — add, in load order, BEFORE the inline `<script>` (after line 288-290):
   ```html
   <script src="plate/nacl.min.js"></script>   <!-- sets window.nacl; MUST precede seat-passkey -->
   <script src="seat-passkey.js"></script>       <!-- window.seatPasskey -->
   <script src="seat-adapter.js"></script>       <!-- window.__seat / __album -->
   ```
   Then rewrite `el('skKeep').onclick` (`:524-536`): on first tap call
   `window.__seat.claim({ matchId: MATCH_ID })`; set a "MINTING ON DEVNET…" button/label; on resolve
   `{pubkey, mint}` → if `mint`: swap to "KEPT ✓ — ON DEVNET, YOURS" + render `mint.txUrl` (and asset) link;
   keep the existing localStorage kept-record write (cabinet cards still want it). Handle reject:
   `claim-unavailable`/`prf-unsupported` → honest "couldn't claim on this device" (fan stays anonymous, nothing faked);
   `mint:null` + `mintNote` → show the retry note ("your seat is saved; claim again shortly"). Guard the ~15s await with the minting state.

B. **`apps/web/public/cabinet.html`** — add the SAME 3 script tags (it currently loads zero adapters).
   No JS change strictly required (`resolve()`/`render()` already consume `__seat`/`__album` and re-render on their `.on`
   callbacks). Optional: add `mint.txUrl`/asset explorer link into `scarfHTML` (`:287-298`).

C. **No `apps/web/src/` work** — src/mint is empty and unused by the demo; everything ships from `public/*`.

Lane note (AGENTS.md): terrace/cabinet are public demo surfaces; the seat adapters are already written and
Node-tested (`scripts/_seat-test.mjs`, `_seat-passkey-test.mjs`). Coordinator integrates + commits.

---

## 6. Feasibility + the single biggest risk

**Feasibility: a few-hours UI-wiring job. No server changes for the money-shot.** Server is deployed,
CORS-open, idempotent, funded; the client adapters + passkey derivation are fully built and tested. The literal
remaining work: 3 `<script>` tags on two pages + rewrite one `onclick` (~30-40 lines) with a minting/loading state.

**Biggest risk to landing it on camera: the passkey PRF path is the ONLY working browser mechanism
(`window.__seatPrivyClaim` is undefined), so the demo device+browser MUST support WebAuthn PRF + a platform
authenticator (Touch/Face ID).** If it doesn't, `claim()` rejects and there is no fallback. Mitigation:
pick and REHEARSE on a known-good device (recent macOS Safari/Chrome with Touch ID, or iPhone Face ID) end-to-end
before going live. Second-order risks (both dodge-able, neither blocks the on-camera shot): (a) the mint's ~5-20s
latency — mask with a minting state, the POST is synchronous; (b) `HELIUS_RPC_URL` for the cabinet album — verify
the Fly secret, but the terrace money-shot uses the inline claim response and doesn't depend on DAS.
