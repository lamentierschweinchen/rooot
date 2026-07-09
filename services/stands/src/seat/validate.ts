/** Boundary guard for every client-supplied Solana pubkey (base58 shape, 32-44
 * chars, excludes the visually-ambiguous 0/O/I/l per base58 alphabet). Protects
 * mintRelic's publicKey() parse and profile-store's path construction
 * downstream — nothing reaches either without passing this first. */
const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidPubkey(s: string): boolean {
  return typeof s === 'string' && PUBKEY_RE.test(s);
}
