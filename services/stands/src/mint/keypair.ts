/**
 * Devnet keypair loading for the relic-mint proof — modeled on STRATA's `loadOrCreateKeypair` and
 * ROOOT's `services/stands/src/relay.ts` key-loading pattern.
 *
 * SECURITY:
 *  - This loads a SEPARATE, gitignored devnet key at `services/stands/.secrets/mint-devnet.json`
 *    (override via `MINT_DEVNET_KEYPAIR`). It is generated if absent.
 *  - It DELIBERATELY does NOT use the production relayer key (`.secrets/rooot-devnet.json`) — the
 *    mint proof pays with a throwaway devnet payer, never the service's on-chain identity.
 *  - Key material is read in-process and NEVER logged. Only the public key is ever printed.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Keypair, Umi } from '@metaplex-foundation/umi';

/** The dedicated, gitignored devnet mint key. Lives under services/stands/.secrets/. */
export const MINT_SECRET_DIR = path.resolve('.secrets');
export const MINT_KEYPAIR_FILE =
  process.env.MINT_DEVNET_KEYPAIR || path.join(MINT_SECRET_DIR, 'mint-devnet.json');

/**
 * Load the devnet mint keypair into `umi`, generating and persisting a fresh one if the file does
 * not exist. Returns the umi Keypair. NEVER logs secret bytes.
 */
export function loadOrCreateMintKeypair(umi: Umi): Keypair {
  if (fs.existsSync(MINT_KEYPAIR_FILE)) {
    const secret = Uint8Array.from(JSON.parse(fs.readFileSync(MINT_KEYPAIR_FILE, 'utf8')) as number[]);
    return umi.eddsa.createKeypairFromSecretKey(secret);
  }
  const kp = umi.eddsa.generateKeypair();
  fs.mkdirSync(MINT_SECRET_DIR, { recursive: true });
  // 0600 — owner-only, defense in depth even though the dir is gitignored.
  fs.writeFileSync(MINT_KEYPAIR_FILE, JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
  console.log(`• generated devnet mint keypair → ${MINT_KEYPAIR_FILE} (gitignored)`);
  return kp;
}
