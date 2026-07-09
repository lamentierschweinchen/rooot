/**
 * Phase 3 — mint the relic as a Metaplex Core NFT (the current lightweight single-account standard).
 * `image` = the cover, `attributes` = the match facts, and the `rooot` provenance block (all already
 * written into the uploaded metadata JSON by storage.ts).
 *
 * Ported near-verbatim from STRATA's `src/mint/mint.ts`. Environment-agnostic: takes a fully-built
 * `umi` (must already have `mplCore()` registered and an identity set).
 */
import { create } from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey, type Umi } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';
import type { MatchRelicData } from '@contracts/relic';
import { buildOnChainName } from './metadata';
import { assetExplorerUrl, txExplorerUrl, type MintCluster } from './config';
import type { UploadedRelicUris } from './storage';

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
 * Create the Core asset pointing at the uploaded metadata. Returns the asset + signature + links.
 *
 * `owner` (optional): a base58 pubkey that should own the minted asset. When omitted, mpl-core
 * defaults ownership to the create authority (the `umi` identity — today's behavior). When
 * present, the asset is owned by that pubkey while `umi`'s identity still pays and signs — this is
 * how the service can mint a relic for a walletless fan without ever touching their keys.
 */
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
