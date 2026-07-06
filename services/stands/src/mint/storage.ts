/**
 * Phase 2 — permanent storage on Arweave via Irys (pay-once: "kept forever").
 *
 * Ported from STRATA's `src/mint/storage.ts`. Relics carry NO audio, so this uploads only the
 * COVER (png) and then the METADATA json (which references the cover). It takes a fully-built `umi`
 * (the devnet proof builds it with a keypair + the node uploader; a browser would build it with a
 * wallet identity + the web uploader).
 */
import { createGenericFile, type Umi } from '@metaplex-foundation/umi';
import type { MatchRelicData } from '@contracts/relic';
import { buildRelicMetadata, type BuildRelicMetadataOptions, type RelicMetadata } from './metadata';

export type Progress = (msg: string) => void;

export interface UploadedRelicUris {
  imageUri: string;
  metadataUri: string;
}

export interface UploadRelicOptions extends BuildRelicMetadataOptions {
  onProgress?: Progress;
  /** Optional last-mile edit of the metadata before upload (e.g. the devnet proof labels itself). */
  metaTransform?: (m: RelicMetadata) => RelicMetadata;
}

export interface CoverBytes {
  bytes: Uint8Array;
  mime: string;
}

/**
 * Upload cover → metadata to Arweave. Returns the two gateway URIs.
 *
 * `opts` carries the metadata build options (live flag, edition, capturedAt, …) so the honesty
 * rule is decided at the call site. `imageUri` in those options is overwritten with the just-
 * uploaded cover URI.
 */
export async function uploadRelic(
  cover: CoverBytes,
  relic: MatchRelicData,
  umi: Umi,
  opts: UploadRelicOptions,
): Promise<UploadedRelicUris> {
  const onProgress = opts.onProgress;

  onProgress?.('Uploading cover…');
  const coverFile = createGenericFile(cover.bytes, 'cover.png', {
    contentType: cover.mime,
    tags: [{ name: 'Content-Type', value: cover.mime }],
  });
  const [imageUri] = await umi.uploader.upload([coverFile]);
  if (!imageUri) throw new Error('cover upload returned no URI');

  onProgress?.('Uploading metadata…');
  const base = buildRelicMetadata(relic, { ...opts, imageUri, mime: cover.mime });
  const metadata = opts.metaTransform ? opts.metaTransform(base) : base;
  const metadataUri = await umi.uploader.uploadJson(metadata);

  return { imageUri, metadataUri };
}
