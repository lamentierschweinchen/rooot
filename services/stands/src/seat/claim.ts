import type { Side } from '@contracts/crowd';

export interface ClaimRecord {
  pubkey: string;
  method: 'passkey' | 'privy';
  /** The fan's REAL rooted side, or null if they never rooted — never invented.
   * Side is exactly 'home' | 'away' (contracts/crowd.ts); no 'neutral' state exists
   * for a rooted fan (fixed from the your-seat branch's dead union member — a
   * flagged-but-never-applied Minor from its own final review). */
  side: Side | null;
  call: { home: number; away: number } | null;
  matchId: string;
  boundAtMs: number;
}
/** The slice of a live MatchState the bind needs: identity + read-only per-anonId
 * accessors (match-state.ts). Consuming the accessors — not the private maps —
 * lets a real MatchState satisfy this without exposing its internals. */
interface MatchLike {
  matchId: string;
  getRootedSide(anonId: string): Side | undefined;
  getPrediction(anonId: string): { home: number; away: number; atMs: number } | undefined;
}
export function bindClaim(match: MatchLike, anonId: string, pubkey: string, method: 'passkey' | 'privy', nowMs: number): ClaimRecord {
  const side = match.getRootedSide(anonId) ?? null;
  const pred = match.getPrediction(anonId);
  const call = pred ? { home: pred.home, away: pred.away } : null;
  return { pubkey, method, side, call, matchId: match.matchId, boundAtMs: nowMs };
}
