/**
 * Call relayer seam. Today: accept + validate shape, echo a pending receipt.
 * Tomorrow: sign + send a devnet memo tx (walletless, service-fee-paid) per
 * docs/ARCHITECTURE.md's on-chain table — payload = claim+minute+marketP hash.
 *
 * Clean seam on purpose: swap the body of relayCall, nothing else changes —
 * server.ts already awaits this and shapes CallReceiptMsg around the result.
 */
import type { CallMsg } from '@contracts/crowd';

/**
 * TODO(relayer): implement the real devnet memo tx.
 *  - build memo payload: sha256(`${call.claim}:${call.minute}:${JSON.stringify(call.marketP)}:${call.anonId}`)
 *    (exact hash recipe TBD by whoever lands the relayer — this is a stub, not a spec)
 *  - sign with the service wallet (.secrets/rooot-devnet.json), fee-paid by us
 *  - send + confirm on devnet, return the real tx signature
 *  - consider a small in-memory queue + retry so a devnet RPC hiccup doesn't
 *    drop a fan's call
 */
export async function relayCall(call: CallMsg): Promise<string> {
  void call;
  return 'PENDING-RELAYER';
}
