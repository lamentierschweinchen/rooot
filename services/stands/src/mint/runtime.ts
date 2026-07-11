/**
 * Lazily builds (ONCE per process) the umi instance + scarf collection the live claim route
 * mints with — mirrors proveRelicMint.ts's umi setup (`createUmi` → `mplCore()` →
 * `irysUploader()` → `loadOrCreateMintKeypair` → `signerIdentity`), but memoized so a claim
 * doesn't re-pay that setup cost (client construction, the collection ensure/fetch round-trip)
 * on every request (Task 6b step 4: "build the umi/keypair once per process if practical").
 * Devnet only — relic minting never runs on mainnet (mint/config.ts).
 */
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { createSignerFromKeypair, signerIdentity, type Umi } from '@metaplex-foundation/umi';
import { networkFor, type MintCluster } from './config';
import { loadOrCreateMintKeypair } from './keypair';
import { ensureScarfCollection, type ScarfCollectionRef } from './collection';

export interface MintRuntime {
  umi: Umi;
  cluster: MintCluster;
  collection: ScarfCollectionRef;
}

const CLUSTER: MintCluster = 'devnet';

let runtimePromise: Promise<MintRuntime> | null = null;

async function buildRuntime(): Promise<MintRuntime> {
  const net = networkFor(CLUSTER);
  const rpcUrl = process.env.MINT_DEVNET_RPC || net.rpcUrl;
  const umi = createUmi(rpcUrl).use(mplCore()).use(irysUploader({ address: net.irysAddress }));
  const keypair = loadOrCreateMintKeypair(umi);
  umi.use(signerIdentity(createSignerFromKeypair(umi, keypair)));
  const collection = await ensureScarfCollection(umi, CLUSTER);
  console.log(`[mint] runtime ready — payer ${keypair.publicKey}, collection ${String(collection.publicKey)}`);
  return { umi, cluster: CLUSTER, collection };
}

/**
 * The first caller pays the umi/collection setup cost; every claim after reuses it. A FAILED
 * build is not cached — e.g. a transient RPC hiccup on the first claim after a process boot
 * shouldn't wedge every future mint for the rest of the process's life; the next claim retries.
 */
export function getMintRuntime(): Promise<MintRuntime> {
  if (!runtimePromise) {
    runtimePromise = buildRuntime().catch((err) => {
      runtimePromise = null;
      throw err;
    });
  }
  return runtimePromise;
}
