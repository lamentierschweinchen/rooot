import type { Side } from '@contracts/crowd';

export interface ClaimRecord {
  pubkey: string;
  method: 'passkey' | 'privy';
  side: 'home' | 'away' | 'neutral' | null;
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
