/**
 * Irys (Arweave pinner) top-up — factored out of the proof scripts' local `ensureIrysFunded` so
 * the live claim-mint path (seat/mint-scarf.ts, mint/collection.ts) can share it too. Kept as its
 * own leaf module (no imports from collection.ts/runtime.ts) so those two can both depend on this
 * without a require cycle between them.
 */
import { sol, type SolAmount, type Umi } from '@metaplex-foundation/umi';

/** The irys-specific methods umi.uploader exposes (not part of the generic UploaderInterface). */
interface IrysUploaderLike {
  getBalance(): Promise<SolAmount>;
  fund(amount: SolAmount, skipBalanceCheck: boolean): Promise<void>;
  getUploadPriceFromBytes(bytes: number): Promise<SolAmount>;
}

/**
 * Top up the umi identity's Irys balance if it can't already cover an upload of `bytes` size.
 * Devnet is cheap; a small top-up covers several MB (mirrors proveRelicMint.ts's local helper).
 */
export async function ensureIrysFunded(umi: Umi, bytes: number): Promise<void> {
  const up = umi.uploader as unknown as IrysUploaderLike;
  const price = await up.getUploadPriceFromBytes(bytes);
  const balance = await up.getBalance();
  if (balance.basisPoints < price.basisPoints) {
    await up.fund(sol(0.02), false);
  }
}
