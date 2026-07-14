# Anchoring research → ROOOT verdict (2026-07-14)

Scope: how production systems bind off-chain records to chains, read against
ROOOT's actual devnet implementation. Read-only.

## Codebase reality (read first — this is what the patterns get compared against)

- **`services/stands/src/relay.ts`** — two DIFFERENT anchor patterns, correctly
  matched to payload size:
  - `anchorRecordHash(matchId, recordHash)` — memo carries `{v,app,kind:'sentiment',m,h}`,
    i.e. only the sha256 of the full `SentimentRecord`. One memo per match, at
    full time. Fire-and-forget with an async write-back; `server.ts`'s
    `backfillAnchors()` sweep (bounded by `STANDS_BACKFILL_MAX_ATTEMPTS`, default 5)
    re-anchors any record left with `anchorTxSig:null` on disk — already a solid
    at-least-once-eventually design (this is what the last 5 commits hardened).
  - `relayCall(call)` — memo carries the fan's actual claim inline (side, claim,
    minute, market triple as ‰ integers, `sha256(anonId).slice(0,16)`, timestamp)
    — NOT a hash, the real (tiny, ≤~200 byte) payload. One memo per fan CALL.
- **`contracts/sentiment.ts`** (`SentimentRecord.provenance`) and
  **`contracts/relic.ts`** (`ProvenanceRefs`) both declare `txlineRefs: string[]`
  — a field meant to carry TxLINE Merkle anchors for the market window.
  **Every call site populates it with `[]`**: `sentiment/crystallize.ts:86`,
  `sentiment/accumulator.ts:250`, `mint/relic-from-match.ts:84`,
  `mint/scripts/proveRelicMint.ts:145`, `mint/scripts/proveOwnedMint.ts:149`.
  `mint/metadata.ts`'s `buildVerify()` only emits the `txlineRefs` verify-hint
  when the array is non-empty — so today it's silently always omitted. The
  pipe is fully wired end-to-end; nobody has ever put real data in it.
