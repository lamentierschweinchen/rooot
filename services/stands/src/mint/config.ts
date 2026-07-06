/**
 * Relic-mint configuration — the two Solana clusters we can mint relics on, the Irys nodes that
 * store the bytes, explorer link builders, and the project attribution.
 *
 * Ported from STRATA's `src/mint/config.ts`, adapted for a NODE service: it reads `process.env`
 * (not `import.meta.env`). DEVNET is the default everywhere. MAINNET is gated behind an explicit
 * opt-in flag (`MINT_ALLOW_MAINNET=true`) and is never exercised by this service — the relic mint
 * runs on devnet only. No key is ever embedded here.
 *
 * Dependency-free.
 */

export type MintCluster = 'devnet' | 'mainnet-beta';

export interface MintNetwork {
  cluster: MintCluster;
  /** Solana JSON-RPC endpoint umi talks to. */
  rpcUrl: string;
  /** Irys node that pins to Arweave. Devnet uses devnet SOL; mainnet uses real SOL. */
  irysAddress: string;
}

/** `?cluster=` param to a Solana-Explorer query suffix. Devnet needs the suffix; mainnet omits it. */
function explorerClusterSuffix(cluster: MintCluster): string {
  return cluster === 'mainnet-beta' ? '' : '?cluster=devnet';
}

// Node service: read process.env directly (STRATA read import.meta.env for its Vite browser build).
const ENV: Record<string, string | undefined> = process.env;

const DEVNET: MintNetwork = {
  cluster: 'devnet',
  rpcUrl: ENV.MINT_DEVNET_RPC || 'https://api.devnet.solana.com',
  irysAddress: ENV.MINT_IRYS_DEVNET || 'https://devnet.irys.xyz',
};

const MAINNET: MintNetwork = {
  cluster: 'mainnet-beta',
  // Gated + never exercised by this service. The public mainnet RPC is heavily rate-limited; a real
  // mint would set MINT_MAINNET_RPC to a provider URL. Kept for parity with STRATA; do not use.
  rpcUrl: ENV.MINT_MAINNET_RPC || 'https://api.mainnet-beta.solana.com',
  irysAddress: ENV.MINT_IRYS_MAINNET || 'https://uploader.irys.xyz',
};

export function networkFor(cluster: MintCluster): MintNetwork {
  return cluster === 'mainnet-beta' ? { ...MAINNET } : { ...DEVNET };
}

/**
 * Mainnet is allowed only when explicitly opted in. This service NEVER exercises the mainnet path —
 * the constant exists for parity with STRATA and stays off. Relic minting is devnet-only.
 */
export const MAINNET_ALLOWED: boolean =
  (ENV.MINT_ALLOW_MAINNET || '').toLowerCase() === 'true';

/** Explorer link for a minted asset (the relic NFT), on the cluster it was minted on. */
export function assetExplorerUrl(address: string, cluster: MintCluster): string {
  return `https://explorer.solana.com/address/${address}${explorerClusterSuffix(cluster)}`;
}

/** Explorer link for a transaction, on the cluster it landed on. */
export function txExplorerUrl(signature: string, cluster: MintCluster): string {
  return `https://explorer.solana.com/tx/${signature}${explorerClusterSuffix(cluster)}`;
}

/**
 * Verify link for a REAL chain transaction (e.g. a call receipt or an anchor tx). Points at the
 * public explorers; the cluster suffix reflects where the relic's provenance transactions landed.
 */
export function txlineExplorerUrl(signature: string, cluster: MintCluster): string {
  return `https://explorer.solana.com/tx/${signature}${explorerClusterSuffix(cluster)}`;
}
export function solscanTxUrl(signature: string, cluster: MintCluster): string {
  return cluster === 'mainnet-beta'
    ? `https://solscan.io/tx/${signature}`
    : `https://solscan.io/tx/${signature}?cluster=devnet`;
}

/** The public site the relic points back to. */
export const SITE_URL = 'https://rooot.club';

/** The project attribution stamped into every relic. */
export const ATTRIBUTION = 'ROOOT · rooot.club';

/** On-chain collection symbol. */
export const SYMBOL = 'ROOOT';

/** Versioned spec tag stamped into metadata, so a reader knows how to interpret the `rooot` block. */
export const SPEC = 'rooot-relic/1';
