# YOUR SEAT — identity, custody & retention (design spec)

*Date: 2026-07-09 · Lane: coordinator (data/identity/persistence/on-chain) · Sits under Design's rooms.*

## 1 · Problem

The persistent-profile / login / retention layer does not exist yet. Today:

- Identity is one anonymous, device-local id (`rooot.anonId` in localStorage, `stands-adapter.js`). Survives a reload, not a new phone. No account behind it.
- The cabinet (`cabinet.html`) is fully built visually but reads **nothing live** — "lukas", the record counts, the scarves, the seven virtue pins are hardcoded samples ("sample shown until wired").
- The gate captures a real call (side + score + conviction → `rooot.pass`) but only the terrace reads it. It never reaches the cabinet. The keep-loop is physically unconnected.
- On-chain is real but unwired: the Metaplex Core relic mint ran once on devnet (labeled proof, synthetic data); a memo-relayer notarizes a call as `sha256(anonId)`. **The architecture already decided fans are walletless — the service holds the keypair and pays fees** (`services/stands/src/relay.ts`).

The build already answered "should soccer fans connect wallets": no. The real question is **what stable, low-friction identity lets a fan be recognized on return, own a profile that fills up, and hold keepsakes that are genuinely theirs across devices — without it ever feeling like crypto.**

## 2 · The concept — "your face is your seat"

A fan plays **anonymous** at the gate. Identity attaches once, at the emotional peak (full time), when there is something worth keeping. From then on, the fan's own key is their identity, their keepsakes are truly theirs, and their profile is simply "what this key owns."

Answers the three asks directly:
- **Persistent profile** = `YOUR SEAT` (who you are) + `THE ALBUM` (what you kept), both derived from the fan's key.
- **Login** = your face, once, at the moment of keeping.
- **Come back** = the album's empty pockets, relics worth sending, and the per-match ritual.

Owner steer captured (2026-07-09): invisible self-custodial wallet, *yours day one*; return via **collect + share + ritual**, explicitly **no leaderboards / standing / competitive gamification** (fits the no-cheese / no-victory-symbols / no-faith-multiplier canon).

## 3 · Identity architecture

### 3.1 The `window.__seat` interface (mirrors existing adapters)

The shipped surfaces are static HTML. Identity lives behind one interface the surfaces read, exactly like `window.__stands` / `window.__match` / `window.__loom`:

```
window.__seat = {
  status,        // 'anon' | 'claimed'
  pubkey,        // base58 Solana pubkey once claimed, else null
  anonId,        // the pre-claim device id (bridged from stands-adapter)
  method,        // 'passkey' | 'privy' | null
  profile,       // { sides:[], since, displayName? } — small, server-enriched
  claim(),       // runs the claim flow (passkey PRF hero → Privy fallback); resolves to pubkey
  on(fn)         // subscribe to identity changes
}
```

The mechanism (passkey-PRF vs Privy) is swappable behind this interface. Surfaces never touch WebAuthn or Privy directly — they read `__seat` and call `__seat.claim()`.

### 3.2 Hero path — passkey wallet (WebAuthn PRF, vendor-free)

1. Create a platform passkey (Face ID / Touch ID), synced by iCloud Keychain / Google Password Manager.
2. Request the WebAuthn `prf` extension with a fixed app salt → the authenticator returns a stable 32-byte secret (`HMAC-SHA256(credentialSecret, salt)`), deterministic per passkey.
3. Derive an ed25519 keypair from those 32 bytes (`Keypair.fromSeed(prfOutput)`). **Never stored** — re-derived on demand.
4. The public key is the identity. The private key is only needed to *transfer/burn* a relic later (self-custody); for claim + mint the service only needs the pubkey.

Properties: no vendor, no seed phrase, self-custodial. Cross-device **within an ecosystem** (all your Apple devices share the synced passkey → same key). Honest limits: needs a recent device with PRF support; cross-ecosystem (iPhone↔Android) yields a different key; recovery = your platform's passkey sync.

### 3.3 Fallback path — Privy embedded wallet (proven in kommit)

For devices without PRF support, or fans who want universal cross-device + email recovery. Reuse the kommit integration verbatim in shape:

- `PrivyProvider` config (`/Users/ls/Documents/Kommit/app/web/src/components/providers.tsx`): `walletChainType: "solana-only"`, `loginMethods: ["email","google","passkey"]`, `embeddedWallets.solana.createOnLogin: "all-users"`, `solana.rpcs[{solana:devnet}]` wired to the devnet RPC.
- Identity = the embedded wallet address (`useWallets()[0].address`), exactly like kommit's `AuthProvider.RealAuthProvider` (`user.id = wallet.address`).
- Because ROOOT's surfaces are vanilla, Privy mounts as a **small React island** whose only job is to run the claim flow and publish the resulting pubkey to `window.__seat` (it does not own any ROOOT UI).

Note: Privy already lists `passkey` as a login method, so the *gesture* is the same Face-ID tap; the difference is only whether the key is PRF-derived on-device (hero) or Privy-managed (fallback).

### 3.4 anon → claimed binding

At claim, the fan's pre-claim session must not be lost:
- Read `rooot.anonId` and `rooot.pass` (the call made this match).
- Send `{ anonId, pubkey, method }` to the server; the server binds the anon session's live-match record (side, prediction, resolution) to the pubkey so the freshly-minted scarf carries the true call the fan actually made.
- After claim, `window.__seat.status = 'claimed'`; the pubkey persists locally (the passkey re-derives it; Privy restores its session) so return visits skip the gate-to-claim step.

## 4 · Custody & mint model

