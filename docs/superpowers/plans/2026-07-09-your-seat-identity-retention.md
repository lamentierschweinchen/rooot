# YOUR SEAT — identity, custody & retention · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give ROOOT fans a self-custodial, invisible identity — relics mint to the fan's own key, the profile persists across sessions, and the album/gate loop brings them back.

**Architecture:** Identity lives behind a vanilla `window.__seat` interface mirroring the existing `__stands`/`__match`/`__loom` adapters. Relics mint as Metaplex Core assets **owned by the fan's derived pubkey** while the service keypair pays fees (reusing the walletless relayer). The passkey-PRF hero derives an ed25519 key from a WebAuthn PRF secret on-device (no vendor); a Privy embedded-wallet React island (ported from kommit) is the fallback for non-PRF devices. **Build the Privy chain end-to-end first, then layer the passkey hero.**

**Tech Stack:** Vanilla JS IIFEs (client surfaces) tested via the `Module._compile` CJS shim + `node:assert`; TypeScript server (`services/stands`) run via `tsx`; `@metaplex-foundation/mpl-core` + `umi` (mint, existing); `@privy-io/react-auth` (fallback, from kommit); WebAuthn PRF + `tweetnacl`/`@solana/web3.js` (hero derivation); Helius DAS RPC (album — assets by owner).

## Global Constraints

- **Devnet only.** Never build the mainnet path. Never log secret key bytes; redact RPC api-keys (`u.replace(/api-key=[^&]+/gi,'api-key=***')`). `.secrets/` and any keypair files are never committed.
- **Custody:** relics mint with `owner = fan pubkey`; the service mint keypair is the fee payer (walletless fans). Reuse `services/stands/src/mint/*`, do not fork it.
- **Honesty seams (absolute):** nothing renders that didn't happen; a NEED album slot is an empty pocket, never a fake sticker; a scarf shows the call the fan **locked at kickoff**, never back-filled; market ≠ crowd; counts never shown as %.
- **No leaderboards, standings, or competitive scores.**
- **Copy:** plain, adult, no exclamation marks, show-don't-tell; the interface asks the natural question.
- **Client identity is exposed only through `window.__seat`** (mirrors `window.__stands`). Surfaces never call WebAuthn or Privy directly.
- **Server persistence** follows the existing flat-file snapshot pattern (`services/stands/src/snapshot.ts` → `/tmp`). No new database engine.
- **Commit trailer** on every commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## File Structure

**Client** (`apps/web/public/`, shipped vanilla surfaces):
- `seat-adapter.js` (NEW) — owns `window.__seat`: state machine (`anon`|`claimed`), the anon-bind payload, orchestrates `claim()` (passkey → privy). Browser IIFE with a `module.exports` tail for tests.
- `seat-passkey.js` (NEW) — WebAuthn passkey create/get with the `prf` extension; PRF-bytes → ed25519 pubkey derivation. IIFE + exports tail.
- `seat-privy.js` (NEW, built) — a small React island (vite lib entry under `apps/web/seat-privy/`) porting kommit's Privy provider; on login, publishes the pubkey to `window.__seat`.
- `cabinet.html` (MODIFY) — YOUR SEAT header + THE ALBUM read `window.__seat` + `/seat/album`; replace the hardcoded `#who`/`SCARVES`.
- `woven-loom.html` (MODIFY, the PRESSING) — add the "take your seat to keep it" claim CTA at full time → `__seat.claim()`.
- `stands-adapter.js` (MODIFY) — expose `anonId` + `rooot.pass` to `seat-adapter` for the bind.

**Server** (`services/stands/src/`):
- `mint/mint.ts` (MODIFY) — `mintRelic` gains an optional `owner` pubkey → `create({ …, owner })`.
- `mint/collection.ts` (NEW) — one-time `ensureScarfCollection()` (a Core collection so the album can filter ROOOT scarves).
- `seat/claim.ts` (NEW) — `bindClaim(state, anonId, pubkey, method)`: fold the live match-state (side, prediction, resolution) into a claim record.
- `seat/profile-store.ts` (NEW) — pubkey → `{ sides, since, displayName }` flat-file store (snapshot.ts pattern).
- `seat/album.ts` (NEW) — `shapeAlbum(assets)` + `assetsByOwner(pubkey)` (Helius DAS) → scarf list.
- `server.ts` (MODIFY) — routes `POST /seat/claim`, `GET /seat/album`, `GET /seat/me`.

**Tests:**
- `scripts/_seat-test.mjs`, `scripts/_seat-passkey-test.mjs` (NEW) — client IIFE logic (CJS shim).
- `services/stands/src/seat/*.test.ts` run via `npx tsx` — claim fold, profile store, album shaping.
- `services/stands/src/mint/scripts/proveOwnedMint.ts` (NEW) — devnet: mint owned by a test pubkey, read back the owner.

---

## PHASE 1 — Prove the chain (Privy path)

### Task 1: Mint a relic OWNED by an arbitrary pubkey (service pays)

**Files:**
- Modify: `services/stands/src/mint/mint.ts:32-44`
- Create: `services/stands/src/mint/scripts/proveOwnedMint.ts`

**Interfaces:**
- Produces: `mintRelic(relic, uris, umi, cluster, owner?: string): Promise<RelicMintResult>` — when `owner` is a base58 pubkey, the minted asset is owned by it; the `umi` identity (service) remains the fee payer.

