/**
 * END-TO-END DEVNET OWNED-MINT PROOF — run with:
 *   cd services/stands && npx tsx src/mint/scripts/proveOwnedMint.ts
 *
 * Clone of `proveRelicMint.ts` that proves the custody split ROOOT's "YOUR SEAT" identity layer
 * depends on: the SERVICE keypair pays + signs the mint, but the minted Metaplex Core asset is
 * OWNED by an arbitrary pubkey — here, a throwaway "fan" keypair that is generated but NEVER
 * funded (proving the fan needs no SOL and no wallet interaction to receive the relic). It:
 *   1. loads/creates the same gitignored devnet mint key as proveRelicMint.ts (never production),
 *   2. ensures it has devnet SOL (airdrops once, or tells you to `solana airdrop` — no looping),
 *   3. builds a SAMPLE MatchRelicData (POR vs ESP) with a generated branded ROOOT-palette PNG,
 *      labeled a PROOF and marked live:false (honest — the data is synthetic, not verifiable),
 *   4. funds Irys (devnet) and uploads cover + metadata to Arweave,
 *   5. generates a throwaway "fan" keypair and mints a Metaplex Core NFT on DEVNET OWNED by it,
 *      with the service identity as fee payer,
 *   6. fetches the asset back on-chain and asserts its owner is the fan pubkey (not the service),
 *   7. prints the asset + signature + explorer links.
 *
 * Security: DEVNET ONLY. Only ever touches devnet and the local gitignored mint key. The fan
 * keypair is generated in-memory, never persisted, never funded, and its secret is never logged —
 * only its public key. No secret bytes are ever logged; RPC api-keys are redacted. The mainnet
 * path is never built.
 */
import zlib from 'node:zlib';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore, fetchAsset } from '@metaplex-foundation/mpl-core';
import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import {
  createSignerFromKeypair,
  generateSigner,
  signerIdentity,
  sol,
  type SolAmount,
  type Umi,
} from '@metaplex-foundation/umi';
import type { MatchRelicData } from '@contracts/relic';
import { uploadRelic } from '../storage';
import { mintRelic } from '../mint';
import { networkFor } from '../config';
import { buildRelicTitle } from '../metadata';
import { loadOrCreateMintKeypair } from '../keypair';

const fmt = (a: SolAmount): string => (Number(a.basisPoints) / 1e9).toFixed(6);
const redactRpc = (u: string): string => u.replace(/api-key=[^&]+/gi, 'api-key=***');

/* ── branded cover PNG (ROOOT palette, node zlib only — no image deps) ─────────────────────────── */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
/**
 * A branded press-black → poppy diagonal gradient PNG (the ROOOT palette), generated with node
 * zlib — no deps. press-black #1A1A18 (26,26,24) → poppy #C8504D (200,80,77).
 */