- **`fixtures/provenance/messi-goal-tick-proof.json`** is the ONLY evidence
  TxLINE's `/api/odds/validation?messageId&ts` endpoint was ever called
  (docs/DATA.md: "EXERCISED Jul 4," one-off). Confirmed by grep: zero live
  callers of `odds/validation`, `scores/stat-validation`, or
  `fixtures/validation` anywhere in `services/` or `scripts/`. Shape: a raw
  tick + a two-level Merkle branch (`subTreeProof`: 11 sibling hashes with
  `isRightSibling` flags, from tick → `oddsSubTreeRoot`; `mainTreeProof`: 7
  more, from that subtree root → presumably TxLINE's own on-chain root). Raw
  bytes ≈ 600, JSON-bloated to ~9KB by encoding each byte as an array element
  — would compress to ~800 bytes base64. **Too big for a memo (~200B budget),
  fine for the metadata JSON already going through Irys.**
- **Blocker for wiring it live:** `OddsTick` (`contracts/match.ts`, frozen)
  drops `MessageId` during `parseOddsMessage` (`contracts/normalize.ts`) — the
  raw wire type has it (`RawOddsMessage.MessageId`), the parsed type the
  accumulator/builder actually work over does not. Capturing it means either
  touching the frozen contract (coordinator-only) or capturing MessageId+Ts
  out-of-band in `ingest/txline.ts` alongside the parsed tick.
- **`mint/mint.ts`'s `create()`** and **`mint/collection.ts`'s
  `createCollection()`** use `@metaplex-foundation/mpl-core` correctly for
  collection grouping (DAS `getAssetsByOwner` filtering, `seat/album.ts`) but
  set **no immutability plugin** — no `PermanentFreezeDelegate`, no update
  authority set to `None`. The service's minting identity retains update
  authority over every relic + the collection indefinitely.
- **`data/sentiment/fingerprints.json`** (the tournament-long fold — literally
  the artifact `docs/SENTIMENT.md` calls "the fan-sentiment index a
  broadcaster/sponsor would pay for") is written by the offline
  `sentiment/crystallize.ts` script only. **No hash, no anchor, nothing
  on-chain commits to it.**

## Patterns → who → ROOOT seam → verdict

| # | Pattern | Who does it | ROOOT seam | Verdict | Effort |
|---|---|---|---|---|---|
| 1 | **Hash-anchor**: never put the payload on-chain, anchor `sha256(payload)` only | OpenTimestamps (Bitcoin OP_RETURN), Chainpoint/Factom/Woleet | `relay.ts` `anchorRecordHash` | **Already adopted, correctly.** No change. | — |
| 2 | **Merkle-batch many hashes into one anchor tx** (amortize fees across volume) | OpenTimestamps/Chainpoint calendar servers; TxLINE's own two-level tree (tick→subtree→main) | N/A for ROOOT's own anchors | **Skip.** ~8 matches/hackathon never reaches the volume where batching beats one-memo-per-record; devnet fees are ~free. Premature complexity. | — |
| 3 | **Piggyback on an upstream oracle's own anchor** — embed *their* Merkle proof/CID as a reference in *your* metadata rather than re-deriving trust | IPFS-CID-in-NFT-metadata convention; content-addressing generally; TxLINE's `/api/odds/validation` is exactly this shape, already live | `contracts/sentiment.ts` / `contracts/relic.ts` `txlineRefs` — wired, unpopulated | **Adapt.** Capture 1–3 representative validation proofs per match (kickoff tick + biggest-swing tick), compact/base64-encode, populate `txlineRefs` with the self-contained proof (not a "call this URL later" pointer — TxLINE's free tier dies the same day as the deadline). Do it *before* `assembleSentimentRecord` hashes the record so the existing memo anchor automatically commits to the txline refs too — zero new on-chain tx. | **Small** — a few hours; no new program; reuses the Irys upload already in the mint pipeline. Main work is capturing `MessageId`/`Ts` out-of-band in `ingest/txline.ts` since the frozen `OddsTick` type drops it. |
| 4 | **On-chain immutability flag** (update authority → None / permanent-freeze plugin, "burn the keys") | Metaplex Token Metadata's `isMutable:false`; Metaplex Core's `PermanentFreezeDelegate` / update-authority-`None`; Dapper/TopShot's 2026 move to fully on-chain/IPFS-verifiable moments | `mint/mint.ts`'s `create()` call | **Adapt.** Set update authority to `None` (or add the permanent-freeze plugin with authority `None`) as the last step of `mintScarfNow`, strictly after metadata is finalized and uploaded — a same-tx Core option. Turns "we can't rewrite this" from prose into an on-chain fact. | **Small** — one `create()` option; sequence-sensitive (must be last, mistakes become permanent). Not launch-blocking. |
| 5 | **Match anchor granularity to payload size** — hash-only for large records, inline-the-data for small ones | Implicit in every hash-anchoring system (why bother hashing a payload that's already tiny); closest analogue: POAP-style small claims, Solana Attestation Service's per-claim model | `relay.ts` `relayCall` vs `anchorRecordHash` | **Already adopted, correctly** — flag as intentional, not a gap: `relayCall`'s ≤200B claim payload is cheaper to inline than to hash-and-store-elsewhere, and it makes the fan's receipt self-sufficient (no off-chain DB needed to prove *their own* call). | — |
| 6 (bonus) | **Schema/credential-based attestation service** | Solana Attestation Service (`sas-lib`) — authority → credential → schema → attestation | Would sit next to/replace `relay.ts` | **Skip.** Solves a different problem (structured, multi-issuer reputation claims across many claim *types*) than ROOOT's actual need (integrity-commit one specific record). Requires registering a credential + schema before any attestation — more setup ceremony than the memo pattern for a single-purpose hackathon anchor. Revisit post-hackathon only if ROOOT needs third-party-verifiable issuer claims (e.g. a sponsor co-signing fingerprints). | — |
| 7 (bonus, cheap) | **Anchor the derived/aggregate product too, not just the raw records** | Standard once you have a hash-anchor primitive — anchor summaries the same way as line items | `sentiment/crystallize.ts`'s `fingerprints.json` fold — currently unanchored | **Adapt.** Reuse `anchorRecordHash` verbatim with `kind:'fingerprint'` over `sha256(fingerprints.json)`. Directly strengthens the acquirer-facing pitch: the one artifact literally described as sellable is the one with zero on-chain commitment today. | **Trivial** — same function, new call site. |

## The three verdicts

**(1) Is the memo-per-record anchor defensible as-is for submission?**
Yes. `anchorRecordHash` is a textbook hash-commitment (OpenTimestamps/Chainpoint
pattern) at a scale where Merkle batching would be premature. The dual design
— hash-only for the big `SentimentRecord`, inline-data for the tiny per-call
receipt — correctly matches strategy to payload size, which is exactly what
the researched precedents do. The fire-and-forget-plus-backfill-sweep
durability model is already more robust than most hackathon anchoring code.
No changes needed before Jul 19.

**(2) Cheapest credible path to "relics carry their own provenance"?**
The schema is already fully wired (`txlineRefs` flows contracts → builder →
metadata → verify-hint) — every call site just passes `[]`. Capture a
representative `/api/odds/validation` proof or two per match (shape already
proven in `fixtures/provenance/messi-goal-tick-proof.json`), embed it
compactly in the metadata JSON already going through Irys, populate
`txlineRefs` *before* the record is hashed so the existing anchor tx commits
to it for free. Small effort (a few hours), no new on-chain program. The one
real blocker is `MessageId` getting dropped by the frozen `OddsTick` type —
capture it in the ingest layer instead of threading it through `contracts/`.

**(3) What strengthens the acquirer-facing data story?**
Two cheap adds: anchor `fingerprints.json`'s hash too (reuse
`anchorRecordHash`, new `kind`) — right now the one artifact pitched as a
sellable data product is the only one with zero on-chain commitment. And set
Core's update-authority-to-`None` on mint so "immutable, provable, ours to
keep" is an on-chain fact rather than a doc-comment claim — mirrors exactly
where Metaplex/TopShot-class provenance stories put their credibility.

## Sources

- [ProofSnap — How OpenTimestamps Bitcoin Anchoring Works](https://getproofsnap.com/posts/blockchain-timestamping.html)
- [Chainpoint — Blockchain Proof & Anchoring Standard](https://chainpoint.org/)
- [Metaplex Core — What is a Core Asset](https://www.metaplex.com/docs/smart-contracts/core/what-is-an-asset)
- [Metaplex Core — Permanent Freeze Delegate plugin](https://developers.metaplex.com/core/plugins/permanent-freeze-delegate)
- [Metaplex Core — Updating Assets (update authority → None)](https://www.metaplex.com/docs/smart-contracts/core/update)
- [Solana Metaplex NFT Mutability and Provenance (Medium)](https://medium.com/@jacob_62353/solana-metaplex-nft-mutability-and-provenance-29b810ad06aa)
- [Flow/Dapper — Moving NBA Top Shot footage and artwork fully onchain](https://flow.com/post/how-nba-top-shot-is-moving-its-footage-and-artwork-fully-onchain)
- [Gemini Cryptopedia — What Is NBA Top Shot?](https://www.gemini.com/cryptopedia/nba-topshot-nft-flow-blockchain-nba-moments)
- [Creditcoin docs — Merkle Proving Transaction Inclusion (oracle attestation)](https://docs.creditcoin.org/usc/creditcoin-oracle-subsystems/proving/merkle-proving-transaction-inclusion)
- [Code Glimpse — Building a Verifiable Merkle-Map for Off-Chain Provenance Receipts](https://www.codeglimpse.com/posts/building-a-verifiable-merkle-map-for-off-chain-digital-provenance-receipts)
- [ArDrive — Arweave and NFT Metadata](https://ardrive.io/arweave-and-nft-metadata)
- [Solana docs — Attestations (Solana Attestation Service)](https://solana.com/docs/tools/attestations)
- [Solana Memo program docs](https://www.solana-program.com/docs/memo)

## Files read in ROOOT

`services/stands/src/relay.ts` · `services/stands/src/server.ts` (lines
590–810, crystallize + backfill) · `services/stands/src/seat/mint-scarf.ts` ·
`services/stands/src/mint/{cover,mint,collection,storage,metadata,relic-from-match}.ts` ·
`contracts/{sentiment,relic,match}.ts` · `contracts/normalize.ts` ·
`services/stands/src/sentiment/{builder,crystallize,accumulator}.ts` ·
`docs/SENTIMENT.md` · `docs/DATA.md` ·
`fixtures/provenance/messi-goal-tick-proof.json`