- Relics mint as **Metaplex Core assets owned by the fan's pubkey** (`owner: fanPubkey`). Only the fan's key can ever transfer/burn them → genuine self-custody.
- **The service is the payer/authority** and signs + pays fees (fan needs no SOL, sees no gas prompt). Reuses the existing walletless relayer/mint (`services/stands/src/mint/mint.ts`, `relay.ts`) — the single change is minting to the fan's key instead of the service's.
- "Yours forever" becomes literally true; no company holds the keys (hero path) or holds them only as secured embedded-wallet infra (fallback).

## 5 · The two rooms

- **YOUR SEAT** — who you are: your sides (teams you've rooted), your season ticket (itself a minted asset at first claim), your call history **carried inside the scarves** (the object holds its own story — collectible law). Replaces the hardcoded `#who = "lukas"` in `cabinet.html`.
- **THE ALBUM** — what you kept: a scarf per match lived, a pin per call, the pulse-patches you felt; laid out **GOT · GOT · NEED** across the tournament. Design's existing cabinet visuals (scarf rack, virtue pins) become this room, wired to real data.

Both are **rendered from the assets the pubkey owns** (Metaplex Core "assets by owner" via RPC/DAS, cached client-side). The profile *is* the collection — no separate account DB to keep in sync. Off-chain state is minimal (a small server profile blob keyed by pubkey for the `sides`/`displayName`/`since` metadata that isn't worth a mint), following kommit's `/api/me` shape.

## 6 · The retention loop

One motion, the three hooks the owner picked:

- **Collect:** live a match → PRESSING (claim + mint) → the scarf lands in THE ALBUM → the album shows **NEED** pockets (matches still to come) → the next GATE.
- **Share:** any relic passes the crop test → the fan sends it → the recipient opens it → the recipient is at the gate. The share is the front door for the next fan.
- **Ritual:** the gate itself — pass, side, call, seat — is the per-match habit.

No standings, no leaderboard. The pull is the album filling and the object worth sending.

## 7 · The claim moment

- **Primary:** at the **PRESSING** (full time). The scarf is woven; the app says, plainly, *this is yours — take your seat to keep it.* One tap. Peak value → highest conversion.
- **Also:** claimable anytime from YOUR SEAT (a fan who wants an account before full time can).
- **Graceful edge:** if the device can't do passkey-PRF, offer the Privy fallback; if the fan declines both, they keep playing **honest anonymous** — the gate never blocks — and can claim later. We degrade to anonymous, never to a fake account.

## 8 · Honesty seams

- The album shows only matches the fan **truly lived**; a NEED slot is an **empty pocket**, never a fake sticker.
- The call shown on a scarf is the call the fan actually locked at kickoff (bound from `rooot.pass` / server record), never back-filled.
- Market ≠ crowd, counts never %, nothing renders that didn't happen — unchanged, applies to SEAT/ALBUM too.
- Recovery honesty: hero-path keys live and die with the fan's passkey sync. Offer an optional "write down your key" export, **off by default** (devnet relics are valueless; don't scare the common fan with seed-phrase theater).

## 9 · Scope & phasing

**MVP (hackathon):**
1. `window.__seat` interface + anon→claim bridge from `stands-adapter`.
2. Passkey-PRF hero path (create passkey → derive pubkey).
3. Privy fallback island (reuse kommit config) for non-PRF devices.
4. Claim-at-PRESSING → mint **one relic (the scarf)** to the fan's pubkey, service-paid.
5. THE ALBUM + YOUR SEAT rendered from owned assets (replace the hardcoded cabinet data).

**Later:** pins/patches as their own assets; the season-ticket relic; share-cards (crop-test export); export/recovery polish; cross-ecosystem migration (export hero key → import to Privy).

## 10 · Open decisions (recommendations — flag to override)

- **Claim placement:** PRESSING-primary **and** anytime-from-SEAT. (Recommended both; PRESSING is where conversion lives.)
- **The call as a collectible:** lives **inside the scarf** for MVP (the object carries its story); a standalone **pin** per call is a *later* album item, not MVP. (Recommended.)
- **Build order:** wire the **Privy fallback first** to prove the full loop end-to-end (identity → mint-to-owner → album), then layer the **passkey-PRF hero** on top as the differentiator. Rationale: Privy is proven in kommit and unblocks the whole chain fastest; PRF makes it magical once the chain works. (Recommended — flag if you'd rather lead with the PRF hero for demo impact.)
- **Off-chain store:** a minimal profile blob keyed by pubkey (kommit `/api/me` shape) for `sides`/`since`/`displayName`; everything else derived from chain. No new database engine — the stands service gains one small keyed store or a flat file, consistent with its current `/tmp` snapshot approach.

## 11 · Reuse map (kommit → ROOOT)

| kommit (`/Users/ls/Documents/Kommit/app/web/src/`) | ROOOT use |
|---|---|
| `components/providers.tsx` (PrivyProvider + Solana devnet config) | Fallback island config, near-verbatim |
| `components/auth/AuthProvider.tsx` (wallet=identity, dual Real/Mock) | `__seat` fallback path + demo persona mirrors ROOOT's `?demo=1` |
| `app/api/me/route.ts` + `lib/me-client.ts` (`fetchMe`) | Server profile keyed by pubkey (SEAT metadata) |
| `next.config.ts` CSP (Privy + devnet RPC hosts) | CSP allowances if/where the island runs |

## 12 · Non-goals

Leaderboards, standings, foresight-ranking, competitive scores; mainnet; forcing identity at the gate; seed-phrase UX; any keepsake that isn't a true record of something the fan lived.