function makeCoverPng(w = 640, h = 640): Uint8Array {
  const from = { r: 0x1a, g: 0x1a, b: 0x18 }; // press-black
  const to = { r: 0xc8, g: 0x50, b: 0x4d }; // poppy
  const raw = Buffer.alloc((w * 4 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const t = (x / w + y / h) / 2; // diagonal
      raw[o++] = Math.round(from.r + (to.r - from.r) * t);
      raw[o++] = Math.round(from.g + (to.g - from.g) * t);
      raw[o++] = Math.round(from.b + (to.b - from.b) * t);
      raw[o++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  return Uint8Array.from(png);
}

/* ── sample relic (synthetic — honestly labeled a proof) ───────────────────────────────────────── */

function buildSampleRelic(): MatchRelicData {
  const now = Date.now();
  const kickoffISO = new Date(now - 105 * 60_000).toISOString(); // ~105 min ago
  const bucketSec = 60;
  const buckets = 6;
  const zeros = (): number[] => new Array(buckets).fill(0);
  const emptyPulse = () => ({
    belief: zeros(),
    nerves: zeros(),
    rage: zeros(),
  });
  return {
    fixture: {
      id: 'proof-por-esp-owned',
      home: { code: 'POR', name: 'Portugal', colors: ['#C8504D', '#1A1A18'], flag: '🇵🇹' },
      away: { code: 'ESP', name: 'Spain', colors: ['#E8B84B', '#1A1A18'], flag: '🇪🇸' },
      kickoffISO,
      venue: 'Devnet Arena',
    },
    finalScore: { home: 2, away: 1 },
    oddsPath: [
      { tMs: now - 100 * 60_000, minute: 5, pHome: 0.38, pDraw: 0.30, pAway: 0.32 },
      { tMs: now - 60 * 60_000, minute: 44, pHome: 0.52, pDraw: 0.27, pAway: 0.21 },
      { tMs: now - 20 * 60_000, minute: 78, pHome: 0.61, pDraw: 0.24, pAway: 0.15 },
    ],
    goals: [
      { minute: 23, side: 'home', scorer: 'Sample A' },
      { minute: 58, side: 'away', scorer: 'Sample B' },
      { minute: 81, side: 'home', scorer: 'Sample C' },
    ],
    crowd: {
      bucketSec,
      roar: { home: [2, 5, 9, 4, 7, 12], away: [1, 3, 6, 8, 2, 3] },
      pulse: { home: emptyPulse(), away: emptyPulse() },
    },
    verdict: {
      scores: {
        home: { loudness: 71, faith: 64, presence: 58, foresight: 40 },
        away: { loudness: 55, faith: 49, presence: 52, foresight: 33 },
      },
      winner: 'home',
    },
    provenance: {
      txlineRefs: [],
      attendeeRoot: '',
      network: 'devnet',
      fromMs: now - 105 * 60_000,
      toMs: now,
    },
  };
}

/* ── irys uploader (the irys-specific methods umi.uploader exposes) ────────────────────────────── */

interface IrysUploader {
  getBalance(): Promise<SolAmount>;
  fund(amount: SolAmount, skipBalanceCheck: boolean): Promise<void>;
  getUploadPriceFromBytes(bytes: number): Promise<SolAmount>;
}

async function ensureIrysFunded(umi: Umi, bytes: number): Promise<void> {
  const up = umi.uploader as unknown as IrysUploader;
  const price = await up.getUploadPriceFromBytes(bytes);
  const balance = await up.getBalance();
  console.log(`• irys balance ${fmt(balance)} SOL, est. price ${fmt(price)} SOL`);
  if (balance.basisPoints < price.basisPoints) {
    const top = sol(0.02); // devnet is cheap; a small top-up covers several MB
    console.log(`• funding irys node with ${fmt(top)} SOL…`);
    await up.fund(top, false);
  }
}

/* ── main ──────────────────────────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const net = networkFor('devnet');
  const rpcUrl = process.env.MINT_DEVNET_RPC || net.rpcUrl;
  console.log(`\nROOOT relic OWNED-mint devnet proof\n  rpc:  ${redactRpc(rpcUrl)}\n  irys: ${net.irysAddress}\n`);

  const umi = createUmi(rpcUrl).use(mplCore()).use(irysUploader({ address: net.irysAddress }));
  const keypair = loadOrCreateMintKeypair(umi);
  umi.use(signerIdentity(createSignerFromKeypair(umi, keypair)));
  console.log(`• payer (service): ${keypair.publicKey}`);

  // Ensure devnet SOL. Single airdrop attempt — DO NOT loop on rate limits.
  let balance = await umi.rpc.getBalance(keypair.publicKey);
  console.log(`• balance: ${fmt(balance)} SOL`);
  if (balance.basisPoints < sol(0.3).basisPoints) {
    console.log('• requesting devnet airdrop (2 SOL)…');
    try {
      await umi.rpc.airdrop(keypair.publicKey, sol(2));
      balance = await umi.rpc.getBalance(keypair.publicKey);
      console.log(`• balance after airdrop: ${fmt(balance)} SOL`);
    } catch {
      console.warn('• airdrop failed (rate limit?). Fund manually then re-run:');
      console.warn(`    solana airdrop 2 ${keypair.publicKey} --url devnet`);
    }
    if (balance.basisPoints < sol(0.05).basisPoints) {
      console.error(
        `\n✗ Insufficient devnet SOL. Airdrop rate-limited.\n` +
          `  Fund the payer and re-run:\n    solana airdrop 2 ${keypair.publicKey} --url devnet\n`,
      );
      process.exit(2);
    }
  }

  // Build the SAMPLE relic + branded cover. Synthetic ⇒ live:false (honest).
  const relic = buildSampleRelic();
  const cover = makeCoverPng();
  const capturedAtISO = new Date().toISOString();
  const title = buildRelicTitle(relic, /* live */ false);

  // Fund Irys for the payload, then upload cover + metadata.
  await ensureIrysFunded(umi, cover.length + 8192);
  console.log('• uploading to Arweave via Irys…');
  const uris = await uploadRelic({ bytes: cover, mime: 'image/png' }, relic, umi, {
    imageUri: '', // overwritten by storage after the cover upload
    mime: 'image/png',
    live: false, // SYNTHETIC sample — never asserted as verifiable
    capturedAtISO,
    title,
    onProgress: (m) => console.log(`   ${m}`),
    metaTransform: (md) => ({
      ...md,
      description: `[ROOOT relic devnet OWNED-mint-pipeline PROOF — synthetic sample data, not a live capture.] ${md.description}`,
    }),
  });
  console.log(`• image:    ${uris.imageUri}`);
  console.log(`• metadata: ${uris.metadataUri}`);

  // Generate a throwaway "fan" keypair — never funded, never persisted. The service pays and
  // signs the mint; the fan only ever needs to exist as a pubkey to receive custody of the asset.
  const fan = generateSigner(umi); // the "fan" owns it; never funded
  console.log(`• fan (owner, unfunded): ${fan.publicKey}`);

  // Mint on devnet, OWNED by the fan, paid by the service identity.
  console.log('• minting Metaplex Core relic on devnet, owned by fan…');
  const result = await mintRelic(relic, uris, umi, 'devnet', String(fan.publicKey));

  // Read the asset back on-chain and assert custody actually landed on the fan, not the service.
  const onchain = await fetchAsset(umi, result.asset);
  if (String(onchain.owner) !== String(fan.publicKey)) {
    throw new Error(`owner mismatch: ${onchain.owner} !== ${fan.publicKey}`);
  }

  console.log(
    `\nOK asset ${result.asset} owned by fan ${fan.publicKey}, paid by service ${umi.identity.publicKey}`,
  );
  console.log(`  signature: ${result.signature}`);
  console.log(`  explorer:  ${result.explorerUrl}`);
  console.log(`  tx:        ${result.txUrl}\n`);
}

main().catch((e) => {
  console.error('\n✗ proof failed:', e);
  process.exit(1);
});
