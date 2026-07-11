/**
 * ROOOT scarf collection (Task 6b step 1) — ONE Metaplex Core collection every minted scarf
 * belongs to, so shapeAlbum's DAS `getAssetsByOwner` grouping filter (seat/album.ts,
 * `ROOOT_SCARF_COLLECTION`) can tell a ROOOT scarf apart from anything else in a fan's wallet.
 * Without this, that filter FAILS OPEN (progress.md Task 5 note) — every asset a fan owns would
 * show up in their album, not just their scarves. Devnet only (mint/config.ts).
 *
 * Created ONCE (mpl-core `createCollection`), then cached: `ROOOT_SCARF_COLLECTION` env wins if
 * set (e.g. pinned for production), else a gitignored file under `.secrets/` (mirrors
 * keypair.ts's mint-devnet.json convention) so a restarted process reuses the same collection
 * instead of minting a fresh one every boot.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createCollection, fetchCollectionV1, type CollectionV1 } from '@metaplex-foundation/mpl-core';
import { generateSigner, publicKey, type Umi } from '@metaplex-foundation/umi';
import type { MintCluster } from './config';
import { ensureIrysFunded } from './irys-fund';
import { MINT_SECRET_DIR } from './keypair';

/** The minimal collection shape mpl-core's `create()` wants for its `collection` arg — a narrow
 * Pick so mint.ts doesn't need to import the SDK's full account type. */
export type ScarfCollectionRef = Pick<CollectionV1, 'publicKey' | 'oracles' | 'lifecycleHooks'>;

const COLLECTION_CACHE_FILE =
  process.env.ROOOT_SCARF_COLLECTION_CACHE || path.join(MINT_SECRET_DIR, 'scarf-collection-devnet.json');

interface CollectionCache {
  address: string;
  cluster: MintCluster;
  createdAtISO: string;
}

function readCache(): CollectionCache | null {
  try {
    return JSON.parse(fs.readFileSync(COLLECTION_CACHE_FILE, 'utf8')) as CollectionCache;
  } catch {
    return null; // absent/malformed — treated the same as "not created yet"
  }
}

function writeCache(entry: CollectionCache): void {
  fs.mkdirSync(MINT_SECRET_DIR, { recursive: true });
  fs.writeFileSync(COLLECTION_CACHE_FILE, JSON.stringify(entry, null, 2));
}

/**
 * Sync, no-RPC resolution of "which collection do ROOOT scarves belong to" — env first, then the
 * SAME on-disk cache `ensureScarfCollection` writes. seat/album.ts's DAS filter calls this (instead
 * of reading `process.env.ROOOT_SCARF_COLLECTION` itself) so the album route always agrees with
 * the mint route on which collection to trust — including the very first claim in a process's
 * life, which is the one that CREATES the collection and writes the cache file. Without this, the
 * album filter would read `ROOOT_SCARF_COLLECTION` once at module load (before any collection
 * exists) and fail open for that process's entire lifetime even after a collection is minted into
 * (the exact pre-launch gap progress.md's Task 5 notes flagged as "needs Task 6b collection").
 */
export function resolveScarfCollectionAddress(): string | null {
  return process.env.ROOOT_SCARF_COLLECTION || readCache()?.address || null;
}

/**
 * Idempotent: `ROOOT_SCARF_COLLECTION` env first, then the on-disk cache, else mint ONE new Core
 * collection and cache its address. Always FETCHES the on-chain account (rather than trusting a
 * bare remembered address) so the returned oracles/lifecycleHooks reflect real on-chain state —
 * this collection has neither, but fetching keeps the Pick honest instead of hand-waved empty.
 */
export async function ensureScarfCollection(umi: Umi, cluster: MintCluster): Promise<ScarfCollectionRef> {
  const known = resolveScarfCollectionAddress();
  if (known) return fetchCollectionV1(umi, publicKey(known));

  const collectionSigner = generateSigner(umi);
  // A tiny, REAL (not fabricated) collection-level metadata JSON — no cover image; the collection
  // itself is never rendered anywhere, only used to group scarves (seat/album.ts's collection filter).
  const metadataJson = {
    name: 'ROOOT Scarves',
    symbol: 'ROOOT',
    description: 'ROOOT scarves — one per fan who claimed a seat at a real match. Devnet.',
    external_url: 'https://rooot.club',
  };
  await ensureIrysFunded(umi, 1024);
  const uri = await umi.uploader.uploadJson(metadataJson);
  await createCollection(umi, { collection: collectionSigner, name: 'ROOOT Scarves', uri }).sendAndConfirm(umi);

  writeCache({ address: String(collectionSigner.publicKey), cluster, createdAtISO: new Date().toISOString() });
  console.log(`[mint] created scarf collection ${String(collectionSigner.publicKey)} (cached -> ${COLLECTION_CACHE_FILE})`);
  return fetchCollectionV1(umi, collectionSigner.publicKey);
}