- [ ] **Step 1: Add the `owner` parameter to `mintRelic`**

In `services/stands/src/mint/mint.ts`, add the import and the optional param:

```ts
import { create } from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey, type Umi } from '@metaplex-foundation/umi';
// …
export async function mintRelic(
  relic: MatchRelicData,
  uris: UploadedRelicUris,
  umi: Umi,
  cluster: MintCluster,
  owner?: string,
): Promise<RelicMintResult> {
  const asset = generateSigner(umi);
  const tx = await create(umi, {
    asset,
    name: buildOnChainName(relic),
    uri: uris.metadataUri,
    ...(owner ? { owner: publicKey(owner) } : {}),
  }).sendAndConfirm(umi);
  // …unchanged…
}
```

- [ ] **Step 2: Write the devnet proof that reads the owner back**

Create `services/stands/src/mint/scripts/proveOwnedMint.ts` — clone `proveRelicMint.ts` but (a) generate a throwaway "fan" keypair, (b) pass `fan.publicKey` as `owner`, (c) after mint, fetch the asset and assert its owner:

```ts
// …identical umi + funding + uploadRelic setup as proveRelicMint.ts…
import { generateSigner } from '@metaplex-foundation/umi';
import { fetchAsset } from '@metaplex-foundation/mpl-core';

const fan = generateSigner(umi);                 // the "fan" owns it; never funded
const result = await mintRelic(relic, uris, umi, 'devnet', String(fan.publicKey));
const onchain = await fetchAsset(umi, result.asset);
if (String(onchain.owner) !== String(fan.publicKey)) {
  throw new Error(`owner mismatch: ${onchain.owner} !== ${fan.publicKey}`);
}
console.log(`OK asset ${result.asset} owned by fan ${fan.publicKey}, paid by service ${umi.identity.publicKey}`);
```

- [ ] **Step 3: Run the proof on devnet**

Run: `cd services/stands && npx tsx src/mint/scripts/proveOwnedMint.ts`
Expected: `OK asset <addr> owned by fan <fanPubkey>, paid by service <servicePubkey>` and a real explorer link. If devnet airdrop is rate-limited, fund the service key per the script's printed `solana airdrop` line and re-run.

- [ ] **Step 4: Commit**

```bash
git add services/stands/src/mint/mint.ts services/stands/src/mint/scripts/proveOwnedMint.ts
git commit -m "feat(mint): relics can mint owned by the fan's key, service pays" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `window.__seat` interface + state machine

**Files:**
- Create: `apps/web/public/seat-adapter.js`
- Test: `scripts/_seat-test.mjs`

**Interfaces:**
- Consumes: `localStorage 'rooot.anonId'` and `'rooot.pass'` (from stands-adapter / gate).
- Produces (pure, exported for tests): `nextSeat(state, event)` where `event` is `{type:'reset'} | {type:'claimed', pubkey, method}`; and `bindPayload(anonId, passRaw)` → `{ anonId, call, side } | { anonId, call:null, side:null }`.
- Produces (browser): `window.__seat = { status, pubkey, anonId, method, profile, claim(), on(fn) }`.

- [ ] **Step 1: Write the failing test**

Create `scripts/_seat-test.mjs` (mirror `_matchread-test.mjs`'s CJS-shim header):

```js
import assert from 'node:assert';
import Module from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.resolve(__dirname, '../apps/web/public/seat-adapter.js');
const m = new Module(p); m.filename = p; m.paths = Module._nodeModulePaths(path.dirname(p));
m._compile(fs.readFileSync(p, 'utf8'), p);
const { nextSeat, bindPayload } = m.exports;

// fresh state is anonymous
let s = nextSeat(undefined, { type: 'reset' });
assert.equal(s.status, 'anon'); assert.equal(s.pubkey, null);
console.log('OK fresh state anon');

// claiming sets pubkey + method
s = nextSeat(s, { type: 'claimed', pubkey: 'FanPubKey111', method: 'passkey' });
assert.equal(s.status, 'claimed'); assert.equal(s.pubkey, 'FanPubKey111'); assert.equal(s.method, 'passkey');
console.log('OK claimed');

// bindPayload parses a real gate pass
const pass = JSON.stringify({ side: 'h', call: { h: 2, a: 1 }, conv: 3, ts: 1 });
assert.deepEqual(bindPayload('anon-x', pass), { anonId: 'anon-x', side: 'h', call: { h: 2, a: 1 } });
console.log('OK bindPayload with pass');

// bindPayload tolerates a missing / malformed pass (anonymous fan who never called)
assert.deepEqual(bindPayload('anon-y', null), { anonId: 'anon-y', side: null, call: null });
assert.deepEqual(bindPayload('anon-z', '{bad'), { anonId: 'anon-z', side: null, call: null });
console.log('OK bindPayload tolerant');
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx tsx scripts/_seat-test.mjs`
Expected: FAIL — cannot read properties / `nextSeat is not a function` (file doesn't exist yet).

- [ ] **Step 3: Write `seat-adapter.js`**

```js
/*
 * ROOOT — SEAT interface (coordinator lane: identity -> window.__seat).
 * Mirrors window.__stands/__match: surfaces read __seat, never touch WebAuthn/Privy.
 * Pure core (nextSeat/bindPayload) is Node-testable via scripts/_seat-test.mjs.
 */
