/**
 * Phase 3 — mint the relic as a Metaplex Core NFT (the current lightweight single-account standard).
 * `image` = the cover, `attributes` = the match facts, and the `rooot` provenance block (all already
 * written into the uploaded metadata JSON by storage.ts).
 *
 * Ported near-verbatim from STRATA's `src/mint/mint.ts`. Environment-agnostic: takes a fully-built
 * `umi` (must already have `mplCore()` registered and an identity set).
 */
import { create, type CreateArgs } from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey, type Signer, type Umi } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';
import type { MatchRelicData } from '@contracts/relic';
import { buildOnChainName } from './metadata';
import { assetExplorerUrl, txExplorerUrl, type MintCluster } from './config';
import type { UploadedRelicUris } from './storage';
import type { ScarfCollectionRef } from './collection';

/**
 * Core immutability (docs/DATA-ARCHITECTURE.md §4 adopt #5 — "yours forever"
 * becomes an on-chain fact, not just copy): PermanentFreezeDelegate, frozen at
 * CREATE time. Verified against the INSTALLED @metaplex-foundation/mpl-core
 * API (package.json pins 1.10.0; read from node_modules/@metaplex-foundation/
 * mpl-core/dist/src, not memory):
 *   · plugins/types.d.ts puts `PermanentFreezeDelegate` in `CreateOnlyPluginArgsV2`
 *     — the SDK's own name for plugins that can ONLY be set at creation and can
 *     never be removed or reauthorized afterward (no separate authority retains
 *     the power to un-freeze it later — genuinely permanent, not just default-on).
 *   · instructions/create.js shows first-party plugins (this one included) are
 *     encoded straight into createV2's OWN instruction data (`plugins: Option
 *     <Array<PluginAuthorityPair>>`) — no extra accounts, no second
 *     instruction: it lands in the exact same tx as the mint.
 * The OTHER named candidate, update-authority-None, was evaluated and rejected:
 * generated/instructions/createV2.d.ts's `updateAuthority` account only accepts
 * a `PublicKey | Pda`, never the `BaseUpdateAuthority` 'None' enum directly —
 * reaching 'None' requires a SEPARATE update() call (generated/instructions/
 * updateV2.d.ts's `newUpdateAuthority`), built from a hand-faked pre-mint
 * AssetV1 shape (the real one doesn't exist on-chain until THIS tx lands) —
 * exactly the "second tx / breaking flow change" this task says to avoid on a
 * demo-critical path. PermanentFreezeDelegate is therefore the one of the two
 * that "the Metaplex Core API supports cleanly, in the same tx."
 */
const IMMUTABILITY_PLUGINS: NonNullable<CreateArgs['plugins']> = [{ type: 'PermanentFreezeDelegate', frozen: true }];

/** The result of a successful relic mint. */
export interface RelicMintResult {
  /** The new Core asset address (the relic NFT). */
  asset: string;
  /** The mint transaction signature. */
  signature: string;
  cluster: MintCluster;
  /** Ready-to-open explorer link for the asset. */
  explorerUrl: string;
  /** Explorer link for the mint transaction. */
  txUrl: string;
  uris: UploadedRelicUris;
}

/**
 * Pure: the exact args mintRelic passes to mpl-core's create() — split out so a dev check can
 * assert the built params (the immutability plugin, name, uri, owner, collection) WITHOUT a live
 * devnet write (services/stands/src/dev/*-check.ts convention: automated checks never touch
 * devnet — see seat-check.ts's post-restart-TRUE-score comment). mintRelic calls this SAME
 * function, so a check importing it is asserting the real wiring, not a re-derived copy.
 */
export function buildCreateArgs(
  asset: Signer,
  relic: MatchRelicData,
  metadataUri: string,
  owner?: string,
  collection?: ScarfCollectionRef,
): CreateArgs {
  return {
    asset,
    name: buildOnChainName(relic),
    uri: metadataUri,
    plugins: IMMUTABILITY_PLUGINS,
    ...(owner ? { owner: publicKey(owner) } : {}),
    ...(collection ? { collection } : {}),
  };
}

/**
 * Create the Core asset pointing at the uploaded metadata. Returns the asset + signature + links.
 *
 * `owner` (optional): a base58 pubkey that should own the minted asset. When omitted, mpl-core
 * defaults ownership to the create authority (the `umi` identity — today's behavior). When
 * present, the asset is owned by that pubkey while `umi`'s identity still pays and signs — this is
 * how the service can mint a relic for a walletless fan without ever touching their keys.
 *
 * `collection` (optional, Task 6b): places the asset inside a Metaplex Core collection (see
 * mint/collection.ts's `ensureScarfCollection`) so a DAS `getAssetsByOwner` grouping filter can
 * tell a ROOOT scarf apart from anything else a fan's wallet holds (seat/album.ts). `umi`'s
 * identity must be the collection's update authority (ensureScarfCollection creates it that way,
 * defaulting to the payer) — omitted, the asset mints uncollected exactly as before.
 *
 * Every mint carries IMMUTABILITY_PLUGINS (see the doc comment up top) in this SAME create() call
 * — the scarf is frozen (permanently non-transferable) from the instant it exists on-chain.
 */
export async function mintRelic(
  relic: MatchRelicData,
  uris: UploadedRelicUris,
  umi: Umi,
  cluster: MintCluster,
  owner?: string,
  collection?: ScarfCollectionRef,
): Promise<RelicMintResult> {
  const asset = generateSigner(umi);

  const tx = await create(umi, buildCreateArgs(asset, relic, uris.metadataUri, owner, collection)).sendAndConfirm(umi);

  const signature = base58.deserialize(tx.signature)[0];
  const address = String(asset.publicKey);

  return {
    asset: address,
    signature,
    cluster,
    explorerUrl: assetExplorerUrl(address, cluster),
    txUrl: txExplorerUrl(signature, cluster),
    uris,
  };
}