(function (root) {
  'use strict';
  function nextSeat(state, ev) {
    var s = state || { status: 'anon', pubkey: null, method: null };
    if (!ev) return s;
    if (ev.type === 'reset') return { status: 'anon', pubkey: null, method: null };
    if (ev.type === 'claimed') return { status: 'claimed', pubkey: ev.pubkey, method: ev.method };
    return s;
  }
  function bindPayload(anonId, passRaw) {
    var out = { anonId: anonId, side: null, call: null };
    try { var p = JSON.parse(passRaw); if (p && typeof p === 'object') { out.side = p.side || null; out.call = p.call || null; } } catch (_) {}
    return out;
  }
  root.nextSeat = nextSeat; root.bindPayload = bindPayload;
  if (typeof module !== 'undefined' && module.exports) module.exports = { nextSeat: nextSeat, bindPayload: bindPayload };
  if (typeof window === 'undefined') return;

  var state = nextSeat(undefined, { type: 'reset' });
  var subs = [];
  function anonId() { try { return localStorage.getItem('rooot.anonId'); } catch (_) { return null; } }
  function fire() { for (var i = 0; i < subs.length; i++) try { subs[i](snap()); } catch (e) {} }
  function snap() { return { status: state.status, pubkey: state.pubkey, method: state.method, anonId: anonId(), profile: window.__seat && window.__seat.profile || null }; }
  function publish() { window.__seat.status = state.status; window.__seat.pubkey = state.pubkey; window.__seat.method = state.method; window.__seat.anonId = anonId(); fire(); }

  // claim(): passkey hero first (Task 11 wires the resolver); Privy fallback (Task 7).
  // Until those land, claim() rejects so callers degrade to honest-anonymous.
  function claim() {
    var resolver = root.__seatClaimResolver;
    if (typeof resolver !== 'function') return Promise.reject(new Error('no claim mechanism available'));
    return resolver({ anonId: anonId(), pass: (function () { try { return localStorage.getItem('rooot.pass'); } catch (_) { return null; } })() })
      .then(function (res) { state = nextSeat(state, { type: 'claimed', pubkey: res.pubkey, method: res.method }); if (res.profile) window.__seat.profile = res.profile; publish(); return res.pubkey; });
  }

  window.__seat = { status: state.status, pubkey: null, method: null, anonId: anonId(), profile: null, claim: claim, on: function (fn) { subs.push(fn); fn(snap()); } };
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx tsx scripts/_seat-test.mjs`
Expected: PASS — four `OK` lines.

- [ ] **Step 5: Commit**

```bash
git add apps/web/public/seat-adapter.js scripts/_seat-test.mjs
git commit -m "feat(seat): window.__seat interface + anon/claim state machine" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Bind the anonymous session to a pubkey at claim (server)

**Files:**
- Create: `services/stands/src/seat/claim.ts`
- Create: `services/stands/src/seat/claim.test.ts`

**Interfaces:**
- Consumes: the live match-state maps (`predictions: Map<anonId,{home,away,atMs}>`, `rooted: Map<anonId,side>`) — see `services/stands/src/match-state.ts:110-120`.
- Produces: `bindClaim(match, anonId, pubkey, method): ClaimRecord` where `ClaimRecord = { pubkey, method, side: 'home'|'away'|'neutral'|null, call: {home,away}|null, matchId, boundAtMs }`. The `call`/`side` come only from the fan's real locked prediction — never invented.

- [ ] **Step 1: Write the failing test**

Create `services/stands/src/seat/claim.test.ts`:

```ts
import assert from 'node:assert';
import { bindClaim } from './claim';

const match = {
  matchId: '18209181',
  rooted: new Map([['anon-1', 'home']]),
  predictions: new Map([['anon-1', { home: 2, away: 1, atMs: 111 }]]),
};

const rec = bindClaim(match as any, 'anon-1', 'FanKey', 'passkey', 999);
assert.equal(rec.pubkey, 'FanKey');
assert.equal(rec.side, 'home');
assert.deepEqual(rec.call, { home: 2, away: 1 });
assert.equal(rec.matchId, '18209181');
console.log('OK binds real side + call');

// an anonymous fan who never called: no call, no side invented
const rec2 = bindClaim(match as any, 'anon-none', 'FanKey2', 'privy', 999);
assert.equal(rec2.side, null);
assert.equal(rec2.call, null);
console.log('OK never invents a call');
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd services/stands && npx tsx src/seat/claim.test.ts`
Expected: FAIL — `Cannot find module './claim'`.

- [ ] **Step 3: Write `claim.ts`**

```ts
export interface ClaimRecord {
  pubkey: string;
  method: 'passkey' | 'privy';
  side: 'home' | 'away' | 'neutral' | null;
  call: { home: number; away: number } | null;
  matchId: string;
  boundAtMs: number;
}
interface MatchLike {
  matchId: string;
  rooted: Map<string, string>;
  predictions: Map<string, { home: number; away: number; atMs: number }>;
}
export function bindClaim(match: MatchLike, anonId: string, pubkey: string, method: 'passkey' | 'privy', nowMs: number): ClaimRecord {
  const side = (match.rooted.get(anonId) as ClaimRecord['side']) ?? null;
  const pred = match.predictions.get(anonId);
  const call = pred ? { home: pred.home, away: pred.away } : null;
  return { pubkey, method, side, call, matchId: match.matchId, boundAtMs: nowMs };
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd services/stands && npx tsx src/seat/claim.test.ts`
Expected: PASS — two `OK` lines.

- [ ] **Step 5: Commit**

```bash
git add services/stands/src/seat/claim.ts services/stands/src/seat/claim.test.ts
git commit -m "feat(seat): bind the anon session (real side+call) to a pubkey at claim" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Profile store (pubkey → profile), flat-file

**Files:**
- Create: `services/stands/src/seat/profile-store.ts`
- Create: `services/stands/src/seat/profile-store.test.ts`

**Interfaces:**
- Produces: `mergeProfile(prev, patch): Profile` (pure) and `loadProfile(pubkey)/saveProfile(pubkey, patch)` (flat-file at `/tmp/rooot-seat/<pubkey>.json`). `Profile = { pubkey, sides: string[], since: number, displayName: string | null }`. `mergeProfile` unions `sides`, keeps the earliest `since`, and only overwrites `displayName` when the patch provides a non-empty one.

- [ ] **Step 1: Write the failing test**

Create `services/stands/src/seat/profile-store.test.ts`:

```ts
import assert from 'node:assert';
import { mergeProfile } from './profile-store';

const base = { pubkey: 'K', sides: ['home'], since: 100, displayName: null };
const merged = mergeProfile(base, { sides: ['away'], since: 50, displayName: 'ro' });
assert.deepEqual(merged.sides.sort(), ['away', 'home']);
assert.equal(merged.since, 50, 'keeps earliest since');
assert.equal(merged.displayName, 'ro');
console.log('OK merge unions sides, earliest since, sets name');

const merged2 = mergeProfile(merged, { sides: ['home'], since: 999, displayName: '' });
assert.deepEqual(merged2.sides.sort(), ['away', 'home'], 'no duplicate sides');
assert.equal(merged2.displayName, 'ro', 'empty name does not clobber');
console.log('OK merge idempotent + name-safe');
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd services/stands && npx tsx src/seat/profile-store.test.ts`
Expected: FAIL — `Cannot find module './profile-store'`.

- [ ] **Step 3: Write `profile-store.ts`** (model the flat-file I/O on `services/stands/src/snapshot.ts`)

```ts
import fs from 'node:fs';
import path from 'node:path';

export interface Profile { pubkey: string; sides: string[]; since: number; displayName: string | null; }
const DIR = process.env.ROOOT_SEAT_DIR || '/tmp/rooot-seat';

export function mergeProfile(prev: Profile, patch: Partial<Profile>): Profile {
  const sides = Array.from(new Set([...(prev.sides || []), ...((patch.sides as string[]) || [])]));
  const since = Math.min(prev.since || Infinity, patch.since ?? Infinity);
  const displayName = (patch.displayName && patch.displayName.trim()) ? patch.displayName.trim() : prev.displayName;
  return { pubkey: prev.pubkey, sides, since: Number.isFinite(since) ? since : Date.now(), displayName };
}
export function loadProfile(pubkey: string): Profile {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, `${pubkey}.json`), 'utf8')); }
  catch { return { pubkey, sides: [], since: Date.now(), displayName: null }; }
}
export function saveProfile(pubkey: string, patch: Partial<Profile>): Profile {
  fs.mkdirSync(DIR, { recursive: true });
  const next = mergeProfile(loadProfile(pubkey), patch);
  fs.writeFileSync(path.join(DIR, `${pubkey}.json`), JSON.stringify(next));
  return next;
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd services/stands && npx tsx src/seat/profile-store.test.ts`
Expected: PASS — two `OK` lines.

- [ ] **Step 5: Commit**

```bash
git add services/stands/src/seat/profile-store.ts services/stands/src/seat/profile-store.test.ts
git commit -m "feat(seat): flat-file profile store keyed by pubkey" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Album shaping + assets-by-owner (server)

**Files:**
- Create: `services/stands/src/seat/album.ts`
- Create: `services/stands/src/seat/album.test.ts`

**Interfaces:**
- Produces (pure): `shapeAlbum(assets): AlbumScarf[]` where an input asset is `{ id, content: { metadata: { name }, json_uri }, ... }` (Helius DAS shape) and `AlbumScarf = { asset, name, matchId, side, call, image }` read from the asset's ROOOT attributes; malformed assets are dropped, not faked.
- Produces (io): `assetsByOwner(pubkey, rpcUrl): Promise<AlbumScarf[]>` — DAS `getAssetsByOwner` filtered to the ROOOT scarf collection, then `shapeAlbum`.

- [ ] **Step 1: Write the failing test** (pure shaping only; the RPC is integration)

Create `services/stands/src/seat/album.test.ts`:

```ts
import assert from 'node:assert';
import { shapeAlbum } from './album';

const assets = [
  { id: 'A1', content: { metadata: { name: 'ROOOT · FRA v MAR' }, json_uri: 'ar://x',
    attributes: [{ trait_type: 'matchId', value: '18209181' }, { trait_type: 'side', value: 'home' },
                 { trait_type: 'call', value: '2-1' }] }, links: { image: 'ar://img' } },
  { id: 'BAD', content: { metadata: {}, json_uri: '' } }, // malformed → dropped
];
const out = shapeAlbum(assets as any);
assert.equal(out.length, 1, 'malformed asset dropped, not faked');
assert.deepEqual(out[0], { asset: 'A1', name: 'ROOOT · FRA v MAR', matchId: '18209181', side: 'home', call: { home: 2, away: 1 }, image: 'ar://img' });
console.log('OK shapes valid scarves, drops malformed');
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd services/stands && npx tsx src/seat/album.test.ts`
Expected: FAIL — `Cannot find module './album'`.

- [ ] **Step 3: Write `album.ts`**

```ts
export interface AlbumScarf { asset: string; name: string; matchId: string | null; side: string | null; call: { home: number; away: number } | null; image: string | null; }
interface DasAttr { trait_type: string; value: string; }
interface DasAsset { id: string; content?: { metadata?: { name?: string }; json_uri?: string; attributes?: DasAttr[] }; links?: { image?: string }; }

function attr(a: DasAsset, k: string): string | null {
  const list = a.content?.attributes || [];
  const hit = list.find((x) => x.trait_type === k);
  return hit ? String(hit.value) : null;
}
function parseCall(v: string | null): { home: number; away: number } | null {
  if (!v) return null; const m = /^(\d+)-(\d+)$/.exec(v); return m ? { home: +m[1], away: +m[2] } : null;
}
export function shapeAlbum(assets: DasAsset[]): AlbumScarf[] {
  const out: AlbumScarf[] = [];
  for (const a of assets) {
    const name = a.content?.metadata?.name; if (!name) continue; // drop malformed, never fake
    out.push({ asset: a.id, name, matchId: attr(a, 'matchId'), side: attr(a, 'side'), call: parseCall(attr(a, 'call')), image: a.links?.image ?? null });
  }
  return out;
}
const SCARF_COLLECTION = process.env.ROOOT_SCARF_COLLECTION || '';
export async function assetsByOwner(pubkey: string, rpcUrl: string): Promise<AlbumScarf[]> {
  const res = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'seat', method: 'getAssetsByOwner', params: { ownerAddress: pubkey, page: 1, limit: 200 } }) });
  const json = await res.json();
  const items: DasAsset[] = (json?.result?.items || []).filter((a: any) => !SCARF_COLLECTION || (a.grouping || []).some((g: any) => g.group_key === 'collection' && g.group_value === SCARF_COLLECTION));
  return shapeAlbum(items);
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `cd services/stands && npx tsx src/seat/album.test.ts`
Expected: PASS — one `OK` line.

- [ ] **Step 5: Commit**

```bash
git add services/stands/src/seat/album.ts services/stands/src/seat/album.test.ts
git commit -m "feat(seat): album shaping + assets-by-owner (DAS), drops malformed not faked" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Server routes — claim, album, me

**Files:**
- Create: `services/stands/src/mint/collection.ts` (one-time collection)
- Modify: `services/stands/src/server.ts` (add three routes; hook the claim → mint)

**Interfaces:**
- Consumes: `bindClaim` (Task 3), `saveProfile`/`loadProfile` (Task 4), `assetsByOwner` (Task 5), `mintRelic` (Task 1), the existing relic-build path used by `proveRelicMint.ts` (`uploadRelic` + `MatchRelicData`).
- Produces: `POST /seat/claim { anonId, pubkey, method }` → `{ profile, mint: { asset, txUrl } | null }`; `GET /seat/album?pubkey=` → `{ scarves: AlbumScarf[] }`; `GET /seat/me?pubkey=` → `{ profile }`.

- [ ] **Step 1: Add `ensureScarfCollection()`**

Create `services/stands/src/mint/collection.ts`: `createCollection` (mpl-core) once, cache the address in `/tmp/rooot-seat/collection.json` (or `ROOOT_SCARF_COLLECTION` env). Pass the collection into `create()` in `mintRelic` when set so the album filter in Task 5 works. (Model the umi/keypair setup on `proveRelicMint.ts:181-184`.)

- [ ] **Step 2: Wire the routes in `server.ts`**

Add handlers (match the existing http/ws server's routing style in `server.ts`):

```ts
// POST /seat/claim
const record = bindClaim(currentMatch, body.anonId, body.pubkey, body.method, Date.now());
const profile = saveProfile(body.pubkey, { sides: record.side ? [record.side] : [], since: record.boundAtMs });
let mint = null;
if (record.call || record.side) {                    // only mint a scarf for a fan who actually lived the match
  const relic = buildRelicFromMatch(currentMatch, record);   // reuse the proveRelicMint relic-build path, real data
  const uris = await uploadRelic(/* cover */, relic, umi, { live: true, /* … */ });
  const res = await mintRelic(relic, uris, umi, 'devnet', body.pubkey);
  mint = { asset: res.asset, txUrl: res.txUrl };
}
respondJson({ profile, mint });

// GET /seat/album?pubkey=
respondJson({ scarves: await assetsByOwner(pubkey, RPC_URL) });

// GET /seat/me?pubkey=
respondJson({ profile: loadProfile(pubkey) });
```

- [ ] **Step 3: Verify with a local server + curl**

Run: `cd services/stands && npm run dev` (or the existing start script). Then:
`curl -s -XPOST localhost:<port>/seat/claim -d '{"anonId":"anon-1","pubkey":"<devnet fan key>","method":"privy"}'`
Expected: JSON with `profile.sides` reflecting the rooted side and a `mint.asset` explorer-resolvable on devnet (or `mint:null` if that anon never called). Then `curl 'localhost:<port>/seat/album?pubkey=<fan key>'` returns the scarf just minted.

- [ ] **Step 4: Commit**

```bash
git add services/stands/src/mint/collection.ts services/stands/src/server.ts
git commit -m "feat(seat): /seat/claim (bind+mint), /seat/album, /seat/me routes" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Privy fallback island (ported from kommit)

**Files:**
- Create: `apps/web/seat-privy/main.tsx`, `apps/web/seat-privy/vite.config.ts` (lib build → `apps/web/public/seat-privy.js`)
- Modify: `apps/web/public/seat-adapter.js` (register the Privy resolver)

**Interfaces:**
- Consumes: `@privy-io/react-auth` config from `/Users/ls/Documents/Kommit/app/web/src/components/providers.tsx` (verbatim shape: `walletChainType:'solana-only'`, `loginMethods:['email','google','passkey']`, `embeddedWallets.solana.createOnLogin:'all-users'`, `solana.rpcs[{solana:devnet}]`).
- Produces: `window.__seatClaimResolver` — when invoked, mounts the Privy modal, and on an authenticated Solana wallet, `POST /seat/claim` then resolves `{ pubkey, method:'privy', profile }`.

- [ ] **Step 1: Port the provider + a headless claim island**

Create `apps/web/seat-privy/main.tsx`: mount a `<PrivyProvider>` (copy the config object from kommit `providers.tsx:59-83`) wrapping a tiny component that, on demand, calls `login()` (kommit `AuthProvider.tsx:151`), reads `useWallets()[0].address`, POSTs `/seat/claim`, and resolves the pending `claim()` promise. Register on load:

```tsx
window.__seatClaimResolver = (ctx) => new Promise((resolve, reject) => { /* open modal; on wallet → POST /seat/claim → resolve({pubkey, method:'privy', profile}) */ });
```

- [ ] **Step 2: Build it as a standalone script**

Add `apps/web/seat-privy/vite.config.ts` (lib mode, IIFE, output `../public/seat-privy.js`). Set `NEXT_PUBLIC_PRIVY_APP_ID` → `VITE_PRIVY_APP_ID` in `apps/web/.env` (never commit the value; document it in `.env.example`).
Run: `cd apps/web && npx vite build -c seat-privy/vite.config.ts`
Expected: `apps/web/public/seat-privy.js` emitted; `tsc --noEmit` in the main build stays green.

- [ ] **Step 3: Load it lazily from `seat-adapter.js`**

In `seat-adapter.js` `claim()`, if `window.__seatClaimResolver` is absent, inject `<script src="seat-privy.js">` once, await its `load`, then call the resolver. Guard with the CSP allowances from kommit `next.config.ts` (Privy + devnet RPC hosts) added to `vercel.json` headers.

- [ ] **Step 4: Verify end-to-end on the preview**

Start the dev server (`preview_start rooot-web`), open a page that calls `__seat.claim()`, complete a Privy email/passkey sign-in, and confirm `window.__seat.status === 'claimed'` with a real `pubkey`, and `/seat/album?pubkey=` returns the freshly minted scarf. Capture the console + network as proof.

- [ ] **Step 5: Commit**

```bash
git add apps/web/seat-privy/ apps/web/public/seat-privy.js apps/web/public/seat-adapter.js apps/web/.env.example vercel.json
git commit -m "feat(seat): Privy fallback island → publishes pubkey to window.__seat" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Wire the PRESSING claim + the cabinet (YOUR SEAT + THE ALBUM)

**Files:**
- Modify: `apps/web/public/woven-loom.html` (full-time claim CTA)
- Modify: `apps/web/public/cabinet.html` (replace hardcoded `#who` + `SCARVES`)
- Modify: `apps/web/public/stands-adapter.js` (already writes `rooot.anonId`; confirm `seat-adapter.js` is loaded alongside it on these surfaces)

**Interfaces:**
- Consumes: `window.__seat` (Task 2), `GET /seat/album` + `GET /seat/me` (Task 6).

- [ ] **Step 1: Add the claim CTA at the PRESSING**

In `woven-loom.html`, when the cloth seals at full time (the `SEALED`/`KEEP` branch), if `window.__seat.status !== 'claimed'`, show one plain control — copy: **"This is yours — take your seat to keep it."** — whose click calls `window.__seat.claim()`; on resolve, swap to "Kept — it's in your album." Load `seat-adapter.js` in the page's script tags.

- [ ] **Step 2: Wire YOUR SEAT + THE ALBUM in the cabinet**

In `cabinet.html`, replace the hardcoded `#who` (line ~132) and the `SCARVES` sample (lines ~157-161): on load, if `window.__seat.status === 'claimed'`, fetch `/seat/me?pubkey=` for the header (sides, since, short pubkey as the name until a display name is set) and `/seat/album?pubkey=` for the rack; render NEED pockets for tournament fixtures the fan has **not** lived (empty pockets, never fake stickers). If `status === 'anon'`, show a plain "No seat yet — claim one when you keep your first match" state. Keep Design's visual scarf/pin components; only swap the data source.

- [ ] **Step 3: Verify on the preview**

Drive it end-to-end in the preview: claim at a (demo) PRESSING → open the cabinet → the real scarf appears with the true call; NEED pockets show for unlived fixtures; the anon state renders when signed out. Screenshot both states.

- [ ] **Step 4: Commit**

```bash
git add apps/web/public/woven-loom.html apps/web/public/cabinet.html
git commit -m "feat(seat): PRESSING claim CTA + cabinet reads YOUR SEAT/THE ALBUM live" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## PHASE 2 — The passkey hero

### Task 9: PRF bytes → deterministic ed25519 pubkey (pure)

**Files:**
- Create: `apps/web/public/seat-passkey.js` (derivation half only in this task)
- Test: `scripts/_seat-passkey-test.mjs`

**Interfaces:**
- Produces (pure, exported): `keyFromPrf(prfBytes: Uint8Array): { pubkey: string, secret: Uint8Array }` — deterministic; same 32 bytes → same base58 pubkey. Uses `tweetnacl` (already a transitive dep via web3) `nacl.sign.keyPair.fromSeed` + base58 encode.

- [ ] **Step 1: Write the failing test**

Create `scripts/_seat-passkey-test.mjs` (CJS-shim header as in Task 2):

```js
// …shim-load apps/web/public/seat-passkey.js → { keyFromPrf } …
const seed = new Uint8Array(32).fill(7);
const a = keyFromPrf(seed), b = keyFromPrf(seed);
assert.equal(a.pubkey, b.pubkey, 'deterministic: same PRF bytes → same pubkey');
assert.equal(typeof a.pubkey, 'string'); assert.ok(a.pubkey.length >= 32 && a.pubkey.length <= 44, 'base58 pubkey length');
const c = keyFromPrf(new Uint8Array(32).fill(9));
assert.notEqual(a.pubkey, c.pubkey, 'different bytes → different pubkey');
console.log('OK keyFromPrf deterministic + distinct');
```

- [ ] **Step 2: Run it, verify it fails**

Run: `npx tsx scripts/_seat-passkey-test.mjs`
Expected: FAIL — module/export not found.

- [ ] **Step 3: Write the derivation in `seat-passkey.js`**

```js
(function (root) {
  'use strict';
  // nacl + bs58 are bundled for the browser build; in Node tests they resolve from node_modules.
  var nacl = (typeof require !== 'undefined') ? require('tweetnacl') : root.nacl;
  var bs58 = (typeof require !== 'undefined') ? require('bs58') : root.bs58;
  function keyFromPrf(prfBytes) {
    var seed = prfBytes.slice(0, 32);
    var kp = nacl.sign.keyPair.fromSeed(seed);
    var pub = bs58.encode ? bs58.encode(kp.publicKey) : bs58.default.encode(kp.publicKey);
    return { pubkey: pub, secret: kp.secretKey };
  }
  root.keyFromPrf = keyFromPrf;
  if (typeof module !== 'undefined' && module.exports) module.exports = { keyFromPrf: keyFromPrf };
})(typeof window !== 'undefined' ? window : this);
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npx tsx scripts/_seat-passkey-test.mjs`
Expected: PASS — one `OK` line. (If `bs58`/`tweetnacl` aren't resolvable, add them to `apps/web` devDeps: `npm --prefix apps/web i -D bs58 tweetnacl`.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/public/seat-passkey.js scripts/_seat-passkey-test.mjs
git commit -m "feat(seat): deterministic ed25519 pubkey from PRF bytes" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: WebAuthn passkey ceremony with the PRF extension

**Files:**
- Modify: `apps/web/public/seat-passkey.js` (add `supportsPrf()` + `passkeyClaim()`)

**Interfaces:**
- Produces: `window.seatPasskey = { supportsPrf(): Promise<boolean>, passkeyClaim(anonId): Promise<{ pubkey, method:'passkey' }> }`. `passkeyClaim` runs `navigator.credentials.create` (once, with `extensions.prf`) then `.get` with `prf.eval.first = <fixed app salt>`, feeds the returned bytes to `keyFromPrf`, and returns the pubkey.

- [ ] **Step 1: Add PRF feature-detection + the ceremony**

Implement per the WebAuthn Level-3 `prf` extension: a fixed 32-byte app salt (constant in the file), `rp.id` = the site host, `pubKeyCredParams` ES256/EdDSA, `authenticatorSelection.residentKey='required'`. Store the created credentialId in `localStorage 'rooot.seat.credId'` so `.get()` re-targets the same passkey. Feature-detect by checking `PublicKeyCredential` + the create result's `getClientExtensionResults().prf?.enabled`.

- [ ] **Step 2: Verify on a real device (integration — WebAuthn cannot run headless)**

Serve over HTTPS (Vercel preview or `rooot.club`), open on a PRF-capable device (iOS 18+/Safari, or Chrome + platform authenticator), call `window.seatPasskey.passkeyClaim('anon-test')`, and confirm: a Face-ID/Touch-ID prompt, a returned base58 pubkey, and that a second call on the same device returns the **same** pubkey. On a non-PRF browser, `supportsPrf()` resolves `false` (so Task 11 routes to Privy). Record the device/OS matrix tested.

- [ ] **Step 3: Commit**

```bash
git add apps/web/public/seat-passkey.js
git commit -m "feat(seat): WebAuthn PRF passkey ceremony → self-custodial pubkey" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Claim resolver — passkey first, Privy fallback

**Files:**
- Modify: `apps/web/public/seat-adapter.js` (`claim()` chooses the mechanism)

**Interfaces:**
- Consumes: `window.seatPasskey` (Task 10), `window.__seatClaimResolver` (Task 7).
- Produces: `window.__seat.claim()` resolves via passkey when `supportsPrf()` is true; otherwise lazy-loads and delegates to the Privy island. After either, it POSTs `/seat/claim { anonId, pubkey, method }` so the scarf mints and the profile binds regardless of mechanism.

- [ ] **Step 1: Wire the resolver order**

In `seat-adapter.js` `claim()`: load `seat-passkey.js`; if `await window.seatPasskey.supportsPrf()`, use `passkeyClaim(anonId)` → then `POST /seat/claim`; else fall through to the Privy path (Task 7). Both paths end in `nextSeat(state,{type:'claimed',…})` + `publish()`.

- [ ] **Step 2: Verify both branches**

On a PRF device: `claim()` uses passkey (`window.__seat.method === 'passkey'`). On a non-PRF browser: `claim()` uses Privy (`method === 'privy'`). Both leave `status === 'claimed'` and a scarf in `/seat/album`. Capture both.

- [ ] **Step 3: Commit**

```bash
git add apps/web/public/seat-adapter.js
git commit -m "feat(seat): claim resolver — passkey hero, Privy fallback, one bind path" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Optional key export ("write down your key", off by default)

**Files:**
- Modify: `apps/web/public/seat-passkey.js` (add `exportSecret()`)
- Modify: `apps/web/public/cabinet.html` (a quiet, opt-in "back up your key" control in YOUR SEAT)

**Interfaces:**
- Produces: `window.seatPasskey.exportSecret(): Promise<string>` — re-runs the PRF ceremony and returns the base58 seed for the fan to store; never logged, never sent anywhere.

- [ ] **Step 1: Add `exportSecret` (pure formatting is testable)**

Add a pure `seedToBackup(secret: Uint8Array): string` (base58 of the 32-byte seed) and unit-test it in `scripts/_seat-passkey-test.mjs` (deterministic for fixed bytes). `exportSecret()` wires the ceremony to it.

- [ ] **Step 2: Add the opt-in control**

In `cabinet.html` YOUR SEAT, a plain, understated link — copy: **"Back up your key"** — hidden by default behind a "…" affordance; on tap, reveal the string with a plain instruction to keep it private. No seed-phrase theater, no scare copy. Passkey method only (Privy manages its own recovery).

- [ ] **Step 3: Run the pure test + verify the control**

Run: `npx tsx scripts/_seat-passkey-test.mjs` → PASS (includes `seedToBackup` determinism). Then eyeball the control in the preview — off by default, legible when opened.

- [ ] **Step 4: Commit**

```bash
git add apps/web/public/seat-passkey.js apps/web/public/cabinet.html scripts/_seat-passkey-test.mjs
git commit -m "feat(seat): optional key backup for passkey fans, off by default" -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Identity behind `window.__seat` (§3.1) → Task 2. ✓
- Passkey-PRF hero (§3.2) → Tasks 9–10. ✓
- Privy fallback, kommit config (§3.3) → Task 7. ✓
- anon→claim binding (§3.4) → Tasks 3, 6, 11. ✓
- Custody: mint to fan, service pays (§4) → Task 1, used in Task 6. ✓
- YOUR SEAT + THE ALBUM from owned assets (§5) → Tasks 5, 8. ✓
- Return loop / claim at PRESSING (§6–7) → Task 8 (and "anytime from SEAT" via the cabinet control). ✓
- Honesty seams (§8): only-lived, NEED = empty pocket, call locked at kickoff → Tasks 3, 5, 8; export off by default → Task 12. ✓
- Scope MVP (§9) → all Phase-1 tasks + hero Phase-2; "later" items (pins/patches assets, season-ticket relic, share-cards) intentionally excluded. ✓

**Placeholder scan:** integration steps (Tasks 6.1, 7.1, 8, 10, 11) describe exact files/params/copy-from sources and give concrete verify commands rather than fabricated SDK code — this is deliberate (WebAuthn/Privy/DAS/devnet cannot be unit-tested headlessly), not a `TODO`. Pure-logic tasks carry complete code + `node:assert` tests.

**Type consistency:** `mintRelic(…, owner?)` (Task 1) is called with `body.pubkey` (Task 6). `ClaimRecord.side/call` (Task 3) feed the scarf attributes read back by `shapeAlbum` (Task 5). `keyFromPrf` (Task 9) → `passkeyClaim` (Task 10) → resolver (Task 11) → `nextSeat({type:'claimed',pubkey,method})` (Task 2). `bindPayload`/`window.__seat` names consistent across Tasks 2, 8, 11.

**Known follow-ups (not MVP):** DAS requires a Helius (or DAS-enabled) RPC — confirm the `RPC_URL` env is DAS-capable before Task 5's integration leg; the ROOOT scarf collection (Task 6.1) must be created once before album filtering is exact.
